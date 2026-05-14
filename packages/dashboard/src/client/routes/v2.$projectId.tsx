import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
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

export const Route = createFileRoute("/v2/$projectId")({
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
      const prefix = `/v2/${projectId}/`;
      return p.startsWith(prefix) ? p.slice(prefix.length) : null;
    },
  });

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div className="w-[200px] shrink-0 overflow-hidden flex flex-col">
        <WorkspaceNav projectName={projectName} />
      </div>
      <div className="flex-1 min-w-0 border-x border-border overflow-hidden flex flex-col">
        <WorkspaceCenter selectedId={selectedId} />
      </div>
      <div className="w-[420px] shrink-0 overflow-hidden flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
