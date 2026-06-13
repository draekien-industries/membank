export const DEFAULT_SYNTHESIS_THRESHOLD_WORDS = 150;

export function countWords(memoryContents: readonly string[]): number {
  let total = 0;
  for (const content of memoryContents) {
    const matches = content.match(/\S+/g);
    if (matches !== null) total += matches.length;
  }
  return total;
}
