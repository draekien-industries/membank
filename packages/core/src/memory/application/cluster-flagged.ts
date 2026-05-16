export interface FlagCluster {
  clusterId: string;
  memoryIds: string[];
}

export function clusterFlagged(
  edges: Array<{ memoryId: string; conflictingMemoryId: string }>
): FlagCluster[] {
  const parent = new Map<string, string>();

  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id) as string;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  for (const { memoryId, conflictingMemoryId } of edges) {
    union(memoryId, conflictingMemoryId);
  }

  const clusters = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const members = clusters.get(root) ?? [];
    members.push(id);
    clusters.set(root, members);
  }

  return Array.from(clusters.entries()).map(([clusterId, memoryIds]) => ({
    clusterId,
    memoryIds,
  }));
}
