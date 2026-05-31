export const CHUNK_MAX_CHARS = 60_000;
export const MAX_EXTRACTION_CHUNKS = 10;

const TURN_SEPARATOR = "\n\n";

export function chunkTurns(turns: string[], maxChars: number = CHUNK_MAX_CHARS): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    chunks.push(current.join(TURN_SEPARATOR));
    current = [];
    currentLen = 0;
  };

  for (const turn of turns) {
    // A single turn larger than the budget can't share a chunk; hard-slice it so no
    // individual agent call is overloaded.
    if (turn.length > maxChars) {
      flush();
      for (let offset = 0; offset < turn.length; offset += maxChars) {
        chunks.push(turn.slice(offset, offset + maxChars));
      }
      continue;
    }

    const withTurn =
      currentLen === 0 ? turn.length : currentLen + TURN_SEPARATOR.length + turn.length;
    if (withTurn > maxChars) {
      flush();
      current.push(turn);
      currentLen = turn.length;
    } else {
      current.push(turn);
      currentLen = withTurn;
    }
  }

  flush();
  return chunks;
}
