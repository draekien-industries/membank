export type LineDiff =
  | { kind: "context"; line: string }
  | { kind: "added"; line: string }
  | { kind: "removed"; line: string };

export function diffLines(a: string, b: string): LineDiff[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const m = linesA.length;
  const n = linesB.length;

  // dp[i][j] = LCS length of linesA[0..i-1] and linesB[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const row = dp[i];
    const prevRow = dp[i - 1];
    if (row === undefined || prevRow === undefined) continue;
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        row[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(prevRow[j] ?? 0, row[j - 1] ?? 0);
      }
    }
  }

  const result: LineDiff[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    const lineA = linesA[i - 1];
    const lineB = linesB[j - 1];
    const curr = dp[i];
    const prev = dp[i - 1];

    if (i > 0 && j > 0 && lineA === lineB) {
      result.push({ kind: "context", line: lineA ?? "" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (curr?.[j - 1] ?? 0) >= (prev?.[j] ?? 0))) {
      result.push({ kind: "added", line: lineB ?? "" });
      j--;
    } else {
      result.push({ kind: "removed", line: lineA ?? "" });
      i--;
    }
  }

  result.reverse();
  return result;
}
