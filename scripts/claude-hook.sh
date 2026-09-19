#!/bin/bash
# Claude Code hook for Claude Buddy.
# Claude Code pipes the hook payload (JSON) to stdin. We append it as one line
# to the events file; the Claude Buddy app watches that file and sends the
# buddy over when a task finishes or Claude needs attention.
f="$HOME/Library/Application Support/Claude Buddy/claude-events.jsonl"
mkdir -p "$(dirname "$f")"
{ tr -d '\n'; echo; } >> "$f" 2>/dev/null
exit 0
