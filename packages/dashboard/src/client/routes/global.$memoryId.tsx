import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useWorkspaceMemoryDetail } from "@/hooks/useWorkspaceMemoryDetail";
import { WorkspaceMemoryDetailForm } from "@/views/WorkspaceMemoryDetail";

export const Route = createFileRoute("/global/$memoryId")({
  component: GlobalMemoryDetailPage,
});

function GlobalMemoryDetailPage() {
  const { memoryId } = Route.useParams();
  const navigate = useNavigate();
  const onClose = () => void navigate({ to: "/global", search: (prev) => prev });

  const {
    memory,
    isLoading,
    availableProjects,
    handleApprove,
    handleAddProject,
    handleRemoveProject,
    handleClose,
  } = useWorkspaceMemoryDetail(memoryId, onClose);

  if (isLoading || !memory) {
    return (
      <div className="flex items-center justify-center h-full text-xs font-mono text-muted-foreground">
        {isLoading ? "Loading…" : "Memory not found"}
      </div>
    );
  }

  return (
    <WorkspaceMemoryDetailForm
      key={memory.id}
      memory={memory}
      availableProjects={availableProjects}
      handleApprove={handleApprove}
      handleAddProject={handleAddProject}
      handleRemoveProject={handleRemoveProject}
      handleClose={handleClose}
    />
  );
}
