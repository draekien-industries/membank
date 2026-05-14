import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { useWorkspaceMemoryList } from "@/hooks/useWorkspaceMemoryList";
import { projectsCollection } from "@/lib/collections";
import { MEMORY_TYPES } from "@/lib/types";
import { WorkspaceCenter } from "@/views/WorkspaceCenter";
import { WorkspaceNav } from "@/views/WorkspaceNav";

const workspaceSearchSchema = z.object({
  search: z.string().default("").catch(""),
  type: z.enum(MEMORY_TYPES).optional().catch(undefined),
  pinned: z.boolean().default(false).catch(false),
  needsReview: z.boolean().default(false).catch(false),
});

export const Route = createFileRoute("/$projectId")({
  validateSearch: workspaceSearchSchema,
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { projectId } = Route.useParams();

  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);
  const project = projects.find((p) => p.id === projectId);
  const projectName = project?.name ?? projectId;

  const selectedId = useRouterState({
    select: (s) => {
      const p = s.location.pathname;
      const prefix = `/${projectId}/`;
      return p.startsWith(prefix) ? p.slice(prefix.length) : null;
    },
  });

  const list = useWorkspaceMemoryList(selectedId);

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div className="w-50 shrink-0 overflow-hidden flex flex-col">
        <WorkspaceNav projectName={projectName} />
      </div>
      <div className="flex-1 min-w-0 border-x border-border overflow-hidden flex flex-col">
        <WorkspaceCenter selectedId={selectedId} list={list} />
      </div>
      <div className="max-w-prose shrink-0 overflow-hidden flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
