import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceMemoryDetail } from "@/views/WorkspaceMemoryDetail";

export const Route = createFileRoute("/$projectId/$memoryId")({
  component: WorkspaceMemoryDetailPage,
});

function WorkspaceMemoryDetailPage() {
  const { memoryId } = Route.useParams();
  return <WorkspaceMemoryDetail key={memoryId} id={memoryId} />;
}
