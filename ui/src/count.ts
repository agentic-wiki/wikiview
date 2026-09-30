/** "1 entry", "3 entries": a number with its noun, the one way the UI says how
 *  many of something there are. */
export function count(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}
