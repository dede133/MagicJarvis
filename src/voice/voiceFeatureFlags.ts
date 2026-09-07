/** Experimental voice features kept behind isolated switches for easy rollback. */
export const VOICE_FEATURE_FLAGS = {
  // Resolve choices that are already visible in PendingAbilities/PendingDecisions
  // before the generic gate/NLP/parser pipeline.
  contextualUiActionsEnabled: true,
  commandGateEnabled: false,
  multiCommandEnabled: true,
  // Experimental, user-selectable from VoiceCommandControls.
  continuousListeningEnabled: true,
  // Keep the old shadow switch available for A/B diagnostics. Assisted mode below
  // classifies once inside the shared execution pipeline.
  nlpIntentShadowEnabled: true,
  // V3 semantic command engine. Phase 1 keeps deterministic V2 comparison data;
  // phase 2 authorizes only the initial safe semantic families. V2 remains fallback.
  semanticVoiceV3Enabled: true,
  semanticVoiceV3ExecutionEnabled: true,
  semanticVoiceV3ShadowCompareEnabled: true,
  // NLP.js is diagnostic only in V3. It must never block, rescue or authorize an action.
  nlpIntentAssistedEnabled: false,
  // Manual calibration only: user feedback is stored locally and can be
  // exported as JSON. It never retrains or changes runtime decisions.
  nlpFeedbackEnabled: true,
} as const
