// Minimal iCalendar (.ics) reader for "meeting soon" reminders.
// Supports timed events, TZID / UTC / floating times, RRULE with
// FREQ=DAILY|WEEKLY|MONTHLY|YEARLY (INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY),
// EXDATE and RECURRENCE-ID overrides. All-day events are ignored on purpose.
'use strict';

const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unfold(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseLine(line) {
  const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
  if (!m) return null;
  const params = {};
  if (m[2]) {
    for (const part of m[2].slice(1).split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return { name: m[1].toUpperCase(), params, value: m[3] };
}

// ---- time zone helpers ----
function tzOffsetMs(ts, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(new Date(ts))) p[type] = value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - ts;
}

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_e) {
    return false;
  }
}

// (y, m, d, hh, mm, ss) in a zone -> epoch ms. mode: 'utc' | 'local' | IANA zone
function toTs(y, m, d, hh, mm, ss, mode) {
  if (mode === 'utc') return Date.UTC(y, m - 1, d, hh, mm, ss);
  if (mode === 'local') return new Date(y, m - 1, d, hh, mm, ss).getTime();
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ts = guess - tzOffsetMs(guess, mode);
  const off2 = tzOffsetMs(ts, mode);
  if (guess - off2 !== ts) ts = guess - off2;
  return ts;
}

// Parse a DATE or DATE-TIME value. Returns { y, m, d, hh, mm, ss, mode, allDay, ts }
function parseDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value.trim());
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (!m[4]) return { y, m: mo, d, hh: 0, mm: 0, ss: 0, mode: 'local', allDay: true, ts: new Date(y, mo - 1, d).getTime() };
  const hh = +m[4];
  const mi = +m[5];
  const ss = +m[6];
  let mode = 'local';
  if (m[7] === 'Z') mode = 'utc';
  else if (params && params.TZID && validTz(params.TZID)) mode = params.TZID;
  return { y, m: mo, d, hh, mm: mi, ss, mode, allDay: false, ts: toTs(y, mo, d, hh, mi, ss, mode) };
}

function parseRrule(value) {
  const r = {};
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) r[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return r;
}

// ---- public: parse the whole file into event objects ----
function parse(text) {
  const events = [];
  let ev = null;
  for (const raw of unfold(text)) {
    if (raw === 'BEGIN:VEVENT') {
      ev = { summary: '(no title)', exdates: new Set(), status: '' };
      continue;
    }
    if (raw === 'END:VEVENT') {
      if (ev && ev.start) events.push(ev);
      ev = null;
      continue;
    }
    if (!ev) continue;
    const p = parseLine(raw);
    if (!p) continue;
    switch (p.name) {
      case 'UID':
        ev.uid = p.value;
        break;
      case 'SUMMARY':
        ev.summary = p.value.replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\\\/g, '\\').trim() || '(no title)';
        break;
      case 'STATUS':
        ev.status = p.value.toUpperCase();
        break;
      case 'DTSTART':
        ev.start = parseDate(p.value, p.params);
        break;
      case 'DTEND':
        ev.end = parseDate(p.value, p.params);
        break;
      case 'RRULE':
        ev.rrule = parseRrule(p.value);
        break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const x = parseDate(v, p.params);
          if (x) ev.exdates.add(x.ts);
        }
        break;
      case 'RECURRENCE-ID': {
        const x = parseDate(p.value, p.params);
        if (x) ev.recurrenceId = x.ts;
        break;
      }
      default:
        break;
    }
  }
  return events;
}

// ---- recurrence expansion ----
function ymd(dayTs) {
  const d = new Date(dayTs);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

function expand(ev, from, to, skip) {
  const s = ev.start;
  const r = ev.rrule;
  const out = [];
  const push = (ts) => {
    if (ts < from || ts > to) return;
    if (ev.exdates.has(ts) || skip.has(ts)) return;
    out.push(ts);
  };
  if (!r) {
    push(s.ts);
    return out;
  }
  const freq = (r.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(r.INTERVAL || '1', 10));
  const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  let until = Infinity;
  if (r.UNTIL) {
    const u = parseDate(r.UNTIL, {});
    if (u) until = u.allDay ? u.ts + DAY : u.ts;
  }
  const startDay = Date.UTC(s.y, s.m - 1, s.d); // date-only container
  const timeOf = (dayTs) => {
    const [y, m, d] = ymd(dayTs);
    return toTs(y, m, d, s.hh, s.mm, s.ss, s.mode);
  };
  let produced = 0;
  const MAX_ITER = 5000;

  if (freq === 'DAILY') {
    for (let i = 0; i < MAX_ITER && produced < count; i++) {
      const ts = timeOf(startDay + i * interval * DAY);
      if (ts > until || ts > to) break;
      produced++;
      push(ts);
    }
  } else if (freq === 'WEEKLY') {
    const startDow = new Date(startDay).getUTCDay();
    let days = (r.BYDAY || WEEKDAYS[startDow])
      .split(',')
      .map((x) => WEEKDAYS.indexOf(x.replace(/^[-+]?\d+/, '')))
      .filter((x) => x >= 0)
      .sort((a, b) => a - b);
    if (!days.length) days = [startDow];
    const weekStart = startDay - startDow * DAY; // week begins on Sunday
    for (let w = 0; w < MAX_ITER && produced < count; w++) {
      const base = weekStart + w * interval * 7 * DAY;
      let stop = false;
      for (const dow of days) {
        const dayTs = base + dow * DAY;
        if (dayTs < startDay) continue;
        const ts = timeOf(dayTs);
        if (ts > until || ts > to) {
          stop = true;
          break;
        }
        produced++;
        push(ts);
        if (produced >= count) break;
      }
      if (stop) break;
    }
  } else if (freq === 'MONTHLY') {
    const mday = r.BYMONTHDAY ? parseInt(r.BYMONTHDAY.split(',')[0], 10) : s.d;
    for (let i = 0; i < MAX_ITER && produced < count; i++) {
      const y = s.y + Math.floor((s.m - 1 + i * interval) / 12);
      const m = ((s.m - 1 + i * interval) % 12) + 1;
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (mday > daysInMonth) continue;
      const ts = toTs(y, m, mday, s.hh, s.mm, s.ss, s.mode);
      if (ts > until || ts > to) break;
      produced++;
      push(ts);
    }
  } else if (freq === 'YEARLY') {
    for (let i = 0; i < MAX_ITER && produced < count; i++) {
      const ts = toTs(s.y + i * interval, s.m, s.d, s.hh, s.mm, s.ss, s.mode);
      if (ts > until || ts > to) break;
      produced++;
      push(ts);
    }
  } else {
    push(s.ts);
  }
  return out;
}

// ---- public: concrete occurrences between from and to (epoch ms) ----
function occurrences(events, from, to) {
  const overridden = new Map(); // uid -> Set of original occurrence times replaced by an override
  for (const ev of events) {
    if (ev.recurrenceId == null) continue;
    if (!overridden.has(ev.uid)) overridden.set(ev.uid, new Set());
    overridden.get(ev.uid).add(ev.recurrenceId);
  }
  const out = [];
  for (const ev of events) {
    if (ev.status === 'CANCELLED' || !ev.start || ev.start.allDay) continue;
    const dur = ev.end && !ev.end.allDay ? ev.end.ts - ev.start.ts : 0;
    if (ev.recurrenceId != null) {
      if (ev.start.ts >= from && ev.start.ts <= to) out.push({ uid: ev.uid, summary: ev.summary, start: ev.start.ts, end: ev.start.ts + dur });
      continue;
    }
    const skip = overridden.get(ev.uid) || new Set();
    for (const ts of expand(ev, from, to, skip)) {
      out.push({ uid: ev.uid, summary: ev.summary, start: ts, end: ts + dur });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

module.exports = { parse, occurrences };
