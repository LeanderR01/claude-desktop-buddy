# Setup

Claude Buddy is a macOS menu bar app built with Electron. You can run it from source or build a proper `.app`.

## Requirements

- macOS (Apple Silicon or Intel)
- Node.js 18 or newer (check with `node --version`, install from [nodejs.org](https://nodejs.org) if missing)
- git

## 1. Install

The installer clones the repo and installs dependencies. It never touches your calendar URL or any other secret:

```bash
curl -fsSL https://raw.githubusercontent.com/LeanderR01/claude-desktop-buddy/main/install.sh | bash
```

Or by hand:

```bash
git clone https://github.com/LeanderR01/claude-desktop-buddy.git
cd claude-desktop-buddy
npm install
```

## 2. First run

```bash
npm start
```

The buddy appears in the menu bar (small orange face). His first walk comes 40 to 120 seconds after launch. Use **Preview event** in the menu to see all event visits immediately.

Test mode makes everything fast (visits every 6 to 15 seconds):

```bash
BUDDY_TEST=1 npx electron .
```

## 3. Settings

Menu bar > **Open settings file**, or edit `~/Library/Application Support/Claude Buddy/config.json` directly. The file is created with defaults on first launch and reloads automatically when you save. All fields are listed in [config.example.json](config.example.json):

| Field | What it does |
|---|---|
| `vaultPath` | Path to your notes folder (e.g. an Obsidian vault). Empty string disables the daily note nudge. |
| `dailyNotesFolder` | Subfolder inside the vault where daily notes live, named `YYYY-MM-DD.md`. |
| `dailyNoteNudgeHour` | From this hour (default 18) the buddy reminds you if today's note is missing. `-1` disables. |
| `calendarIcsUrl` | Secret iCal address of your calendar (see below). Empty disables. |
| `calendarLeadMinutes` | How many minutes before an event the buddy shows up. |
| `calendarRefreshMinutes` | How often the calendar is re-fetched. |
| `quietHours` | No random visits during these windows, e.g. `["09:00-12:00", "14:00-16:00"]`. Event visits still come through. |
| `hotkey` | Global shortcut to summon him. Default `Control+Alt+C`. |
| `stretchAfterMinutes` | Stretch reminder after this many minutes of continuous activity. `0` disables. |
| `coffeeAfterMinutes` | Break reminder ("break. now.", he drags a cup in) after this many minutes without a real break. `0` disables. |
| `claudeDoneOnlyWhenAway` | Only show "Claude Code done" visits when you have been away from the keyboard. |
| `fridayWrapHour` | Friday end-of-week visit from this hour (default 18). `-1` disables. |

Visit frequency and all speech bubble lines live in [renderer/config.js](renderer/config.js) (defaults: a visit every 12 to 25 minutes).

## 4. Calendar (optional)

Uses the secret iCal address of your Google Calendar. No Google Cloud project, no OAuth.

1. Open Google Calendar in the browser
2. Gear icon > Settings > click your calendar on the left > "Integrate calendar"
3. Copy the "Secret address in iCal format" (ends in `basic.ics`)
4. Menu bar > Open settings file, paste the URL into `calendarIcsUrl`, save. No restart needed.

**This URL is a secret.** Anyone who has it can read your calendar. It stays in your local config file only. If it leaks, reset it in the same Google Calendar settings page ("Reset private URLs").

Other calendar apps work too as long as they offer a private `.ics` subscription URL (Outlook, iCloud via publish, Fastmail). All-day events are ignored on purpose.

## 5. Claude Code hooks (optional)

Lets the buddy tell you when a Claude Code task finishes or Claude is waiting for input.

1. Copy the hook script:

```bash
mkdir -p ~/.claude/hooks && cp scripts/claude-hook.sh ~/.claude/hooks/claude-buddy-hook.sh && chmod +x ~/.claude/hooks/claude-buddy-hook.sh
```

2. Add both hooks to `~/.claude/settings.json` (create the file if it does not exist, or merge into your existing `hooks` section):

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/claude-buddy-hook.sh" }] }
    ],
    "Notification": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/claude-buddy-hook.sh" }] }
    ]
  }
}
```

The script appends each hook payload as one line to a local file the app watches. That is all it does.

## 6. Build a real app (optional)

Running from source works fine, but a built app can start at login without a terminal:

```bash
npm run dist:local
cp -R "dist/mac-arm64/Claude Buddy.app" /Applications/
```

First launch of the unsigned app: macOS blocks it. System Settings > Privacy & Security > scroll down > "Open Anyway". Needed once.

Then enable **Start at login** in the menu bar menu.

## Troubleshooting

- **Buddy never appears**: check Pause and Quiet in the menu, then menu bar > Open log. Every visit start and end is logged with its position.
- **Hotkey does nothing**: another app may own the shortcut. Pick a different one in the config.
- **Calendar visits missing**: the log shows `calendar: N events loaded` after each fetch. `0 events` usually means a wrong URL.
- **He vanished mid-walk**: check the log around that time for `STILL ON SCREEN` lines.
