# Claude Buddy

A little pixel Claude (orange blob, two eyes, four stubby legs) that wanders across your macOS screen while you work. He chases your cursor, naps, fishes, swims, bikes, reads, and sits down with a tiny laptop to cowork with you. He also shows up with useful nudges: when a Claude Code task finishes, when Claude needs your input, before calendar events, and when you have been at the desk too long.

This is an unofficial hobby project. It is not made by or affiliated with Anthropic. The sprite is a fan-made pixel homage to the Claude Code terminal mascot.

**macOS only.** The app relies on macOS-specific window behavior (transparent click-through overlay, menu bar tray, screen geometry handling). There are no Windows or Linux builds.

## What he does

**Random visits** (every 12 to 25 minutes by default, the first one 40 to 120 seconds after launch):

- **Walk across**: crosses the screen at floor level or random height, with 0 to 2 stops to think, sit, or look at your cursor.
- **Peek**: appears half-hidden from any of the four edges, from the top hanging upside down. Waits, sometimes says a line, retreats.
- **Chase**: enters on the far side, spots the cursor with a "!" and runs after it for up to 14 seconds. Catch: spark, three hops, happy face. Miss: sits down out of breath, leaves.
- **Stalk**: only when your cursor sat still for 4 minutes. Creeps in step by step, pounces, then guards the cursor until you come back. If you move early: "!" and he runs off fast. 20 minute cooldown.
- **Think**: walks in near you, thought dots above his head, says one of his lines, leaves.
- **Cowork**: parks at the bottom or a side edge, opens the laptop, types for 2 to 5 minutes. Glances over every 20 to 35 seconds, occasionally comments, ends with a checkmark and "done. you?". While you are actively typing, 30% of visits become coworking.
- **Work**: short version of coworking, 8 to 16 seconds, anywhere on screen.
- **Fish**: sits at the bottom edge, rod out, line hanging off screen, float bobbing. Every 8 to 15 seconds a bite: "!", hop, sometimes "got one!" or "nope.".
- **Swim**: crosses the screen half-submerged with little splashes, sometimes treads water for a line.
- **Bike**: pedals across on two grey wheels.
- **Run**: sprints across with dust clouds, sometimes drops a line mid-run.
- **Read**: sits down with a book for a while, flips pages.
- **Nap**: walks in, sleeps 30 to 80 seconds with Zzz. Cursor on him wakes him: "!", spark, hops, leaves.
- **Sit and watch**: sits near an edge and follows your cursor with his gaze.
- **Zoomies**: sprints back and forth across the screen.

**Event visits** (these also come through during quiet hours, at cursor height):

- **Claude Code finished**: the `Stop` hook fires and the buddy walks in with a checkmark and "done: \<project\>". Only when you have been away from the keyboard for at least 20 seconds, otherwise you saw it happen anyway.
- **Claude Code needs you**: the `Notification` hook fires (permission prompt or waiting for input). The buddy hurries in with a bell and a flashing "!", stays until you move the mouse, max 2 minutes.
- **Calendar**: 5 minutes before an event, with a clock and the event title. Reads a secret iCal URL directly, checked every 5 minutes, no OAuth, no cloud project. See the security note below.
- **Daily note**: after 18:00, if today's daily note is missing in your notes folder. Once per day, off until you set a `vaultPath`.
- **Stretch**: after 50 minutes of continuous activity, sparkle, three hops, "stretch break".
- **Break**: after 3 hours without a 5 minute break, drags a cup along, "break. now.".
- **Week done**: Fridays after 18:00, the only time hearts appear.

**Reactions**: cursor on him makes him squint happily. Speech bubbles with 25 lines plus context lines for working, coworking, fishing, running, biking, swimming, and reading. He faces left or right, flips upside down for the top peek, hops, sits, and sleeps with visible breathing.

**Controls**: menu bar icon with Summon, Pause, Quiet for 1 hour, Start at login, Open settings file, Open log, Preview event, Quit. Hotkey Ctrl+Alt+C summons him instantly. He follows the cursor to whichever monitor you are on, 1 or 2 externals work without setup. Clicks always pass through him. The window is fully hidden between visits, near zero CPU when idle.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/LeanderR01/claude-desktop-buddy/main/install.sh | bash
```

Or manually: clone the repo, `npm install`, `npm start`. Full guide including the Claude Code hook and calendar setup: [SETUP.md](SETUP.md).

## Security and privacy

- **The calendar URL is a secret.** Anyone who has your "secret address in iCal format" can read your entire calendar. It lives only in your local config file (`~/Library/Application Support/Claude Buddy/config.json`), which is never part of this repo. If it ever leaks, reset it in Google Calendar under "Reset private URLs".
- **Nothing leaves your machine.** The only network request the app makes is fetching that iCal URL, and only if you configure one. No telemetry, no analytics, no accounts.
- **The Claude Code hook only reads event metadata.** It appends the hook payload (event name, project folder name, message) to a local file that the app watches. It never sees your prompts or code.
- **The app is unsigned.** macOS will block the first launch; you allow it once under System Settings > Privacy & Security. If you would rather not trust a prebuilt binary, build it yourself from source with `npm run dist:local`.

## Customize

Everything lives in two places:

- **Runtime settings**: `~/Library/Application Support/Claude Buddy/config.json` (created on first launch, reloaded automatically when you save). Quiet hours, hotkey, timers, calendar URL, notes folder. [config.example.json](config.example.json) shows all fields.
- **Personality**: [renderer/config.js](renderer/config.js) has all speech bubble messages and timing knobs. [renderer/sprites.js](renderer/sprites.js) is the pixel art. Preview all frames with `node scripts/preview.js out.png`.

## License

MIT, see [LICENSE](LICENSE).
