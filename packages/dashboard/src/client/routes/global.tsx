import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { useGlobalMemoryList } from "@/hooks/useGlobalMemoryList";
import { MEMORY_TYPES } from "@/lib/types";
import { GlobalWorkspaceNav } from "@/views/GlobalWorkspaceNav";
import { WorkspaceCenter } from "@/views/WorkspaceCenter";

const globalSearchSchema = z.object({
  search: z.string().default("").catch(""),
  type: z.enum(MEMORY_TYPES).optional().catch(undefined),
  pinned: z.boolean().default(false).catch(false),
  needsReview: z.boolean().default(false).catch(false),
});

export const Route = createFileRoute("/global")({
  validateSearch: globalSearchSchema,
  component: GlobalWorkspaceLayout,
});

function GlobalWorkspaceLayout() {
  const selectedId = useRouterState({
    select: (s) => {
      const p = s.location.pathname;
      return p.startsWith("/global/") ? p.slice("/global/".length) : null;
    },
  });

  const list = useGlobalMemoryList(selectedId);

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div className="w-[200px] shrink-0 overflow-hidden flex flex-col">
        <GlobalWorkspaceNav />
      </div>
      <div className="flex-1 min-w-0 border-x border-border overflow-hidden flex flex-col">
        <WorkspaceCenter selectedId={selectedId} list={list} />
      </div>
      <div className="w-[420px] shrink-0 overflow-hidden flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
