import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { projectsCollection } from "@/lib/collections";
import { ProjectSynthesisPanel } from "@/views/ProjectSynthesisPanel";

export const Route = createFileRoute("/v2/$projectId/")({
  component: WorkspaceIndexPanel,
});

function WorkspaceIndexPanel() {
  const { projectId } = Route.useParams();
  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return (
      <Empty>
        <EmptyTitle>Project not found</EmptyTitle>
        <EmptyDescription>This project may have been removed.</EmptyDescription>
      </Empty>
    );
  }

  return <ProjectSynthesisPanel project={project} />;
}
