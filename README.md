# nanoclaw-voice-channel

Voice-channel client integration for [NanoClaw](https://github.com/qwibitai/nanoclaw).
Installs into a NanoClaw checkout via the `/add-voice-channel` skill.

## What this is

This repo contains the NanoClaw-side **client** code for a voice-channel
integration:

- WebSocket client to a separately-deployed voice-mcp infrastructure
- 12 MCP tools that the voice-bridge invokes (transcripts, ask-core,
  contracts, calendar tools, etc.)
- Per-call state management (mid-call mutation gateway, trigger queue,
  voice-respond manager)
- Container-agent voice-request IPC handling

It does **not** contain the voice infrastructure itself (FreeSWITCH, OpenAI
Realtime SIP bridge, webhook forwarder). That lives in
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
and runs on a separate host with public IP.

## Installation

This repo is consumed by the `/add-voice-channel` skill from inside a
NanoClaw checkout. Don't clone or use it directly — see the skill in
`carstenf/nanoclaw` repo at `.claude/skills/add-voice-channel/SKILL.md`.

The skill walks through:

1. Pre-flight: verify a `mcp-voice-channel` voice-stack is already deployed
   and reachable (locally or via WireGuard).
2. Pull voice files from this repo into the NanoClaw tree.
3. Apply integration patches to shared NanoClaw files
   (`src/mcp-tools/index.ts`, `src/index.ts`, `src/config.ts`,
   `container/agent-runner/src/index.ts`).
4. Configure environment variables (`VOICE_MCP_TRIGGERS_URL`,
   `VOICE_MCP_BEARER`, etc.).
5. Set up the operator profile in `~/.config/nanoclaw/voice-config.json`.
6. Build and verify.

## Repo layout

The directory structure mirrors NanoClaw paths so files end up in the
right place when copied:

```
src/voice-channel/         Channel state, manager, protocol, wiring,
                           orchestrator, register-tools, config
src/voice-*.ts             Top-level voice helpers (config reader,
                           agent invoker, instructions, mid-call gateway,
                           trigger queue) + tests
src/mcp-tools/voice-*.ts   12 voice MCP tools + 10 tests
src/channels/voice-mcp.ts  WebSocket client to voice-mcp:3150
container/agent-runner/    Container-side voice_request IPC handler
  src/voice-request.ts
systemd/                   Optional: voice-trace-sweep timer for log rotation
```

Files in this repo can be merged or copied into a target NanoClaw checkout.
The exact mechanics are documented in `INTEGRATION.md`.

## Architecture

```
┌── NanoClaw process (any host) ───────────────────────┐
│  src/channels/voice-mcp.ts  ←  WS client             │
│  src/voice-channel/         ←  state + orchestrator  │
│  src/mcp-tools/voice-*      ←  12 MCP-tool handlers  │
│  src/voice-*.ts             ←  config, gateway, etc. │
│  container/agent-runner     ←  voice_request IPC     │
└────────────────────┬─────────────────────────────────┘
                     │ WebSocket (localhost or WG)
                     ▼
┌── voice-stack (separate deploy) ─────────────────────┐
│  carstenf/mcp-voice-channel — FreeSWITCH +           │
│  voice-bridge + voice-mcp + webhook-forwarder.       │
│  Connects Sipgate PSTN ↔ OpenAI Realtime SIP.        │
└──────────────────────────────────────────────────────┘
```

The two stacks talk over WebSocket. Single-host deployments use
`localhost`; split-host deployments use WireGuard.

## License

MIT (matches NanoClaw upstream).
