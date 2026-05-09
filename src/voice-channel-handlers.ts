// src/voice-channel-handlers.ts
//
// Wiring point between the v2-friendly channel-adapter (channels/voice.ts)
// and the per-tool handler logic. INTEGRATION patches collapse to ONE call:
//
//   import { setupVoiceHandlers } from './voice-channel-handlers.js';
//   import { getVoiceChannel } from './channels/voice.js';
//   // ...after channels are wired and the agent runtime is available:
//   const vc = getVoiceChannel();
//   if (vc) setupVoiceHandlers(vc, { spawnVoiceAgent });
//
// Each setHandler call routes one dispatch tool name. Phase-3 ships this
// file as a stub: every tool returns { ok: false, error: 'not_yet_wired' }
// so the channel + dispatch contract can be exercised end-to-end without
// the v1 handler bodies. Phase 4 ports the real bodies (persona render
// from voice-agent-invoker.ts, lang validation, ask_core agent spawn,
// discord post, schedule retry, wake_up) — all driven by the host-supplied
// `spawnVoiceAgent` dependency so this file stays pure and host-agnostic.

import { logger } from './logger.js';
import {
  VoiceChannel,
  VoiceDispatchHandler,
  VoiceDispatchResult,
} from './channels/voice.js';

/**
 * Host-supplied dependency. The single integration shim a v2 trunk needs
 * to provide: a function that runs a voice-context Andy turn and returns
 * the agent's textual reply. Phase 4 will extend this with structured
 * input/output (e.g. case_type → persona render → instructions string)
 * once the container-skill contract is defined.
 */
export interface VoiceHandlerDeps {
  spawnVoiceAgent(args: {
    callId: string;
    tool: string;
    payload: unknown;
    timeoutMs?: number;
  }): Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
}

const DISPATCH_TOOLS = [
  'voice_triggers_init',
  'voice_triggers_transcript',
  'voice_on_transcript_turn',
  'voice_set_language',
  'voice_send_discord_message',
  'voice_ask_core',
  'voice_wake_up',
  'voice_schedule_retry',
] as const;

export function setupVoiceHandlers(
  channel: VoiceChannel,
  _deps: VoiceHandlerDeps,
): void {
  const stub: VoiceDispatchHandler = async (_args): Promise<VoiceDispatchResult> => {
    return { ok: false, error: 'not_yet_wired' };
  };
  for (const tool of DISPATCH_TOOLS) {
    channel.setHandler(tool, stub);
  }
  logger.info({
    event: 'voice_handlers_registered',
    tools: DISPATCH_TOOLS.length,
    note: 'Phase-3 stub — every dispatch returns not_yet_wired. Phase 4 ports the real handler bodies.',
  });
}
