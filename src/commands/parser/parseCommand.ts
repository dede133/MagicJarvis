import {
  intentAliases,
  isExactIntent,
  leadingIntent,
  stripEntityFillers,
} from './intents'
import { normalizeCommandText } from './normalizeText'
import type { ParseResult, ParsedCommand } from '../types/commandTypes'
import type { TurnStep } from '../../types/turn'
import type { Zone } from '../../types/card'

const unknown = (normalized: string): ParseResult => ({
  status: 'error',
  normalized,
  error: { code: 'UNKNOWN_COMMAND', message: 'No reconocí ese comando.' },
})

const parseAmount = (value: string | undefined, fallback = 1): number =>
  value ? Number(value) : fallback

const singularColor = (value: string): string =>
  ({
    blancos: 'blanco',
    whites: 'white',
    azules: 'azul',
    blues: 'blue',
    negros: 'negro',
    blacks: 'black',
    rojos: 'rojo',
    reds: 'red',
    verdes: 'verde',
    greens: 'green',
    incoloros: 'incoloro',
  })[value.replace(/\bmana\b/g, '').trim()] ??
  value.replace(/\bmana\b/g, '').trim()

const parseCardTarget = (
  target: string,
): Pick<
  Extract<ParsedCommand, { type: 'TAP_CARD' }>,
  'cardQuery' | 'indexes' | 'count'
> => {
  const cleaned = stripEntityFillers(target)
  const indexed = /^(.*?)\s+(\d+(?:[\s,]+(?:y\s+)?\d+)+)$/.exec(cleaned)
  if (indexed)
    return {
      cardQuery: indexed[1],
      indexes: [...indexed[2].matchAll(/\d+/g)].map(([value]) => Number(value)),
    }
  const singleIndex = /^(.*?)\s+(\d+)$/.exec(cleaned)
  if (singleIndex)
    return { cardQuery: singleIndex[1], indexes: [Number(singleIndex[2])] }
  const count = /^(\d+)\s+(.+)$/.exec(cleaned)
  if (count) return { cardQuery: count[2], count: Number(count[1]) }
  return { cardQuery: cleaned }
}

const parseLife = (normalized: string): ParsedCommand | undefined => {
  const adjusted =
    /^(pierdo|me quito|me hago|me bajo|recibo|me como|gano|me curo|me subo)\s+(\d+)(?:\s+vidas?)?$/.exec(
      normalized,
    )
  if (adjusted)
    return {
      type: ['gano', 'me curo', 'me subo'].includes(adjusted[1])
        ? 'GAIN_LIFE'
        : 'LOSE_LIFE',
      amount: Number(adjusted[2]),
    }
  const set =
    /^(?:estoy a|me pongo a|ponme a|tengo)\s+(\d+)(?:\s+vidas?)?$/.exec(
      normalized,
    )
  return set ? { type: 'SET_LIFE', amount: Number(set[1]) } : undefined
}

const parseHiddenZoneCount = (
  normalized: string,
): ParsedCommand | undefined => {
  const handPatterns = [
    /^(?:tengo )?(\d+) cartas? en (?:la )?mano$/,
    /^(?:me quedan )?(\d+) (?:cartas? )?(?:en )?(?:la )?mano$/,
    /^(?:mano|cartas en mano) (\d+)$/,
  ]
  for (const pattern of handPatterns) {
    const match = pattern.exec(normalized)
    if (match) return { type: 'SET_HAND_COUNT', count: Number(match[1]) }
  }

  const libraryPatterns = [
    /^(?:tengo |me quedan )?(\d+) (?:cartas? )?(?:en )?(?:la )?(?:biblioteca|mazo)$/,
    /^(?:biblioteca|mazo|cartas en (?:la )?(?:biblioteca|mazo)) (\d+)$/,
  ]
  for (const pattern of libraryPatterns) {
    const match = pattern.exec(normalized)
    if (match) return { type: 'SET_LIBRARY_COUNT', count: Number(match[1]) }
  }

  return undefined
}

const moveZoneAliases: Record<string, Zone> = {
  cementerio: 'graveyard',
  graveyard: 'graveyard',
  exilio: 'exile',
  exile: 'exile',
  mano: 'hand',
  hand: 'hand',
  biblioteca: 'library',
  library: 'library',
  mazo: 'library',
  'campo de batalla': 'battlefield',
  battlefield: 'battlefield',
  mesa: 'battlefield',
  'zona de mando': 'command',
  'command zone': 'command',
  command: 'command',
}

const parseIndexedCardQuery = (
  value: string,
): { cardQuery: string; index?: number } => {
  const cleaned = stripEntityFillers(value)
  const indexed = /^(.*?)\s+(\d+)$/.exec(cleaned)
  return indexed
    ? { cardQuery: indexed[1], index: Number(indexed[2]) }
    : { cardQuery: cleaned }
}

const parseMoveCard = (normalized: string): ParsedCommand | undefined => {
  const explicitExile = /^(?:exilio|exiliar)\s+(.+)$/.exec(normalized)
  if (explicitExile)
    return {
      type: 'MOVE_CARD',
      ...parseIndexedCardQuery(explicitExile[1]),
      destination: 'exile',
    }

  const move = /^(?:muevo|mueve|mover|mando|manda|mandar|paso|pasa)\s+(.+?)\s+(?:a|al)\s+(?:la\s+)?(.+)$/.exec(
    normalized,
  )
  if (move) {
    const destination = moveZoneAliases[move[2]]
    if (destination)
      return {
        type: 'MOVE_CARD',
        ...parseIndexedCardQuery(move[1]),
        destination,
      }
  }

  const returning = /^(?:devuelvo|devuelve|devolver|regreso|regresa)\s+(.+?)\s+(?:a|al)\s+(?:la\s+)?(.+)$/.exec(
    normalized,
  )
  if (returning) {
    const destination = moveZoneAliases[returning[2]]
    if (destination)
      return {
        type: 'MOVE_CARD',
        ...parseIndexedCardQuery(returning[1]),
        destination,
      }
  }

  const shorthand = /^(.+?)\s+(?:va|vuelve)\s+(?:a|al)\s+(?:la\s+)?(.+)$/.exec(
    normalized,
  )
  if (shorthand) {
    const destination = moveZoneAliases[shorthand[2]]
    if (destination)
      return {
        type: 'MOVE_CARD',
        ...parseIndexedCardQuery(shorthand[1]),
        destination,
      }
  }

  const direct = /^(.+?)\s+(?:a|al)\s+(?:la\s+)?(cementerio|graveyard|exilio|exile|mano|hand|biblioteca|library|zona de mando|command zone)$/.exec(
    normalized,
  )
  if (!direct) return undefined
  return {
    type: 'MOVE_CARD',
    ...parseIndexedCardQuery(direct[1]),
    destination: moveZoneAliases[direct[2]],
  }
}

const parseMana = (normalized: string): ParsedCommand | undefined => {
  const matched = /^(\S+)\s+(\d+)\s+(.+)$/.exec(normalized)
  if (!matched) return undefined
  const verb = matched[1]
  const amount = Number(matched[2])
  if (intentAliases.ADD_MANA.includes(verb as never))
    return { type: 'ADD_MANA', amount, colorQuery: singularColor(matched[3]) }
  if (intentAliases.SPEND_MANA.includes(verb as never))
    return { type: 'SPEND_MANA', amount, colorQuery: singularColor(matched[3]) }
  return undefined
}

export const parseCommand = (input: string): ParseResult => {
  const normalized = normalizeCommandText(input)
  if (!normalized) return unknown(normalized)

  const responsePrefix = /^(?:en respuesta|respondo con)\s+(.+)$/.exec(
    normalized,
  )
  if (responsePrefix) {
    const responseText = responsePrefix[1]
    const parsedResponse = parseCommand(
      /^(?:activo|activa|activar|uso|lanzo|lanza|lanzar|casteo|castear|cast|tiro)\b/.test(
        responseText,
      )
        ? responseText
        : `lanzo ${responseText}`,
    )
    if (
      parsedResponse.status === 'parsed' &&
      (parsedResponse.command.type === 'CAST_SPELL' ||
        parsedResponse.command.type === 'ACTIVATE_ABILITY')
    )
      return {
        status: 'parsed',
        normalized,
        command: { ...parsedResponse.command, inResponse: true },
      }
    return parsedResponse
  }

  if (isExactIntent(normalized, 'UNDO'))
    return { status: 'parsed', normalized, command: { type: 'UNDO' } }
  if (normalized === 'concedo' || normalized === 'me rindo')
    return { status: 'parsed', normalized, command: { type: 'CONCEDE' } }
  if (
    isExactIntent(normalized, 'NEXT_TURN') ||
    /^(?:termino|acabo|cierro) (?:el )?turno$|^(?:te cedo|te doy) el turno$/.test(
      normalized,
    )
  )
    return { status: 'parsed', normalized, command: { type: 'NEXT_TURN' } }
  const turnTargets: Record<string, TurnStep> = {
    upkeep: 'UPKEEP',
    mantenimiento: 'UPKEEP',
    'voy a mantenimiento': 'UPKEEP',
    'paso a mantenimiento': 'UPKEEP',
    'robo del turno': 'DRAW',
    'paso de robar': 'DRAW',
    'voy al robo': 'DRAW',
    'voy a primera principal': 'MAIN_1',
    'primera principal': 'MAIN_1',
    'main 1': 'MAIN_1',
    'voy a main 1': 'MAIN_1',
    combate: 'BEGIN_COMBAT',
    'voy a combate': 'BEGIN_COMBAT',
    'vamos a combate': 'BEGIN_COMBAT',
    'inicio de combate': 'BEGIN_COMBAT',
    'segunda principal': 'MAIN_2',
    'voy a segunda principal': 'MAIN_2',
    'main 2': 'MAIN_2',
    'voy a main 2': 'MAIN_2',
    'final de turno': 'END_STEP',
    'paso final': 'END_STEP',
    'paso a final': 'END_STEP',
    'voy al final': 'END_STEP',
    'end step': 'END_STEP',
  }
  if (normalized === 'siguiente fase' || normalized === 'siguiente paso')
    return { status: 'parsed', normalized, command: { type: 'ADVANCE_STEP' } }
  if (normalized === 'empiezo turno')
    return { status: 'parsed', normalized, command: { type: 'START_TURN' } }
  if (turnTargets[normalized])
    return {
      status: 'parsed',
      normalized,
      command: { type: 'ADVANCE_STEP', targetStep: turnTargets[normalized] },
    }
  if (
    /^(?:dano|daño)(?: de combate)?$|^(?:vamos a |resuelve )?(?:dano|daño)$/.test(
      normalized,
    )
  )
    return {
      status: 'parsed',
      normalized,
      command: { type: 'RESOLVE_COMBAT_DAMAGE' },
    }
  const externalAttack =
    /^(?:(?:el|mi) )?(?:rival|oponente) ataca con (.+)$/.exec(normalized)
  if (externalAttack)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_EXTERNAL_ATTACKER',
        cardQuery: stripEntityFillers(externalAttack[1]),
      },
    }

  const attackPlaneswalker = /^ataco (?:a|al) (.+?) con (.+)$/.exec(
    normalized,
  )
  if (attackPlaneswalker) {
    const attackersText = attackPlaneswalker[2]
    const all = /^(?:todos|todas)(?: mis)?(?: los| las)?(?: (.+))?$/.exec(
      attackersText,
    )
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: all
          ? []
          : attackersText.split(/\s+y\s+|\s*,\s*/).filter(Boolean),
        ...(all ? { all: true as const, ...(all[1] ? { subtype: all[1] } : {}) } : {}),
        defenderQuery: attackPlaneswalker[1],
      },
    }
  }
  const attackAll = /^ataco con todos(?: mis)?(?: los)?(?: (.+))?$/.exec(
    normalized,
  )
  if (attackAll)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: [],
        all: true,
        ...(attackAll[1] ? { subtype: attackAll[1] } : {}),
      },
    }
  const attack = /^ataco con (.+)$/.exec(normalized)
  if (attack)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: attack[1].split(/\s+y\s+|\s*,\s*/).filter(Boolean),
      },
    }
  const declarativeBlocks = normalized.split(
    /\s+y\s+(?=[^,]+?\s+(?:bloquea|defiende)(?:\s+a)?\s+)/,
  )
  const blockAssignments = declarativeBlocks.map((segment) =>
    /^(.+?)\s+(?:bloquea|defiende)(?:\s+a)?\s+(.+)$/.exec(segment),
  )
  if (
    blockAssignments.length > 0 &&
    blockAssignments.every((assignment) => assignment !== null)
  )
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_BLOCKERS',
        blockerQueries: [],
        assignments: blockAssignments.map((assignment) => ({
          blockerQuery: stripEntityFillers(assignment?.[1] ?? ''),
          attackerQuery: stripEntityFillers(assignment?.[2] ?? ''),
        })),
      },
    }
  if (
    /^(?:sin bloqueos?|sin bloquear|no bloqueo|no bloqueamos|no hay bloqueos?|nadie bloquea|no bloquea nadie)$/.test(
      normalized,
    )
  )
    return {
      status: 'parsed',
      normalized,
      command: { type: 'DECLARE_BLOCKERS', blockerQueries: [], none: true },
    }
  const blocking = /^(?:bloqueo|defiendo)(?:\s+a)?\s+(.+?)\s+con\s+(.+)$/.exec(normalized)
  if (blocking)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_BLOCKERS',
        attackerQuery: blocking[1],
        blockerQueries: blocking[2].split(/\s+y\s+|\s*,\s*/).filter(Boolean),
      },
    }
  const blockers = /^(?:bloqueo|defiendo) con (.+)$/.exec(normalized)
  if (blockers)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_BLOCKERS',
        blockerQueries: blockers[1].split(/\s+y\s+|\s*,\s*/).filter(Boolean),
      },
    }
  const assistedBlocker = /^(.+) queda bloqueado$/.exec(normalized)
  if (assistedBlocker)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_ASSISTED_BLOCKER',
        attackerQuery: assistedBlocker[1],
      },
    }
  const receivesDamage = /^(.+) recibe (\d+)$/.exec(normalized)
  if (receivesDamage)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_DAMAGE',
        targetQuery: receivesDamage[1],
        amount: Number(receivesDamage[2]),
      },
    }
  const playerDamage = /^me hacen (\d+)$/.exec(normalized)
  if (playerDamage)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_DAMAGE',
        targetQuery: 'yo',
        amount: Number(playerDamage[1]),
      },
    }
  if (/^(?:ataco|atacar|bloqueo|bloquear|defiendo|defender)\b/.test(normalized))
    return { status: 'parsed', normalized, command: { type: 'COMBAT_ACTION' } }
  if (/^(?:que )?resuelva$|^resuelve (?:el|lo) de arriba$|^que resuelva (?:el|lo) de arriba$/.test(normalized))
    return { status: 'parsed', normalized, command: { type: 'RESOLVE_SPELL' } }
  const resolveRemainder = leadingIntent(normalized, 'RESOLVE_SPELL')
  if (resolveRemainder !== undefined)
    return {
      status: 'parsed',
      normalized,
      command: resolveRemainder
        ? {
            type: 'RESOLVE_SPELL',
            cardQuery: stripEntityFillers(resolveRemainder),
          }
        : { type: 'RESOLVE_SPELL' },
    }
  if (
    /^(?:(?:mi |el )?(?:oponente|rival) baraja|baraja (?:mi |el )?(?:oponente|rival))$/.test(
      normalized,
    )
  )
    return {
      status: 'parsed',
      normalized,
      command: { type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' },
    }
  if (/^barajo(?: (?:mi )?(?:biblioteca|mazo))?$/.test(normalized))
    return {
      status: 'parsed',
      normalized,
      command: { type: 'DECLARE_PLAYER_SHUFFLED', player: 'local' },
    }

  const hiddenZoneCount = parseHiddenZoneCount(normalized)
  if (hiddenZoneCount)
    return { status: 'parsed', normalized, command: hiddenZoneCount }

  const life = parseLife(normalized)
  if (life) return { status: 'parsed', normalized, command: life }
  const mana = parseMana(normalized)
  if (mana) return { status: 'parsed', normalized, command: mana }

  const drawRemainder = leadingIntent(normalized, 'DRAW')
  if (drawRemainder !== undefined) {
    const draw = /^(?:(\d+)(?:\s+cartas?)?|una?(?:\s+carta)?|cartas?)?$/.exec(
      drawRemainder,
    )
    if (draw)
      return {
        status: 'parsed',
        normalized,
        command: { type: 'DRAW', amount: parseAmount(draw[1]) },
      }
  }

  const discardRemainder = leadingIntent(normalized, 'DISCARD_CARD')
  const discardText =
    discardRemainder ?? /^tiro\s+(.+)\s+al cementerio$/.exec(normalized)?.[1]
  if (discardText !== undefined) {
    const amountAndCard = /^(?:(\d+)\s+)?(.+)$/.exec(discardText)
    if (amountAndCard) {
      const amount = parseAmount(amountAndCard[1])
      const rawTarget = amountAndCard[2]
      const target = stripEntityFillers(rawTarget).replace(/\s+cartas?$/, '')
      return {
        status: 'parsed',
        normalized,
        command:
          rawTarget === 'carta desconocida'
            ? { type: 'DISCARD_CARD', amount, unknown: true }
            : { type: 'DISCARD_CARD', cardQuery: target, amount },
      }
    }
  }

  const moveCard = parseMoveCard(normalized)
  if (moveCard) return { status: 'parsed', normalized, command: moveCard }

  const castRemainder = leadingIntent(normalized, 'CAST_SPELL')
  if (castRemainder !== undefined) {
    const libraryTopPattern =
      /\s+(?:desde|de)\s+(?:(?:la\s+)?parte\s+superior|arriba|el\s+top)(?:\s+de)?\s+(?:la\s+)?biblioteca$/
    const fromLibraryTop = libraryTopPattern.test(castRemainder)
    const castText = fromLibraryTop
      ? castRemainder.replace(libraryTopPattern, '').trim()
      : castRemainder
    const targeted = /^(.*?)\s+(?:al|a)\s+(.+)$/.exec(castText)
    return {
      status: 'parsed',
      normalized,
      command: targeted
        ? {
            type: 'CAST_SPELL',
            cardQuery: stripEntityFillers(targeted[1]),
            targetQuery: stripEntityFillers(targeted[2]),
            ...(fromLibraryTop ? { fromZone: 'library' as const } : {}),
          }
        : {
            type: 'CAST_SPELL',
            cardQuery: stripEntityFillers(castText),
            ...(fromLibraryTop ? { fromZone: 'library' as const } : {}),
          },
    }
  }

  const activateForMana =
    /^(?:activo|uso)(?: la habilidad de)?\s+(.+?)\s+para(?:\s+mana)?(?:\s+(.+))?$/.exec(
      normalized,
    )
  if (activateForMana)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'ACTIVATE_MANA',
        cardQuery: stripEntityFillers(activateForMana[1]),
        ...(activateForMana[2]
          ? { colorQuery: stripEntityFillers(activateForMana[2]) }
          : {}),
      },
    }

  const channelActivation = /^(?:canalizo|canalizar|channel|channeleo|hago channel(?: de)?|uso channel(?: de)?)\s+(.+)$/.exec(
    normalized,
  )
  if (channelActivation)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'ACTIVATE_ABILITY',
        cardQuery: stripEntityFillers(channelActivation[1]),
        abilityHint: 'CHANNEL',
      },
    }

  const waterbendActivation = /^(?:waterbend|waterbendeo|hago waterbend(?: de)?|uso waterbend(?: de)?)\s+(.+)$/.exec(
    normalized,
  )
  if (waterbendActivation)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'ACTIVATE_ABILITY',
        cardQuery: stripEntityFillers(waterbendActivation[1]),
        abilityHint: 'WATERBEND',
      },
    }

  const equipActivation = /^(?:equipo|equipar|equipeo|equip)\s+(.+)$/.exec(
    normalized,
  )
  if (equipActivation && !/\s+a\s+/.test(equipActivation[1]))
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'ACTIVATE_ABILITY',
        cardQuery: stripEntityFillers(equipActivation[1]),
        abilityHint: 'EQUIP',
      },
    }

  const activateRemainder = leadingIntent(normalized, 'ACTIVATE_ABILITY')
  if (activateRemainder !== undefined) {
    const target = activateRemainder.replace(/^la habilidad de\s+/, '')
    if (target)
      return {
        status: 'parsed',
        normalized,
        command: {
          type: 'ACTIVATE_ABILITY',
          cardQuery: stripEntityFillers(target),
        },
      }
  }

  const tapRemainder = leadingIntent(normalized, 'TAP_CARD')
  if (tapRemainder) {
    const manaActivation =
      /^(.*?)\s+para(?:\s+(?:mana|maná))?(?:\s+(.+))?$/.exec(tapRemainder)
    if (manaActivation)
      return {
        status: 'parsed',
        normalized,
        command: {
          type: 'ACTIVATE_MANA',
          cardQuery: stripEntityFillers(manaActivation[1]),
          ...(manaActivation[2]
            ? { colorQuery: singularColor(manaActivation[2]) }
            : {}),
        },
      }
    return {
      status: 'parsed',
      normalized,
      command: { type: 'TAP_CARD', ...parseCardTarget(tapRemainder) },
    }
  }
  if (
    /^(?:enderezo|destapo|untap) (?:todo|todos|todos mis permanentes|todo mi campo)$/.test(
      normalized,
    )
  )
    return { status: 'parsed', normalized, command: { type: 'UNTAP_ALL' } }

  const untapRemainder = leadingIntent(normalized, 'UNTAP_CARD')
  if (untapRemainder)
    return {
      status: 'parsed',
      normalized,
      command: { type: 'UNTAP_CARD', ...parseCardTarget(untapRemainder) },
    }

  const playRemainder = leadingIntent(normalized, 'PLAY_CARD')
  if (playRemainder)
    return {
      status: 'parsed',
      normalized,
      command: {
        type: 'DECLARE_CARD',
        cardQuery: stripEntityFillers(playRemainder),
      },
    }
  return unknown(normalized)
}
