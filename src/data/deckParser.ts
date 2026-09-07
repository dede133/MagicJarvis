import type { DeckEntry, DeckList } from '../types/deck'

export class DeckParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(message)
    this.name = 'DeckParseError'
  }
}

type Section = 'COMMANDER' | 'DECK' | 'SIDEBOARD' | 'MAYBEBOARD' | undefined

const parseEntry = (line: string, lineNumber: number): DeckEntry => {
  const match =
    /^(\d+)\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+([^\s]+))?(?:\s+\*(F|E)\*)?$/.exec(
      line.trim(),
    )
  if (!match)
    throw new DeckParseError(
      'Expected a quantity followed by a card name.',
      lineNumber,
    )

  const quantity = Number(match[1])
  const name = match[2].trim()
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    throw new DeckParseError(
      'Card quantity must be a positive integer.',
      lineNumber,
    )
  if (!name) throw new DeckParseError('Card name cannot be empty.', lineNumber)
  return {
    quantity,
    name,
    ...(match[3] ? { setCode: match[3] } : {}),
    ...(match[4] ? { collectorNumber: match[4] } : {}),
    ...(match[5] === 'F' ? { foil: true } : {}),
    ...(match[5] === 'E' ? { etched: true } : {}),
  }
}

const sectionFromHeader = (line: string): Section => {
  if (line === '[COMMANDER]' || line === '// COMMANDER') return 'COMMANDER'
  if (line === '[DECK]' || line === '// DECK') return 'DECK'
  if (line === '// SIDEBOARD') return 'SIDEBOARD'
  if (line === '// MAYBEBOARD') return 'MAYBEBOARD'
  return undefined
}

/** Parses both the original MagicJarvis format and common exported deck-list sections. */
export const parseDeckList = (text: string): DeckList => {
  let section: Section
  let exportedCommanderBlock = false
  let exportedCommanderBlockEnded = false
  const commanders: DeckEntry[] = []
  const mainboard: DeckEntry[] = []
  const sideboard: DeckEntry[] = []
  const maybeboard: DeckEntry[] = []

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) {
      if (
        section === 'COMMANDER' &&
        exportedCommanderBlock &&
        commanders.length > 0
      )
        exportedCommanderBlockEnded = true
      return
    }
    const header = sectionFromHeader(line)
    if (header) {
      section = header
      exportedCommanderBlock = line === '// COMMANDER'
      exportedCommanderBlockEnded = false
      return
    }
    if (!section)
      throw new DeckParseError(
        'Card entries must be under a section.',
        index + 1,
      )
    const entry = parseEntry(line, index + 1)
    if (
      section === 'COMMANDER' &&
      (!exportedCommanderBlock || !exportedCommanderBlockEnded)
    )
      commanders.push(entry)
    else if (section === 'COMMANDER' || section === 'DECK')
      mainboard.push(entry)
    else if (section === 'SIDEBOARD') sideboard.push(entry)
    else maybeboard.push(entry)
  })

  if (!commanders.length)
    throw new DeckParseError('A commander entry is required.')
  return {
    commanders,
    // Keep the current single-commander runtime working until Partner gameplay is added.
    commander: commanders[0],
    mainboard,
    ...(sideboard.length ? { sideboard } : {}),
    ...(maybeboard.length ? { maybeboard } : {}),
  }
}
