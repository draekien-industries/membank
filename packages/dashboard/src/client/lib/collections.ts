import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { deleteMemory, patchMemory } from "./api.js";
import type { Memory, MemoryType } from "./types.js";

export const queryClient = new QueryClient();

export const memoriesCollection = createCollection(
  queryCollectionOptions<Memory>({
    queryKey: ["memories"],
    queryFn: async (): Promise<Memory[]> => {
      const res = await fetch("/api/memories");
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<Memory[]>;
    },
    queryClient,
    getKey: (m) => m.id,
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mut) => {
          const c = mut.changes as Partial<Memory>;
          return patchMemory(mut.original.id, {
            content: c.content,
            tags: c.tags,
            type: c.type as MemoryType | undefined,
            pinned: c.pinned,
            needsReview: c.needsReview,
          });
        })
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(transaction.mutations.map((mut) => deleteMemory(mut.original.id)));
    },
  })
);
