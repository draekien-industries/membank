import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { MemoryList } from "@/views/MemoryList";

const MEMORY_TYPES = ["correction", "preference", "decision", "learning", "fact"] as const;

const memoriesSearchSchema = z.object({
  search: z.string().default("").catch(""),
  type: z.enum(MEMORY_TYPES).optional().catch(undefined),
  pinned: z.boolean().default(false).catch(false),
  needsReview: z.boolean().default(false).catch(false),
  projectId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/memories")({
  validateSearch: memoriesSearchSchema,
  component: MemoriesLayout,
});

function MemoriesLayout() {
  const selectedId = useRouterState({
    select: (s) => {
      const p = s.location.pathname;
      return p.startsWith("/memories/") ? p.slice("/memories/".length) : null;
    },
  });

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div className="w-[380px] shrink-0 border-r border-border overflow-hidden flex flex-col">
        <MemoryList selectedId={selectedId} />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
