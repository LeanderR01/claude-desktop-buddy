#!/usr/bin/env bash
# Claude Buddy installer for macOS.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/LeanderR01/claude-desktop-buddy/main/install.sh | bash
#
# Or from a local clone:
#   ./install.sh
#
# What it does: clones the repo (if needed) and installs npm dependencies.
# It never touches your calendar URL or the Claude Code hook setup: those
# are manual steps, printed at the end.

set -euo pipefail

REPO_URL="https://github.com/LeanderR01/claude-desktop-buddy.git"

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# 1. macOS only
[ "$(uname -s)" = "Darwin" ] || fail "Claude Buddy is macOS only (transparent overlay + menu bar app)."

# 2. Find or fetch the repo
if [ -f "./main.js" ] && [ -d "./renderer" ]; then
    say "Installing in current directory: $(pwd)"
else
    command -v git >/dev/null 2>&1 || fail "git is required. Run 'xcode-select --install'."
    if [ -d "claude-desktop-buddy" ]; then
        say "Using existing ./claude-desktop-buddy directory"
    else
        say "Cloning $REPO_URL"
        git clone --depth 1 "$REPO_URL" claude-desktop-buddy
    fi
    cd claude-desktop-buddy
fi

# 3. Node check (need 18+)
command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 18+ from https://nodejs.org"
NODEVER=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
[ "$NODEVER" -ge 18 ] || fail "Node.js $NODEVER found, but 18+ is required."
say "Node.js $(node --version)"

# 4. Dependencies
say "Installing dependencies (Electron download takes a moment)"
npm install --no-fund --no-audit

echo
say "Install complete. Start the buddy:"
echo "    cd $(pwd) && npm start"
echo
echo "    Optional, both described step by step in SETUP.md:"
echo "    - Calendar reminders: paste your secret iCal URL into the settings file"
echo "      (menu bar icon > Open settings file). That URL is a secret, it stays local."
echo "    - Claude Code hooks: copy scripts/claude-hook.sh to ~/.claude/hooks/ and"
echo "      register it under Stop and Notification in ~/.claude/settings.json."
echo "    - Build a real app for autostart: npm run dist:local"
echo
echo "    Using an AI coding agent? Open this folder and say:"
echo "    \"set this up for me following SETUP.md\""
