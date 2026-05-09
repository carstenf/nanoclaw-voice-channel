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

## Install (bootstrap, on a fresh NanoClaw clone)

This skill repo is **self-contained** until an upstream PR lands. The
SKILL.md file lives here, not in upstream nanoclaw, so the very first
install is a manual `git merge`. Once the merge runs, the SKILL.md is in
your trunk and `/add-voice-channel` is discoverable for any subsequent
re-install or update.

### Pre-requisite

A `mcp-voice-channel` voice-stack must already be deployed somewhere
reachable (same host, or remote via WireGuard). See
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
`pattern-b` branch.

### Step 1 — bootstrap the SKILL.md and trunk files

In your NanoClaw checkout:

```bash
git remote add voice https://github.com/carstenf/nanoclaw-voice-channel.git
git fetch voice pattern-b
git merge voice/pattern-b --allow-unrelated-histories --no-edit
```

If the merge reports a conflict on `README.md`, prefer the trunk:

```bash
git checkout --ours README.md && git add README.md && git commit --no-edit
```

The merge brings in:

- `src/voice-mcp-client.ts` (~290 LoC) — long-poll loop + IPC-inject + cold-spawn fallback
- `src/voice-respond-manager.ts` (~74 LoC) — call_id ↔ Promise correlation
- `container/agent-runner/src/voice-request.ts` (~130 LoC) — IPC envelope drain helpers
- `.claude/skills/add-voice-channel/SKILL.md` — install recipe

### Step 2 — run /add-voice-channel

Now that the SKILL.md is in your trunk, in Claude Code run:

```
/add-voice-channel
```

It walks through:
- Phase 1 — pre-flight (verify voice-stack reachable, collect bearer + URL)
- Phase 3 — apply the 4 trunk patches via Edit calls (the merge can't
  touch existing trunk files, so the SKILL.md does it)
- Phase 4 — env vars (`VOICE_MCP_URL`, `VOICE_MCP_BEARER` in nanoclaw `.env`;
  `DISCORD_BOT_TOKEN` in voice-stack `.env`)
- Phase 5 — smoke test

Phase 2 (file merge) is already done by step 1 above.

## Pure-manual install (without /add-voice-channel)

If you don't want to use the skill helper, after step 1 you still need
to apply the 4 trunk patches manually. Read
`.claude/skills/add-voice-channel/SKILL.md` Phase 3 — it lists the exact
edits for `src/index.ts`, `src/group-queue.ts`, `src/container-runner.ts`,
and `container/agent-runner/src/index.ts`.

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
