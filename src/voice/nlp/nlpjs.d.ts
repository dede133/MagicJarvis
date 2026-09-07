declare module '@nlpjs/core' {
  export type NlpContainer = {
    use(plugin: unknown): void
  }

  export function containerBootstrap(): Promise<NlpContainer>
}

declare module '@nlpjs/lang-es' {
  export const LangEs: unknown
}

declare module '@nlpjs/nlu' {
  export const NluNeural: unknown
  export class NluManager {
    constructor(options: {
      container: unknown
      locales: string[]
      trainByDomain: boolean
    })
    add(locale: string, utterance: string, intent: string): void
    train(): Promise<void>
    process(
      locale: string,
      utterance: string,
    ): Promise<{
      intent?: string
      score?: number
      classifications?: Array<{ intent?: string; score?: number }>
    }>
  }
}
