/** Counts blue-bearing Scryfall mana symbols, including hybrid and Phyrexian forms. */
export const countBlueManaSymbols = (manaCost?: string): number =>
  manaCost
    ? [...manaCost.matchAll(/\{([^}]*)\}/g)].filter(([, symbol]) =>
        symbol.toLocaleUpperCase().includes('U'),
      ).length
    : 0
