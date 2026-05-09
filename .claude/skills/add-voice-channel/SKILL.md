---
name: add-voice-channel
description: Add voice-channel client integration to NanoClaw — connects this NanoClaw to a voice-stack (FreeSWITCH + OpenAI Realtime SIP) running on the same host or via WireGuard. Voice-stack must already be deployed (see github.com/carstenf/mcp-voice-channel). Topology-agnostic — single-host or split-host.
---

# Add Voice Channel

This skill adds the trunk-side files for a voice-channel integration. The
voice infrastructure (FreeSWITCH, OpenAI Realtime SIP bridge, voice-mcp
orchestrator, webhook forwarder) lives in
[`carstenf/mcp-voice-channel`](https://github.com/carstenf/mcp-voice-channel)
and must already be deployed somewhere reachable before this skill runs.

NanoClaw's trunk only exposes one inbound surface: `POST /voice/dispatch`.
Voice-mcp dispatches every per-call event (init, transcript, set-language,
ask-core, etc.) to that endpoint with a bearer.

## Phase 1: Pre-flight

### Check if already applied

If `src/channels/voice.ts` exists, the skill is already applied; skip to
Phase 4 (Configure).

### Verify voice-stack is reachable

Use `AskUserQuestion`:

- **Is a `mcp-voice-channel` voice-stack already deployed and reachable?**
  - "Yes, on this same host" → URL = `http://localhost:3150/mcp`
  - "Yes, on a remote host via WireGuard" → ask for the WG peer (commonly
    `10.0.0.1`); URL = `http://10.0.0.1:3150/mcp`
  - "No, not yet deployed" → STOP. Point user to
    `carstenf/mcp-voice-channel` `README.md` and abort the skill.

### Collect configuration

- **VOICE_MCP_BEARER** — the bearer voice-stack expects on `/mcp` calls.
  User has it in `voice-stack/.env` `VOICE_MCP_BEARER` (output of the
  voice-stack install).
- **VOICE_DISPATCH_BEARER** — pick a fresh 64-hex secret (`openssl rand
  -hex 32`). This is the bearer voice-mcp will present on `POST
  /voice/dispatch`. Set the same value in voice-stack's `TRUNK_DISPATCH_BEARER`.
- **Operator name + caller-ID** — for `~/.config/nanoclaw/voice-config.json`.

## Phase 2: Apply trunk-side files

```bash
git remote add voice https://github.com/carstenf/nanoclaw-voice-channel.git
git fetch voice v2-friendly
git merge voice/v2-friendly --allow-unrelated-histories --no-edit
```

If the merge reports conflicts on `README.md`, prefer the trunk:

```bash
git checkout --ours README.md && git add README.md && git commit --no-edit
```

Confirm the four files landed:

- `src/channels/voice.ts`
- `src/voice-channel-config.ts`
- `src/voice-channel-handlers.ts`
- `src/voice-render.ts`
- `src/voice-config.ts`

### Pull persona content from mcp-voice-channel

The persona text (`baseline.md` + case overlays) is the canonical property
of the voice-stack repo. Copy it into the trunk:

```bash
mkdir -p container/skills
cp -r /path/to/mcp-voice-channel/andy-skills/voice-personas container/skills/
```

(Or `git clone https://github.com/carstenf/mcp-voice-channel /tmp/mvc &&
cp -r /tmp/mvc/andy-skills/voice-personas container/skills/`.)

## Phase 3: Wire setupVoiceHandlers

In `src/index.ts`, after channels are registered and the host's
`spawnVoiceAgent` / `sendDiscordMessage` are available, add:

```ts
import { setupVoiceHandlers } from './voice-channel-handlers.js';
import { getVoiceChannel } from './channels/voice.js';

const vc = getVoiceChannel();
if (vc) {
  setupVoiceHandlers(vc, {
    spawnVoiceAgent: async ({ callId, prompt, timeoutMs }) => {
      // call into your existing container-runner / GroupQueue path
      // return { ok: true, result: { voice_short, discord_long? } }
    },
    sendDiscordMessage: async ({ channel, content }) => {
      // call into the host's Discord channel sendMessage
      // return { ok: true } | { ok: false, error: '...' }
    },
  });
}
```

That single block is the entire INTEGRATION delta — no patches into
`db.ts`, `group-queue.ts`, `config.ts`, `mcp-tools/index.ts`, or
`container/agent-runner/`.

## Phase 4: Configure environment

Add to NanoClaw's `.env`:

```
VOICE_MCP_URL=<the URL from Phase 1>
VOICE_MCP_BEARER=<the voice-stack bearer>
VOICE_DISPATCH_BEARER=<your fresh 64-hex secret>
# Optional:
VOICE_DISPATCH_PORT=3202
VOICE_DISPATCH_BIND=0.0.0.0
OPERATOR_NAME=<for {{operator_name}} in personas>
```

Sync to the container env if you mount `data/env/env`:

```bash
mkdir -p data/env && cp .env data/env/env
```

Set the matching values in voice-stack's `.env`:

```
TRUNK_DISPATCH_URL=http://<trunk-host>:3202/voice/dispatch
TRUNK_DISPATCH_BEARER=<same 64-hex as VOICE_DISPATCH_BEARER above>
```

Restart both:

```bash
# nanoclaw (Linux)
systemctl --user restart nanoclaw
# nanoclaw (macOS)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# voice-stack
cd ~/voice-stack && docker compose restart voice-mcp
```

## Phase 5: Seed voice-config.json

```bash
mkdir -p ~/.config/nanoclaw
cat > ~/.config/nanoclaw/voice-config.json <<EOF
{
  "operator_name": "<full name>",
  "operator_cli_number": "<E.164>"
}
EOF
chmod 600 ~/.config/nanoclaw/voice-config.json
```

The bot's `voice_set_operator_config` MCP tool (on voice-mcp) updates this
file in-place — no manual editing after first seed.

## Phase 6: Verify

Watch nanoclaw log for the dispatch endpoint coming up:

```bash
grep voice_dispatch_listening ~/nanoclaw/logs/nanoclaw.log | tail -3
```

Place a test call into the operator number; the trunk log should show
`voice_render_ok` within a second of `/accept`.

## Troubleshooting

- **`voice_render_skill_load_failed`** → `container/skills/voice-personas/`
  not populated. Re-run the Phase 2 copy.
- **dispatcher returns `http_401` from voice-mcp** → bearer mismatch.
  `VOICE_DISPATCH_BEARER` (trunk) must equal `TRUNK_DISPATCH_BEARER`
  (voice-stack).
- **dispatcher returns `network_error`** → trunk's `VOICE_DISPATCH_BIND`
  not reachable from voice-stack. Check WG tunnel + bind address.
- **`unknown_tool` in trunk log** → voice-mcp dispatched a tool name the
  trunk handler map doesn't know. Either upgrade the trunk (handler
  rewrite landed for that tool) or check voice-mcp's tool list.
- **Tear down** → remove the env vars, drop `setupVoiceHandlers(...)` from
  `src/index.ts`, delete `src/channels/voice.ts` and the four other
  trunk-side files. The voice-stack can stay up untouched.
