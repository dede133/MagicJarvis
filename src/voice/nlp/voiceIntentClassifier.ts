import { containerBootstrap } from '@nlpjs/core'
import { LangEs } from '@nlpjs/lang-es'
import { NluManager, NluNeural } from '@nlpjs/nlu'
import {
  VOICE_INTENT_TRAINING_EXAMPLES,
  isVoiceNlpActionIntent,
  type VoiceNlpIntent,
} from './voiceIntentCorpus'

type NlpClassification = {
  intent?: string
  score?: number
}

type NlpProcessResult = {
  intent?: string
  score?: number
  classifications?: NlpClassification[]
}

type VoiceNluManager = {
  add(locale: string, utterance: string, intent: string): void
  train(): Promise<void>
  process(locale: string, utterance: string): Promise<NlpProcessResult>
}

export type VoiceIntentClassification = {
  transcript: string
  intent: VoiceNlpIntent | 'None' | string
  score: number
  isActionIntent: boolean
  alternatives: readonly { intent: string; score: number }[]
}

let classifierPromise: Promise<VoiceNluManager> | undefined

const createClassifier = async (): Promise<VoiceNluManager> => {
  const container = await containerBootstrap()
  container.use(LangEs)
  container.use(NluNeural)

  const manager = new NluManager({
    container,
    locales: ['es'],
    trainByDomain: false,
  }) as VoiceNluManager

  for (const [intent, utterances] of Object.entries(
    VOICE_INTENT_TRAINING_EXAMPLES,
  )) {
    for (const utterance of utterances) manager.add('es', utterance, intent)
  }

  await manager.train()
  return manager
}

const getClassifier = (): Promise<VoiceNluManager> => {
  classifierPromise ??= createClassifier().catch((error: unknown) => {
    // Allow a later retry after transient initialization/bundling failures.
    classifierPromise = undefined
    throw error
  })
  return classifierPromise
}

/** Starts training eagerly so the first classified utterance avoids warmup latency. */
export const warmVoiceIntentClassifier = async (): Promise<void> => {
  await getClassifier()
}

/**
 * Intent classification only. This module never mutates GameState or creates
 * gameplay actions itself; shadow/assisted policy lives in the voice pipeline.
 */
export const classifyVoiceIntent = async (
  transcript: string,
): Promise<VoiceIntentClassification> => {
  const manager = await getClassifier()
  const result = await manager.process('es', transcript)
  const intent = result.intent ?? 'None'
  const score = result.score ?? 0
  const alternatives = (result.classifications ?? [])
    .filter(
      (candidate): candidate is Required<NlpClassification> =>
        typeof candidate.intent === 'string' &&
        typeof candidate.score === 'number',
    )
    .slice(0, 3)

  return {
    transcript,
    intent,
    score,
    isActionIntent: isVoiceNlpActionIntent(intent),
    alternatives,
  }
}
