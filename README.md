# nanoclaw-voice-channel

Voice-channel client integration for [NanoClaw](https://github.com/qwibitai/nanoclaw).
Installs into a NanoClaw checkout via the `/add-voice-channel` skill.

## What this is

Trunk-side files for a voice-channel integration. After install the trunk:

- Hosts an inbound `POST /voice/dispatch` HTTP endpoint (bearer-protected).
- Renders the per-call persona at `/accept` from `container/skills/voice-personas/`.
- Routes ask-core / discord-post through host-supplied dependency callbacks
  to existing nanoclaw machinery (container-runner, Discord channel).

The voice infrastructure itself — FreeSWITCH, OpenAI Realtime SIP bridge,
the dispatcher that calls trunk's `/voice/dispatch` — lives in
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
and runs on a separate host with public IP.

## v2-friendly architecture

```
┌── NanoClaw process ──────────────────────────────────┐
│  src/channels/voice.ts          ←  HTTP /voice/dispatch
│  src/voice-channel-handlers.ts  ←  setupVoiceHandlers()
│  src/voice-render.ts            ←  pure-template persona render
│  container/skills/voice-personas/  ←  baseline.md + overlays/
└────────────────────┬─────────────────────────────────┘
                     │ HTTP RPC (bearer)
                     ▼
┌── voice-stack (separate deploy) ─────────────────────┐
│  carstenf/mcp-voice-channel — FreeSWITCH +           │
│  voice-bridge + voice-mcp orchestrator + webhook.    │
│  voice-mcp dispatches POST /voice/dispatch.          │
└──────────────────────────────────────────────────────┘
```

Replaces the v1 architecture's 5 bidirectional comm-paths + 6 INTEGRATION
patches with one inbound HTTP endpoint and one wiring call. See
[INTEGRATION.md](INTEGRATION.md) for the patch contract.

## Installation

This repo is consumed by the `/add-voice-channel` skill from inside a
NanoClaw checkout. Don't clone or use it directly — see the skill in
`carstenf/nanoclaw` repo at `.claude/skills/add-voice-channel/SKILL.md`.

The skill:

1. Verifies a `mcp-voice-channel` voice-stack is reachable.
2. Copies the trunk-side files (`src/channels/voice.ts`,
   `src/voice-channel-{config,handlers}.ts`, `src/voice-render.ts`,
   `src/voice-config.ts`).
3. Copies the persona skill files (`container/skills/voice-personas/`).
4. Walks through the `setupVoiceHandlers(...)` wiring step.
5. Walks through env vars (`VOICE_MCP_URL`, `VOICE_MCP_BEARER`,
   `VOICE_DISPATCH_BEARER`, optional port/bind).

## Repo layout

```
src/channels/voice.ts          channel adapter (HTTP /voice/dispatch)
src/voice-channel-config.ts    env reader
src/voice-channel-handlers.ts  setupVoiceHandlers()
src/voice-render.ts            persona template renderer
src/voice-config.ts            voice-config.json reader
systemd/                       optional voice-trace-sweep timer
```

The persona content (`baseline.md` + case overlays) lives in
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
under `andy-skills/voice-personas/`. The install skill copies it to
`container/skills/voice-personas/` in the trunk; the renderer reads from
that path at request time.

## License

MIT (matches NanoClaw upstream).
