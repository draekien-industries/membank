import { eq, useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { addMemoryProject, patchMemory, removeMemoryProject } from "@/lib/api";
import { memoriesCollection, projectsCollection, queryClient } from "@/lib/collections";
import { Route as WorkspaceRoute } from "@/routes/$projectId";

export function useWorkspaceMemoryDetail(id: string) {
  const { projectId } = WorkspaceRoute.useParams();
  const navigate = useNavigate();

  const { data: results = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).where(({ m }) => eq(m.id, id)),
    [id]
  );
  const memory = results[0] ?? null;

  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const handleApprove = () => {
    void patchMemory(id, { needsReview: false }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["memories"] })
    );
  };

  const handleAddProject = async (addProjectId: string): Promise<boolean> => {
    try {
      await addMemoryProject(id, addProjectId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      return true;
    } catch {
      toast.error("Failed to add project — try again");
      return false;
    }
  };

  const handleRemoveProject = async (removeProjectId: string) => {
    try {
      await removeMemoryProject(id, removeProjectId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    } catch {
      toast.error("Failed to remove project — try again");
    }
  };

  const handleClose = () =>
    void navigate({ to: "/$projectId", params: { projectId }, search: (prev) => prev });

  const availableProjects = allProjects.filter(
    (p) => !memory?.projects.some((mp) => mp.id === p.id)
  );

  return {
    memory,
    isLoading,
    availableProjects,
    handleApprove,
    handleAddProject,
    handleRemoveProject,
    handleClose,
  };
}
