# Integration patches for shared NanoClaw files

Applying the voice-channel skill requires not just dropping files in place
(those are in this repo), but also modifying four shared files in the
target NanoClaw checkout. This document describes those patches.

The `/add-voice-channel` skill's SKILL.md walks through each one. This
file is a reference for what the skill applies.

## 1. `src/mcp-tools/index.ts`

Add the voice-tool registry plug-in.

**Add imports (near existing `SlowBrainSessionManager` import):**

```ts
import type { VoiceTriggersInitInput } from './voice-triggers-init.js';
import type { VoiceTriggersTranscriptInput } from './voice-triggers-transcript.js';
import { VoiceRespondManager } from '../voice-channel/index.js';
import { registerVoiceTools } from '../voice-channel/register-tools.js';
import {
  checkMidCallMutation,
  type ToolMeta,
} from '../voice-mid-call-gateway.js';
```

**Re-export `voiceTriggerQueue`:**

```ts
export { voiceTriggerQueue } from '../voice-channel/register-tools.js';
```

**Inside `buildDefaultRegistry()`, after sweep-timer setup, add:**

```ts
registerVoiceTools(registry, { ...deps, sessionManager });
```

**Extend `RegistryDeps` with voice-related fields** (sendDiscordMessage,
getMainGroupAndJid, activeSessionTracker, invokeAgent, invokeAgentTurn,
voiceRespondManager, tryInjectVoiceRequest, triggerWakeUp). See
`src/voice-channel/register-tools.ts` for the exact shape consumed.

**Replace the dispatch-path gateway** in `ToolRegistry.invoke()` to call
`checkMidCallMutation` before invoking a mutating tool's handler.

## 2. `src/index.ts`

Wire the voice orchestrator into the host process.

**Add import:**

```ts
import { setupVoiceOrchestrator } from './voice-channel/index.js';
```

**Add module-level setup call** (after `GroupQueue` instantiation):

```ts
const voice = setupVoiceOrchestrator({
  getRegisteredGroups: () => registeredGroups,
  sendVoiceRequest: (jid, callId, prompt) =>
    queue.sendVoiceRequest(jid, callId, prompt),
  enqueueMessageCheck: (jid) => queue.enqueueMessageCheck(jid),
});
```

**In `processMessage`** (the runAgent callback), add:

```ts
const isWakeUpTurn = voice.isWakeUpTurn(prompt);
// ...
if (voice.handleResponseMarker(result, voice.manager)) {
  resetIdleTimer();
  queue.notifyIdle(chatJid);
  return;
}
```

**In the `buildDefaultRegistry` call**, pass voice deps:

```ts
const sharedRegistry = buildDefaultRegistry({
  // ...existing deps...
  tryInjectVoiceRequest: voice.tryInjectVoiceRequest,
  voiceRespondManager: voice.manager,
  triggerWakeUp: voice.triggerWakeUp,
});
```

**After `startMcpServer`, start the WS client:**

```ts
voice.startWsClient(sharedRegistry);
```

`GroupQueue` must implement `sendVoiceRequest(jid, callId, prompt)` — if
it doesn't already, that's a small addition (drop a JSON file into the
container's input directory).

## 3. `src/config.ts`

Re-export voice config symbols at the end of the file:

```ts
export {
  VOICE_DISCORD_ALLOWED_CHANNELS_RAW,
  VOICE_DISCORD_ALLOWED_CHANNELS,
  VOICE_DISCORD_TIMEOUT_MS,
  CONTRACTS_PATH,
  PRACTICE_PROFILE_PATH,
  SKILLS_DIR,
  ASK_CORE_CLAUDE_TIMEOUT_MS,
  ASK_CORE_MAX_TOKENS_PER_CALL,
  ASK_CORE_ANDY_TIMEOUT_MS,
  ANDY_VOICE_DISCORD_CHANNEL,
  BRIDGE_OUTBOUND_URL,
  BRIDGE_OUTBOUND_AUTH_TOKEN,
  VOICE_ACTIVE_SESSION_WINDOW_MS,
  VOICE_NOTIFY_LONG_TEXT_WORD_THRESHOLD,
  CASE_2_RETRY_LADDER_MIN,
  CASE_2_DAILY_CAP,
  CASE_2_TIME_TOLERANCE_MIN_DEFAULT,
  CASE_2_PARTY_SIZE_TOLERANCE_DEFAULT,
} from './voice-channel/config.js';
```

These are needed by non-voice consumers (skill-loader,
active-session-tracker, tests) that import from `config.js`.

## 4. `container/agent-runner/src/index.ts`

Wire voice-request IPC handling into the agent main loop.

**Add import:**

```ts
import {
  isVoiceRequestEnvelope,
  consumeVoiceRequest,
  takePendingVoiceRequest,
} from './voice-request.js';
```

**Add `ContainerVoiceResponse` interface to the output union:**

```ts
interface ContainerVoiceResponse extends ContainerOutputBase {
  status: 'voice_response';
  result: string | null;
  call_id: string;
  discord_long?: string | null;
}
type ContainerOutput = ContainerSuccess | ContainerError | ContainerVoiceResponse;
```

**In `drainIpcInput`**, add the envelope branch:

```ts
} else if (isVoiceRequestEnvelope(data)) {
  messages.push(consumeVoiceRequest(data));
}
```

**In the result-emit path**, replace the `success` writeOutput with:

```ts
const voiceCallId = takePendingVoiceRequest();
if (voiceCallId) {
  writeOutput({
    status: 'voice_response',
    result: textResult || null,
    call_id: voiceCallId,
    discord_long: null,
    newSessionId,
  });
} else {
  writeOutput({ status: 'success', result: textResult || null, newSessionId });
}
```

## Why patches and not pure git-merge?

The voice-channel skill could in theory be applied via
`git merge voice/main`, but only if this repo's history shares a recent
common ancestor with the target NanoClaw checkout. NanoClaw evolves
independently; users may be on upstream `qwibitai/nanoclaw`, on
`carstenf/nanoclaw`, or a custom fork. To keep the skill robust across
all of them, the integration is split:

- **Pure file additions** (everything in this repo's tree): copied or
  merged additively. No conflicts possible since these paths don't exist
  in baseline NanoClaw.
- **Modifications to shared files** (the four above): applied as patches
  documented here. Small enough that conflicts with upstream evolution
  are easy to resolve by hand or by a savvy LLM running the skill.

The `/add-voice-channel` SKILL.md walks the install-Claude through both.

## Skill-uninstall

The reverse — also documented in
[`carstenf/nanoclaw-state` `voice-channel-spec/SKILL-EXTRACTION-PLAN.md`](https://github.com/carstenf/nanoclaw-state)
under "Skill-uninstall paths".
