export type Suit = "clubs" | "diamonds" | "hearts" | "spades"
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
export type Card = { id: string; suit: Suit; rank: Rank; faceUp: boolean }
export type Selection = { source: "waste" | "tableau" | "foundation"; pile: number; index: number }

export interface SolitaireGame {
  seed: number
  stock: Card[]
  waste: Card[]
  foundations: Card[][]
  tableau: Card[][]
}

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"]
export const isRed = (card: Card) => card.suit === "diamonds" || card.suit === "hearts"

function rng(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function deal(seed: number): SolitaireGame {
  const random = rng(seed)
  const deck: Card[] = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      rank: (index + 1) as Rank,
      faceUp: false,
    })),
  )
  for (let index = deck.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1))
    ;[deck[index], deck[target]] = [deck[target], deck[index]]
  }

  const tableau: Card[][] = []
  for (let pile = 0; pile < 7; pile++) {
    const cards = deck.splice(0, pile + 1)
    cards[cards.length - 1] = { ...cards[cards.length - 1], faceUp: true }
    tableau.push(cards)
  }
  return { seed, stock: deck, waste: [], foundations: [[], [], [], []], tableau }
}

export function revealTail(pile: Card[]): Card[] {
  if (!pile.length || pile[pile.length - 1].faceUp) return pile
  return pile.map((card, index) => index === pile.length - 1 ? { ...card, faceUp: true } : card)
}

export function canStack(card: Card, target?: Card): boolean {
  if (!target) return card.rank === 13
  return target.faceUp && isRed(card) !== isRed(target) && card.rank === target.rank - 1
}

export function canFound(card: Card, target?: Card, foundationSuit?: Suit): boolean {
  if (foundationSuit && (card.suit !== foundationSuit || (target && target.suit !== foundationSuit))) return false
  if (!target) return card.rank === 1
  return card.suit === target.suit && card.rank === target.rank + 1
}

export function selectedCards(game: SolitaireGame, selection: Selection): Card[] {
  if (selection.source === "waste") return game.waste.slice(-1)
  if (selection.source === "foundation") return game.foundations[selection.pile].slice(-1)
  return game.tableau[selection.pile].slice(selection.index)
}

export function removeSelection(game: SolitaireGame, selection: Selection): SolitaireGame {
  if (selection.source === "waste") return { ...game, waste: game.waste.slice(0, -1) }
  if (selection.source === "foundation") {
    return {
      ...game,
      foundations: game.foundations.map((pile, index) => index === selection.pile ? pile.slice(0, -1) : pile),
    }
  }
  return {
    ...game,
    tableau: game.tableau.map((pile, index) =>
      index === selection.pile ? revealTail(pile.slice(0, selection.index)) : pile,
    ),
  }
}
