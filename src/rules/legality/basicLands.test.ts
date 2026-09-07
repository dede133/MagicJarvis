import { describe, expect, it } from 'vitest'
import { basicLandManaColor, isLandCard } from './basicLands'

describe('basic land rule data', () => {
  it.each([
    ['Basic Land — Plains', 'W'],
    ['Basic Land — Island', 'U'],
    ['Basic Land — Swamp', 'B'],
    ['Basic Land — Mountain', 'R'],
    ['Basic Land — Forest', 'G'],
  ])('derives %s mana from its subtype', (typeLine, color) => {
    expect(basicLandManaColor(typeLine)).toBe(color)
  })

  it('does not give a nonbasic land an invented basic mana ability', () => {
    expect(basicLandManaColor('Land')).toBeUndefined()
  })

  it('recognizes lands by type instead of card name', () => {
    expect(isLandCard('Legendary Land')).toBe(true)
  })
})
