import type { Zone } from '../../types/card'

export type ReplacementEffect = {
  id: string
  sourceInstanceId: string
  optional?: boolean
  firstTimeEachTurn?: boolean
  /** Remove this replacement after it actually replaces one event. */
  consumeOnApply?: boolean
  duration:
    'WHILE_SOURCE_ON_BATTLEFIELD' | 'WHILE_SUBJECT_ON_STACK' | 'PERSISTENT'
  event:
    | { type: 'CREATE_TOKENS' }
    | {
        type: 'MOVE_CARD'
        toZone?: Zone
        subjectInstanceId?: string
      }
  replacement:
    | { type: 'CREATE_TOKEN_COPIES_OF_ATTACHED_PERMANENT' }
    | { type: 'MOVE_CARD'; toZone: Zone }
}
