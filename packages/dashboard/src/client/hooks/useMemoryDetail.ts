import { eq, useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { addMemoryProject, removeMemoryProject } from "@/lib/api";
import { memoriesCollection, projectsCollection, queryClient } from "@/lib/collections";

export function useMemoryDetail(id: string) {
  const navigate = useNavigate();

  const { data: results = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).where(({ m }) => eq(m.id, id)),
    [id]
  );
  const memory = results[0] ?? null;

  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const handleApprove = () => {
    memoriesCollection.update(id, (draft) => {
      draft.needsReview = false;
    });
  };

  const handleAddProject = async (projectId: string): Promise<boolean> => {
    try {
      await addMemoryProject(id, projectId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      return true;
    } catch {
      toast.error("Failed to add project — try again");
      return false;
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    try {
      await removeMemoryProject(id, projectId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    } catch {
      toast.error("Failed to remove project — try again");
    }
  };

  const handleClose = () => void navigate({ to: "/memories" });

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
