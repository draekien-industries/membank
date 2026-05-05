import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { toast } from "sonner";
import { deleteMemory, listProjects, patchMemory, renameProject } from "./api.js";
import type { Memory, MemoryType, Project } from "./types.js";

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
      try {
        await Promise.all(
          transaction.mutations.map((mut) => {
            const c = mut.changes as Partial<Memory>;
            return patchMemory(mut.original.id, {
              content: c.content,
              tags: c.tags,
              type: c.type as MemoryType | undefined,
              pinned: c.pinned,
            });
          })
        );
      } catch {
        toast.error("Failed to save — changes may not have been stored");
      }
    },
    onDelete: async ({ transaction }) => {
      try {
        await Promise.all(transaction.mutations.map((mut) => deleteMemory(mut.original.id)));
      } catch {
        toast.error("Failed to delete — try again");
      }
    },
  })
);

export const projectsCollection = createCollection(
  queryCollectionOptions<Project>({
    queryKey: ["projects"],
    queryFn: listProjects,
    queryClient,
    getKey: (p) => p.id,
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mut) => {
          const c = mut.changes as Partial<Project>;
          if (c.name !== undefined) {
            return renameProject(mut.original.id, c.name);
          }
          return Promise.resolve();
        })
      );
    },
  })
);
