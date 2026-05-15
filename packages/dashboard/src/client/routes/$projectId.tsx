import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  tab: z.enum(["memories", "activity"]).default("memories").catch("memories"),
});

export const Route = createFileRoute("/$projectId")({
  validateSearch: workspaceSearchSchema,
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { projectId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

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
        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ search: (prev) => ({ ...prev, tab: v as "memories" | "activity" }) })
          }
          className="flex flex-col h-full gap-0"
        >
          <TabsList
            variant="line"
            className="px-3 pt-2 pb-0 border-b border-border w-full rounded-none justify-start h-auto"
          >
            <TabsTrigger value="memories">Memories</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="memories" className="flex-1 min-h-0 overflow-hidden">
            <WorkspaceCenter selectedId={selectedId} list={list} />
          </TabsContent>
          <TabsContent value="activity" className="flex-1 min-h-0 overflow-hidden">
            <ActivityTimeline scope={project?.scopeHash} />
          </TabsContent>
        </Tabs>
      </div>
      <div className="w-[65ch] shrink-0 overflow-hidden flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
