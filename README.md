# nanoclaw-voice-channel

Voice-channel client integration for [NanoClaw](https://github.com/qwibitai/nanoclaw).
Installs into a NanoClaw checkout via the `/add-voice-channel` skill.

## What this is

Trunk-side files for the Pattern-B voice-channel integration. After install
the trunk:

- Connects to voice-mcp (on the voice-stack host) as MCP CLIENT — long-polls
  `voice_wait_for_question` for ask_core questions from voice-bridge.
- Injects each question into the live main container's IPC dir; Andy
  emits a `voice_response` marker; the marker routes back via
  `voice_post_answer` MCP tool.
- Cold-spawns the main container as fallback when no live container exists.

The voice infrastructure — FreeSWITCH, OpenAI Realtime SIP bridge, voice-mcp
(persona render, Discord webhook, retry queue, lifecycle) — lives in
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
and runs on a separate host with public IP.

## Pattern-B architecture

```
voice-bridge ←→ voice-mcp (voice-stack host)
                  │
                  │  MCP server (StreamableHTTP, port 3150)
                  ▼
                NanoClaw (long-poll MCP client)
                  │
                  │  IPC envelope into live main container
                  ▼
                Andy → voice_response marker → voice_post_answer
```

Voice-mcp owns: persona render, Discord posting (via bot API), retry queue,
call lifecycle. NanoClaw only owns the ask_core inversion (voice → Andy) —
the only direction that fundamentally requires a back-channel because Andy
is the answerer, not the initiator.

This mirrors the hindsight-mcp shape: hindsight = MCP server, NanoClaw
container = MCP client. Same pattern, different domain.

## Trunk-side files this branch ships

- `src/voice-mcp-client.ts` (~290 LoC) — long-poll loop + IPC-inject + cold-spawn fallback
- `src/voice-respond-manager.ts` (~74 LoC) — call_id ↔ Promise correlation
- `container/agent-runner/src/voice-request.ts` (~130 LoC) — IPC envelope drain helpers

Plus 4 small patches to existing trunk files (described in
`.claude/skills/add-voice-channel/SKILL.md`).

## Install

In a NanoClaw checkout:

```
/add-voice-channel
```

Or manually:

```bash
git remote add voice https://github.com/carstenf/nanoclaw-voice-channel.git
git fetch voice pattern-b
git merge voice/pattern-b --allow-unrelated-histories --no-edit
# then apply the 4 trunk patches per .claude/skills/add-voice-channel/SKILL.md Phase 3
```

## History

- `pattern-b` (current) — voice-mcp = MCP server, NanoClaw = MCP client (long-poll).
  Strukturell wie hindsight. Trunk surface ~500 LoC.
- `v2-friendly` (deprecated) — voice-mcp dispatches to NanoClaw via HTTP
  `/voice/dispatch`. ~600 LoC trunk surface, two-protocol stack.
- `main` (deprecated) — v1 INTEGRATION patches, ~64 trunk-side files.
