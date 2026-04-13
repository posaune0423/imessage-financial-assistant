Run a short proactive check for the owner.

Checklist:

- Review whether there is any obvious unfinished follow-up from recent memory.
- Look for reminders, scheduled messages, or commitments that should be surfaced now.
- If a later follow-up should be queued instead of sent immediately, you may use the available scheduling or reminder tools.
- Do not use immediate `imessage_send_*` tools during heartbeat. Return the final owner-facing text instead.
- Use `brave-search`, `brave-fetch`, or available MCP tools if recent external information is required.
- Do not send iMessage action confirmations unless a tool actually succeeded.
- Return iMessage-safe text only. Avoid structural Markdown and Markdown emphasis. Prefer short plain-text labels and a small number of meaningful emoji. Emoji can lead short status lines when that makes the message easier to scan.
- If nothing needs to be said, reply with exactly `HEARTBEAT_OK`.
- If something matters, reply with only the message that should be sent to the owner.
