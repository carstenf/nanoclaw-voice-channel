---
name: add-voice-channel
description: Wire NanoClaw v2 to an already-running mcp-voice-channel voice-stack (FreeSWITCH + OpenAI Realtime SIP bridge + voice-mcp). Deploys a per-container stdio MCP shim that proxies to voice-mcp's HTTP endpoint, copies the voice-outbound + voice-personas skills into the container, and registers the voice messaging-group. Mirrors the hindsight integration shape. Voice-stack must be deployed first (see github.com/carstenf/mcp-voice-channel).
---

# Add Voice Channel (v2)

This skill connects NanoClaw v2 to an **already-running** voice-stack
(`mcp-voice-channel`: FreeSWITCH + OpenAI Realtime SIP bridge + voice-mcp).
The integration follows the hindsight-mcp pattern:

1. **stdio MCP shim** — small Node binary on the NanoClaw host, mounted
   read-only into each agent container, that proxies stdio MCP traffic to
   voice-mcp's HTTP endpoint via `Client + StreamableHTTPClientTransport`.
2. **Per-agent-group wiring** — the agent group's `container.json` gets
   a `voice-mcp` `mcpServers` entry (analog to `hindsight`) plus an
   `additionalMounts` entry for the shim binary.
3. **Container skills** — `voice-outbound` and `voice-personas` (canonical
   in `mcp-voice-channel/andy-skills/`) get copied into NanoClaw's
   `container/skills/`. Plus the NanoClaw-specific `voice-channel` skill
   (this repo's `container/skills/voice-channel/`) for inbound awareness.
4. **Messaging-group + wiring** — `setup-voice.ts` (already in NanoClaw v2
   trunk) registers the `voice` channel on a target agent group.

The host-side adapter `src/channels/voice.ts` (Pattern-B long-poll client)
ships in NanoClaw v2 trunk and needs no patching.

## Phase 1: Pre-flight

### 1.1 Verify voice-stack reachability

```bash
VOICE_MCP_URL="http://10.0.0.1:3150/"      # WG peer or localhost
VOICE_MCP_BEARER="<bearer from voice-stack/.env>"

curl -fsS "$VOICE_MCP_URL"health
# expect {"ok":true,"version":"2.0.0","tools":N,"mode":"stateless",...}
```

If the request fails, check WireGuard / firewall and stop here.

### 1.2 Verify NanoClaw v2 trunk

```bash
test -f src/channels/voice.ts && echo OK
```

If absent, this NanoClaw is too old. Pull v2.

### 1.3 Confirm an agent group exists

```bash
pnpm exec tsx scripts/q.ts data/v2.db "SELECT id, name, folder FROM agent_groups"
```

You need at least one. Default target is the agent group with folder
`dm-with-carsten`; pass `--agent-group=<id>` to `setup-voice.ts` to
override.

## Phase 2: Deploy the stdio shim

The shim source lives in `mcp-voice-channel/voice-mcp/src/server-stdio.ts`.
For Lenovo1-style deployments, use a dedicated `voice-mcp` system user
(parallel to `hindsight-mcp`). For MVP / single-user installs, deploying
to the operator's home is acceptable but should be migrated later.

### 2a. Production layout (recommended — needs sudo)

```bash
sudo useradd -m -s /usr/sbin/nologin voice-mcp
sudo install -d -o voice-mcp -g voice-mcp /home/voice-mcp/app
sudo install -d -o voice-mcp -g voice-mcp /home/voice-mcp/app/dist

# Build voice-mcp from source
cd /tmp && git clone https://github.com/carstenf/mcp-voice-channel.git
cd mcp-voice-channel/voice-mcp
npm install --omit=dev --no-audit --no-fund
npm run build

# Stage minimal artifact
sudo install -o voice-mcp -g voice-mcp -m 644 dist/server-stdio.js /home/voice-mcp/app/dist/
sudo cp -r node_modules /home/voice-mcp/app/
sudo chown -R voice-mcp:voice-mcp /home/voice-mcp/app/node_modules

# Minimal package.json for module resolution
sudo tee /home/voice-mcp/app/package.json > /dev/null <<'EOF'
{
  "name": "voice-mcp-stdio",
  "version": "2.0.0",
  "type": "module",
  "private": true,
  "dependencies": { "@modelcontextprotocol/sdk": "^1.29.0" }
}
EOF
sudo chown voice-mcp:voice-mcp /home/voice-mcp/app/package.json

DEPLOY_PATH=/home/voice-mcp/app
```

### 2b. MVP layout (no sudo, operator-owned)

```bash
mkdir -p ~/voice-mcp-app/dist
cd /tmp && git clone https://github.com/carstenf/mcp-voice-channel.git
cd mcp-voice-channel/voice-mcp
npm install --omit=dev --no-audit --no-fund
npm run build
cp dist/server-stdio.js ~/voice-mcp-app/dist/
cp -r node_modules ~/voice-mcp-app/
cat > ~/voice-mcp-app/package.json <<'EOF'
{
  "name": "voice-mcp-stdio",
  "version": "2.0.0",
  "type": "module",
  "private": true,
  "dependencies": { "@modelcontextprotocol/sdk": "^1.29.0" }
}
EOF
DEPLOY_PATH=$HOME/voice-mcp-app
```

### 2c. Smoke-test the shim from the host

```bash
NANOCLAW_VOICE_MCP_URL="$VOICE_MCP_URL" \
NANOCLAW_VOICE_MCP_TOKEN="$VOICE_MCP_BEARER" \
timeout 5 node "$DEPLOY_PATH/dist/server-stdio.js" < /dev/null 2>&1 | head -1
# Expect: [voice-mcp/stdio] connected: upstream=http://10.0.0.1:3150
```

## Phase 3: Update mount allowlist

Add `$DEPLOY_PATH` to `~/.config/nanoclaw/mount-allowlist.json`:

```json
{
  "path": "/home/voice-mcp/app",
  "allowReadWrite": false,
  "description": "voice-mcp stdio shim (proxy to mcp-voice-channel HTTP server)"
}
```

(Use the actual `DEPLOY_PATH` value.) Mount-allowlist is in-memory cached
in NanoClaw — a service restart is required after editing (see Phase 6).

## Phase 4: Wire the agent group

Edit `groups/<folder>/container.json` (where `<folder>` is the agent group's
folder, e.g. `dm-with-carsten`). Add to `mcpServers`:

```json
"voice-mcp": {
  "command": "node",
  "args": ["/workspace/extra/voice-mcp/dist/server-stdio.js"],
  "env": {
    "NANOCLAW_VOICE_MCP_URL": "http://10.0.0.1:3150/",
    "NANOCLAW_VOICE_MCP_TOKEN": "<voice-stack bearer>"
  },
  "instructions": "You have voice-channel MCP tools via `mcp__voice-mcp__*` (e.g. `voice_request_outbound_call` for outbound calls, `voice_get_budget_status` for cost checks). The container skills `voice-outbound` (operator-facing dispatch user manual) and `voice-personas` (Bridge-driven persona renderer for inbound calls) are loaded from `/app/skills/`. Read those skills before answering any question about voice / phone / Anrufe / SIP — never say 'I cannot make calls'. Replies for inbound voice messages (sender starts with `voice:`) are TTS-shaped via the formatter's `<voice-format>` hint and parallel-fanned-out to Discord by the host adapter — do NOT additionally call `send_message` for the same content."
}
```

And to `additionalMounts`:

```json
{ "hostPath": "<DEPLOY_PATH>", "containerPath": "voice-mcp", "readonly": true }
```

## Phase 5: Copy container skills

Three skills get loaded into NanoClaw's `container/skills/`:

```bash
# From the canonical mcp-voice-channel repo (where you cloned in Phase 2):
cp -r /tmp/mcp-voice-channel/andy-skills/voice-outbound  $NANOCLAW_DIR/container/skills/
cp -r /tmp/mcp-voice-channel/andy-skills/voice-personas  $NANOCLAW_DIR/container/skills/

# From this repo (NanoClaw-specific inbound awareness):
cp -r container/skills/voice-channel  $NANOCLAW_DIR/container/skills/
```

The skills describe themselves to Andy:
- `voice-outbound` — user manual for `mcp__voice-mcp__voice_request_outbound_call`. "Never say I cannot make calls."
- `voice-personas` — persona-rendering for Bridge triggers. Loaded by Andy at `voice_triggers_init` / `voice_triggers_transcript`.
- `voice-channel` — NanoClaw-specific inbound awareness: `senderIdentity = voice:<call_id>`, TTS-shaping behavior, parallel-Discord fanout caveat, `ncl members` whitelist mgmt.

The container skill `voice-channel` ships an `instructions.md` so it's
auto-imported into each group's `CLAUDE.md` via `claude-md-compose.ts`.
`voice-outbound` and `voice-personas` register only via their `SKILL.md`
description (available-skills heuristic).

## Phase 6: Configure environment + register messaging-group

### 6.1 Append voice config to NanoClaw `.env`

```
VOICE_MCP_URL=http://10.0.0.1:3150/
VOICE_MCP_BEARER=<bearer>
```

(Used by `src/channels/voice.ts` host-side long-poll client.)

### 6.2 Register the voice messaging-group + wiring

```bash
pnpm exec tsx scripts/setup-voice.ts
# Or: pnpm exec tsx scripts/setup-voice.ts --agent-group=<id> --policy=public
```

This is idempotent and creates `messaging_groups`, `messaging_group_agents`,
and `agent_destinations` rows for the voice channel.

## Phase 7: Restart + smoke-test

```bash
systemctl --user restart nanoclaw           # Linux
launchctl kickstart -k gui/$(id -u)/com.nanoclaw   # macOS
```

End-to-end smoke (from voice-stack host):

```bash
BEARER=$(grep -oP 'VOICE_MCP_BEARER=\K.*' /path/to/voice-stack/.env)
curl -sS -X POST http://localhost:3150/ \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json,text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"voice_triggers_init","arguments":{"call_id":"smoke-1","case_type":"case_6b","call_direction":"inbound","counterpart_label":"smoke","lang":"de"}}}' \
  | head -c 200
```

Expect `{"ok":true,"result":{"instructions":"### ROLE & OBJECTIVE..."}}`
(rendered persona, proves Andy's `voice-personas` skill responded).

Verify Andy's container picked up the new MCP server:

```bash
journalctl --user -u nanoclaw -f | grep -E "voice_mcp|mcp__voice-mcp"
# Or, from within an Andy chat: "Andy, kannst du Anrufe entgegennehmen?"
# Andy should reference voice-outbound/voice-channel skills and confirm yes.
```

## Architecture summary

```
Lenovo1                                                   Hetzner
─────────                                               ──────────
NanoClaw host process (carsten_bot)                     mcp-voice-channel stack
  src/channels/voice.ts ──── HTTP long-poll ──────────► voice-mcp (port 3150)
                                                              │
Andy container                                                │  voice-mcp tools
  voice-mcp stdio shim ◄──── stdio MCP ─── Andy              │  (StreamableHTTP)
       │                                                      │
       └───────── HTTP fetch (Bearer) ─────────────────────► /
                                                          (also: FreeSWITCH,
                                                           voice-bridge,
                                                           webhook-forwarder)
```

Two independent connections — one host-side (channel adapter, long-poll
for inbound voice questions) and one per-Andy-container (stdio MCP shim,
for outbound dispatch + cost queries + persona triggers). Both target the
same voice-mcp HTTP server.

## Tear down

```bash
# 1. Drop wiring + messaging-group
pnpm exec tsx scripts/q.ts data/v2.db "DELETE FROM messaging_group_agents WHERE messaging_group_id='mg-voice'"
pnpm exec tsx scripts/q.ts data/v2.db "DELETE FROM messaging_groups WHERE id='mg-voice'"

# 2. Remove env vars
sed -i '/^VOICE_MCP_URL=/d; /^VOICE_MCP_BEARER=/d' .env

# 3. Drop voice-mcp from container.json `mcpServers` and `additionalMounts`
#    (manual edit per agent group)

# 4. Drop mount-allowlist entry
#    (manual edit ~/.config/nanoclaw/mount-allowlist.json)

# 5. Remove container skills
rm -rf container/skills/voice-{outbound,personas,channel}

# 6. Restart
systemctl --user restart nanoclaw
```

The voice-stack on Hetzner stays untouched.

## Migration notes

- **From v1 install (pre-Pattern-B):** the v1 trunk-patch approach
  (voice-mcp-client.ts, voice-respond-manager.ts, container voice-request
  envelopes) is obsolete in v2. Run `git rm` on those files; v2's
  `src/channels/voice.ts` replaces them.
- **From `mcp-voice-channel/scripts/install.sh`:** that script is v1-only
  (expects `<nanoclaw>/src/mcp-tools/`). Use this skill for v2 instead.
