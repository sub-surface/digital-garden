const NUMERALS: Array<[number, string]> = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
]

/** Converts a positive integer to lowercase Roman numerals (e.g. 28 -> "xxviii"). */
export function toRoman(num: number): string {
  let n = num
  let result = ""
  for (const [value, symbol] of NUMERALS) {
    while (n >= value) {
      result += symbol
      n -= value
    }
  }
  return result || String(num)
}
