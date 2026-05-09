# nanoclaw-voice-channel

Voice-channel client integration for [NanoClaw](https://github.com/qwibitai/nanoclaw).
Pattern-B architecture: voice-mcp = MCP server, NanoClaw = MCP client.
Mirror of the hindsight-mcp integration shape.

## What this is

Trunk-side files for the Pattern-B voice-channel integration. After install
the NanoClaw trunk:

- Connects to voice-mcp (on the voice-stack host) as MCP CLIENT — long-polls
  `voice_wait_for_question` for ask_core questions from voice-bridge.
- Injects each question into the live main container's IPC dir; Andy
  emits a `voice_response` marker; the marker routes back via
  `voice_post_answer` MCP tool.
- Cold-spawns the main container as fallback when no live container exists.

The voice infrastructure — FreeSWITCH, OpenAI Realtime SIP bridge, voice-mcp
(persona render, Discord posting via bot API, retry queue, lifecycle) — lives in
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
and must already be deployed (branch `pattern-b` or later) before this
skill is applied.

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
the only direction that fundamentally needs a back-channel because Andy
is the answerer, not the initiator.

This mirrors the hindsight-mcp shape: hindsight = MCP server, NanoClaw
container = MCP client. Same pattern, different domain.

## Install (two-stage, until upstream PR lands)

Discord's `/add-discord` SKILL.md ships in upstream `qwibitai/nanoclaw`.
`/add-voice-channel` doesn't yet — until that PR lands, this repo ships
the SKILL.md and a small bootstrap skill (`install-voice-channel`) does
the one-time hand-off into a NanoClaw checkout. After bootstrap,
`/add-voice-channel` works identically to `/add-discord`.

### Pre-requisite

A `mcp-voice-channel` voice-stack must already be deployed somewhere
reachable (same host, or remote via WireGuard). See
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
`pattern-b` branch.

### Stage 1 — bootstrap (one-time)

```bash
git clone https://github.com/carstenf/nanoclaw-voice-channel.git
cd nanoclaw-voice-channel
```

Open Claude Code in this directory and run:

```
/install-voice-channel
```

It asks for your NanoClaw path (default `~/nanoclaw`) and copies
`add-voice-channel/SKILL.md` into `<nanoclaw>/.claude/skills/`. After this
runs, `/add-voice-channel` is discoverable in your NanoClaw checkout.

### Stage 2 — run /add-voice-channel (analog /add-discord)

```bash
cd ~/nanoclaw      # or wherever you keep your NanoClaw checkout
```

Open Claude Code in NanoClaw and run:

```
/add-voice-channel
```

It walks through (analog `/add-discord`):

- Phase 1 — pre-flight (verify voice-stack reachable, collect bearer + URL)
- Phase 2 — `git remote add voice` + `git merge voice/pattern-b` to bring
  in the 3 trunk-side voice files
- Phase 3 — apply 4 small trunk patches via Edit calls
- Phase 4 — env vars (`VOICE_MCP_URL`, `VOICE_MCP_BEARER` in nanoclaw `.env`;
  `DISCORD_BOT_TOKEN` in voice-stack `.env`)
- Phase 5 — smoke test

## Pure-manual install (no skills)

If you don't want to use the skill helpers, do stages 1+2 by hand:

```bash
# Stage 1: bring in the trunk files
cd ~/nanoclaw
git remote add voice https://github.com/carstenf/nanoclaw-voice-channel.git
git fetch voice pattern-b
git merge voice/pattern-b --allow-unrelated-histories --no-edit

# Stage 2: apply the 4 trunk patches manually
# Read .claude/skills/add-voice-channel/SKILL.md Phase 3 for exact edits.
# Then add env vars, restart, smoke-test.
```

## What lives where

| Repo | Purpose |
|---|---|
| [`qwibitai/nanoclaw`](https://github.com/qwibitai/nanoclaw) | Upstream NanoClaw trunk (no voice content) |
| `carstenf/nanoclaw-voice-channel` (this repo) | Voice client integration files + SKILL.md (until upstream PR lands, the SKILL.md ships from here) |
| [`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel) | The voice-stack itself (FreeSWITCH + OpenAI SIP bridge + voice-mcp) |

Once an upstream PR for `add-voice-channel/SKILL.md` is accepted into
qwibitai/nanoclaw, the SKILL.md moves there and step 1 above becomes
just a regular `/add-voice-channel` skill invocation (analog `/add-discord`).

## History

- `pattern-b` (current) — voice-mcp = MCP server, NanoClaw = MCP client (long-poll).
  Strukturell wie hindsight. Trunk surface ~500 LoC.
- `v2-friendly` (deprecated) — voice-mcp dispatches to NanoClaw via HTTP
  `/voice/dispatch`. ~600 LoC trunk surface, two-protocol stack.
- `main` (deprecated) — v1 INTEGRATION patches, ~64 trunk-side files.
