/** Groups items newest-decade-first; items without a year fall into one "Undated" group at the end. */
export function groupByDecade<T extends { year?: number }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const label = item.year ? `${Math.floor(item.year / 10) * 10}s` : "Undated"
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(item)
  }
  return [...groups.entries()]
}
