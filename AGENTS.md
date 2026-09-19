# Operating Claude Buddy (for coding agents)

Claude Buddy is a macOS Electron menu bar app: a pixel mascot that walks across the screen and reacts to Claude Code hooks, calendar events, and desk timers.

## Layout

| Path | Role |
|---|---|
| `main.js` | Main process. All timed and file-based triggers: config loading and hot reload, calendar fetch and matching, Claude Code event file watcher, daily note check, stretch/break timers, quiet hours, tray menu, global hotkey, window management. |
| `preload.js` | IPC bridge, contextIsolation on. |
| `renderer/renderer.js` | All visible behavior: walking, chasing, napping, coworking, fishing, swimming, biking, running, reading, speech bubbles, event visit choreography. Behaviors are generator functions, `yield` means "wait one frame". |
| `renderer/config.js` | Tuning knobs and every speech bubble message. Times in seconds. |
| `renderer/sprites.js` | Pixel art, 54x20 grid, 2 grid px = 1 mascot px. |
| `lib/ical.js` | Minimal iCal parser: RRULE daily/weekly/monthly/yearly, EXDATE, moved single occurrences, timezones. All-day events are ignored by design. |
| `scripts/claude-hook.sh` | Claude Code hook target. Appends each JSON payload as one line to the events file. |
| `scripts/preview.js` | Renders all sprite frames to a PNG: `node scripts/preview.js out.png`. |

## Runtime files (never in the repo)

All under `~/Library/Application Support/Claude Buddy/`:

- `config.json`: user settings, auto-created with defaults, hot-reloaded on save. Contains the secret calendar URL. Never commit, never print its `calendarIcsUrl` value.
- `state.json`: dedupe state (fired calendar reminders, last daily nudge).
- `claude-events.jsonl`: hook payload lines, watched by the app, truncated at 1 MB.
- `buddy.log`: every behavior start/end with position, truncated at 500 KB. First stop for any "buddy did X" bug report.

## Common tasks

- **Run for testing**: `BUDDY_TEST=1 npx electron .` (fast visits, extra logging). Plain run: `npm start`. Only one instance runs at a time (single instance lock), quit an installed Claude Buddy first.
- **Change messages or timing**: edit `renderer/config.js`, restart the app.
- **Change sprite**: edit `renderer/sprites.js`, then check with `node scripts/preview.js out.png`. Measure proportions against a reference screenshot, do not eyeball.
- **Add a random behavior**: write a generator `function* bMyThing()` in `renderer/renderer.js`, add it to the `BEHAVIORS` weight table and to the `window.__buddy.start` map for manual testing.
- **Add a new event visit**: emit `sendEvent(kind, text, sticky)` in `main.js`, map the kind to an icon in `EVENT_ICON` in `renderer/renderer.js`.
- **Debug a trigger**: read `buddy.log`. Every event is logged as `event <kind>: <text>` before it reaches the renderer.
- **Build**: `npm run dist:local` (arm64 dir build, ~250 MB in `dist/mac-arm64/`). `npm run dist` builds a universal DMG and needs ~2 GB free disk; delete old build output afterwards.

## Rules

- macOS only. Do not add Windows/Linux code paths speculatively.
- Timed and file triggers belong in `main.js`, visible behavior in the renderer. Keep that split.
- Clicks must always pass through the window (`setIgnoreMouseEvents(true)`), never make the buddy block input.
- The window is hidden whenever nothing is drawn; `set-visible` IPC controls this. Anything that breaks this costs idle CPU/battery.
- macOS shifts the overlay window below the menu bar; `visibleHeight()` in `main.js` compensates. Touch screen geometry only with that in mind.
