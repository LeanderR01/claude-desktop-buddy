const { app, BrowserWindow, Tray, Menu, screen, powerMonitor, nativeImage, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ical = require('./lib/ical');

let win = null;
let tray = null;
let paused = false;
let tickTimer = null;
let dogVisible = false;
let quietUntil = 0; // manual "quiet for 1 hour"
let quietNow = false;
const timers = [];

// Cursor polling: fast while the buddy is on screen (it chases the cursor),
// slow while hidden (only the idle time matters then).
const TICK_ACTIVE_MS = 80;
const TICK_HIDDEN_MS = 1000;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ---- files ----
const userData = () => app.getPath('userData');
const CONFIG_PATH = () => path.join(userData(), 'config.json');
const STATE_PATH = () => path.join(userData(), 'state.json');
const EVENTS_PATH = () => path.join(userData(), 'claude-events.jsonl');
const LOG_PATH = () => path.join(userData(), 'buddy.log');

const DEFAULT_CONFIG = {
  // Obsidian vault (or any notes folder), used for the daily note nudge.
  // Empty string disables the nudge. Example: '/Users/you/Documents/MyVault'
  vaultPath: '',
  dailyNotesFolder: 'Daily Notes',
  dailyNoteNudgeHour: 18, // -1 disables
  // Google Calendar > Settings > your calendar > "Secret address in iCal format"
  calendarIcsUrl: '',
  calendarLeadMinutes: 5,
  calendarRefreshMinutes: 5,
  // desk timers, minutes of continuous activity (a 5 minute break resets). 0 disables
  stretchAfterMinutes: 50,
  coffeeAfterMinutes: 180,
  // no random visits during these windows, e.g. ["09:00-12:00", "14:00-16:00"]
  quietHours: [],
  hotkey: 'Control+Alt+C',
  // Claude Code "done" visits only when you are not at the keyboard anyway
  claudeDoneOnlyWhenAway: true,
  claudeAwaySeconds: 20,
  fridayWrapHour: 18, // -1 disables
};
let config = { ...DEFAULT_CONFIG };
let state = { lastDailyNudge: '', lastWeekWrap: '', firedCalendar: {} };

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log('[buddy] ' + msg);
  try {
    if (fs.existsSync(LOG_PATH()) && fs.statSync(LOG_PATH()).size > 500000) fs.writeFileSync(LOG_PATH(), '');
    fs.appendFileSync(LOG_PATH(), line + '\n');
  } catch (_e) {
    /* logging is best effort */
  }
}
function readJson(p, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (_e) {
    return { ...fallback };
  }
}
function writeJson(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  } catch (e) {
    log('write failed ' + p + ': ' + e.message);
  }
}
function loadConfig() {
  config = readJson(CONFIG_PATH(), DEFAULT_CONFIG);
  if (!fs.existsSync(CONFIG_PATH())) writeJson(CONFIG_PATH(), config);
}
function loadState() {
  state = readJson(STATE_PATH(), state);
  if (!state.firedCalendar) state.firedCalendar = {};
}
function saveState() {
  writeJson(STATE_PATH(), state);
}
function trunc(s, n = 40) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function sendEvent(kind, text, sticky = false) {
  if (paused) return;
  log(`event ${kind}: ${text}`);
  send('event', { kind, text, sticky });
}

// ---- window ----
function cursorDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

// macOS refuses to place the window top above the menu bar: setBounds with the
// full display bounds keeps the height but shifts the window down, so the
// bottom strip of the window hangs below the visible screen. The renderer must
// treat only this height as usable, otherwise the buddy walks along an
// invisible floor under the screen edge.
function visibleHeight(d, winY) {
  const y = winY !== undefined ? winY : Math.max(d.bounds.y, d.workArea.y);
  return d.bounds.y + d.bounds.height - y;
}

function createWindow() {
  const d = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The window is hidden most of the time; keep timers running so the
      // renderer can still decide when the buddy should appear next.
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true); // clicks pass through to whatever is below
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.BUDDY_TEST) {
    win.webContents.on('did-finish-load', () => send('test-mode', true));
  }
}

// Renderer tells us when there is something to draw. Before showing, the
// window is moved to the display the cursor is on (1 or 2 external monitors
// work without any coordinate juggling in the renderer).
ipcMain.on('rlog', (_e, m) => log('renderer: ' + m));

ipcMain.on('set-visible', (_e, visible) => {
  if (!win || win.isDestroyed()) return;
  dogVisible = !!visible;
  if (dogVisible && !paused) {
    win.setBounds(cursorDisplay().bounds);
    win.showInactive();
  } else {
    win.hide();
  }
  startTicks();
  if (process.env.BUDDY_TEST) log(`buddy ${dogVisible ? 'shown' : 'hidden'}, window visible=${win.isVisible()}`);
});

function startTicks() {
  if (tickTimer) clearInterval(tickTimer);
  const every = dogVisible ? TICK_ACTIVE_MS : TICK_HIDDEN_MS;
  tickTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const idle = powerMonitor.getSystemIdleTime();
    activityCheck(idle);
    if (paused) return;
    const p = screen.getCursorScreenPoint();
    let b, dh;
    if (dogVisible) {
      b = win.getBounds();
      dh = visibleHeight(screen.getDisplayMatching(b), b.y);
    } else {
      const d = cursorDisplay();
      b = d.bounds;
      dh = visibleHeight(d);
    }
    send('tick', { x: p.x - b.x, y: p.y - b.y, idle, dw: b.width, dh });
  }, every);
}

// ---- desk timers: stretch + coffee ----
let activeSince = Date.now();
let lastStretch = 0;
let coffeeFired = false;
function activityCheck(idle) {
  const now = Date.now();
  if (idle >= 300) {
    // a real break resets everything
    activeSince = now;
    lastStretch = 0;
    coffeeFired = false;
    return;
  }
  const active = (now - activeSince) / 1000;
  if (config.coffeeAfterMinutes > 0 && !coffeeFired && active >= config.coffeeAfterMinutes * 60) {
    coffeeFired = true;
    lastStretch = now;
    sendEvent('coffee', 'break. now.');
    return;
  }
  if (config.stretchAfterMinutes > 0 && active >= config.stretchAfterMinutes * 60 && now - lastStretch >= config.stretchAfterMinutes * 60000) {
    lastStretch = now;
    sendEvent('stretch', 'stretch break');
  }
}

// ---- Claude Code hooks ----
// scripts/claude-hook.sh appends each hook payload as one JSON line.
let eventsOffset = 0;
const lastClaudeVisit = { done: 0, needs: 0 };
function watchClaudeEvents() {
  const f = EVENTS_PATH();
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, '');
    eventsOffset = fs.statSync(f).size;
  } catch (e) {
    log('events file: ' + e.message);
    return;
  }
  fs.watchFile(f, { interval: 1000 }, (curr) => {
    if (curr.size < eventsOffset) eventsOffset = 0;
    if (curr.size === eventsOffset) return;
    try {
      const fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(curr.size - eventsOffset);
      fs.readSync(fd, buf, 0, buf.length, eventsOffset);
      fs.closeSync(fd);
      eventsOffset = curr.size;
      for (const line of buf.toString('utf8').split('\n')) handleClaudeLine(line);
      if (curr.size > 1000000) {
        fs.writeFileSync(f, '');
        eventsOffset = 0;
      }
    } catch (e) {
      log('events read: ' + e.message);
    }
  });
}
function handleClaudeLine(line) {
  line = line.trim();
  if (!line) return;
  let ev;
  try {
    ev = JSON.parse(line);
  } catch (_e) {
    return;
  }
  const now = Date.now();
  const proj = ev.cwd ? path.basename(ev.cwd) : 'claude';
  if (ev.hook_event_name === 'Notification') {
    if (now - lastClaudeVisit.needs < 30000) return;
    lastClaudeVisit.needs = now;
    const msg = String(ev.message || '').toLowerCase();
    const text = msg.includes('permission') ? `claude needs you: ${proj}` : `claude is waiting: ${proj}`;
    sendEvent('needs', trunc(text), true);
  } else if (ev.hook_event_name === 'Stop') {
    if (config.claudeDoneOnlyWhenAway && powerMonitor.getSystemIdleTime() < config.claudeAwaySeconds) return;
    if (now - lastClaudeVisit.done < 45000) return;
    lastClaudeVisit.done = now;
    sendEvent('done', trunc(`done: ${proj}`));
  }
}

// ---- daily note + friday wrap ----
function pad(n) {
  return String(n).padStart(2, '0');
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dailyCheck() {
  if (powerMonitor.getSystemIdleTime() > 120) return; // nobody there
  const d = new Date();
  const today = todayStr();
  if (config.vaultPath && config.dailyNoteNudgeHour >= 0 && d.getHours() >= config.dailyNoteNudgeHour && state.lastDailyNudge !== today) {
    const f = path.join(config.vaultPath, config.dailyNotesFolder, today + '.md');
    state.lastDailyNudge = today;
    saveState();
    if (!fs.existsSync(f)) sendEvent('daily', 'daily note? nothing yet.');
  }
  if (config.fridayWrapHour >= 0 && d.getDay() === 5 && d.getHours() >= config.fridayWrapHour && state.lastWeekWrap !== today) {
    state.lastWeekWrap = today;
    saveState();
    sendEvent('week', 'week done. go.');
  }
}

// ---- calendar (secret .ics address, fetched directly, nothing else involved) ----
let calEvents = [];
let calTimer = null;
async function calendarFetch() {
  if (!config.calendarIcsUrl) {
    calEvents = [];
    return;
  }
  try {
    const res = await fetch(config.calendarIcsUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    calEvents = ical.parse(await res.text());
    log(`calendar: ${calEvents.length} events loaded`);
  } catch (e) {
    log('calendar fetch failed: ' + e.message);
  }
}
function scheduleCalendarFetch() {
  if (calTimer) clearInterval(calTimer);
  const every = Math.max(1, config.calendarRefreshMinutes || 5) * 60000;
  calTimer = setInterval(calendarFetch, every);
  calendarFetch();
}
function calendarCheck() {
  if (!calEvents.length) return;
  const now = Date.now();
  const lead = config.calendarLeadMinutes * 60000;
  let changed = false;
  for (const o of ical.occurrences(calEvents, now - 3600000, now + 2 * 86400000)) {
    const key = o.uid + '@' + o.start;
    const delta = o.start - now;
    if (delta > -30000 && delta <= lead + 30000 && !state.firedCalendar[key]) {
      state.firedCalendar[key] = now;
      changed = true;
      const mins = Math.max(1, Math.round(delta / 60000));
      sendEvent('calendar', trunc(`in ${mins} min: ${o.summary}`, 44), true);
    }
  }
  if (changed) {
    for (const k of Object.keys(state.firedCalendar)) if (now - state.firedCalendar[k] > 3 * 86400000) delete state.firedCalendar[k];
    saveState();
  }
}

// ---- quiet hours ----
function inQuietHours() {
  if (quietUntil > Date.now()) return true;
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  for (const r of config.quietHours || []) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(r).trim());
    if (!m) continue;
    const a = +m[1] * 60 + +m[2];
    const b = +m[3] * 60 + +m[4];
    if (a <= b ? mins >= a && mins < b : mins >= a || mins < b) return true;
  }
  return false;
}
function quietCheck() {
  const q = inQuietHours();
  if (q !== quietNow) {
    quietNow = q;
    send('quiet', q);
    if (tray) tray.setContextMenu(buildTrayMenu());
  }
}

// ---- hotkey ----
let hotkeyRegistered = '';
function registerHotkey() {
  if (hotkeyRegistered) {
    globalShortcut.unregister(hotkeyRegistered);
    hotkeyRegistered = '';
  }
  if (!config.hotkey) return;
  try {
    const ok = globalShortcut.register(config.hotkey, () => {
      if (!paused) send('appear-now');
    });
    if (ok) hotkeyRegistered = config.hotkey;
    else log('hotkey already taken: ' + config.hotkey);
  } catch (e) {
    log('hotkey invalid: ' + e.message);
  }
}

// ---- config reload ----
function applyConfig() {
  registerHotkey();
  scheduleCalendarFetch();
  quietCheck();
}
function watchConfig() {
  fs.watchFile(CONFIG_PATH(), { interval: 2000 }, () => {
    loadConfig();
    applyConfig();
    log('config reloaded');
  });
}

// ---- tray ----
function buildTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  const preview = ['done', 'needs', 'calendar', 'daily', 'stretch', 'coffee', 'week'].map((kind) => ({
    label: kind,
    click: () => {
      const sample = {
        done: 'done: claude-buddy',
        needs: 'claude needs you: my-project',
        calendar: 'in 5 min: team standup',
        daily: 'daily note? nothing yet.',
        stretch: 'stretch break',
        coffee: 'break. now.',
        week: 'week done. go.',
      }[kind];
      sendEvent(kind, sample, kind === 'needs');
    },
  }));
  return Menu.buildFromTemplate([
    {
      label: 'Summon' + (hotkeyRegistered ? `  (${hotkeyRegistered.replace('Control', 'Ctrl')})` : ''),
      enabled: !paused,
      click: () => send('appear-now'),
    },
    { type: 'separator' },
    {
      label: 'Pause',
      type: 'checkbox',
      checked: paused,
      click: (item) => {
        paused = item.checked;
        if (paused) win.hide();
        send('paused', paused);
        tray.setContextMenu(buildTrayMenu());
      },
    },
    {
      label: 'Quiet for 1 hour',
      type: 'checkbox',
      checked: quietUntil > Date.now(),
      click: (item) => {
        quietUntil = item.checked ? Date.now() + 3600000 : 0;
        quietCheck();
        tray.setContextMenu(buildTrayMenu());
      },
    },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: login,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Open settings file', click: () => shell.openPath(CONFIG_PATH()) },
    { label: 'Open log', click: () => shell.openPath(LOG_PATH()) },
    { label: 'Preview event', submenu: preview },
    { type: 'separator' },
    { label: 'Quit Claude Buddy', click: () => app.quit() },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Claude Buddy');
  tray.setContextMenu(buildTrayMenu());
}

function firstRunSetup() {
  const marker = path.join(userData(), '.firstrun');
  if (!fs.existsSync(marker) && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
    try {
      fs.writeFileSync(marker, '1');
    } catch (_e) {
      /* not critical */
    }
  }
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  loadConfig();
  loadState();
  firstRunSetup();
  createWindow();
  createTray();
  startTicks();
  applyConfig();
  watchConfig();
  watchClaudeEvents();
  timers.push(setInterval(quietCheck, 30000));
  timers.push(setInterval(calendarCheck, 30000));
  timers.push(setInterval(dailyCheck, 60000));
  log('started');
});

app.on('before-quit', () => {
  if (tickTimer) clearInterval(tickTimer);
  if (calTimer) clearInterval(calTimer);
  for (const t of timers) clearInterval(t);
  globalShortcut.unregisterAll();
  fs.unwatchFile(CONFIG_PATH());
  fs.unwatchFile(EVENTS_PATH());
});

app.on('window-all-closed', () => {
  // keep running from the tray
});
