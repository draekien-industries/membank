import { eq, useLiveQuery } from "@tanstack/react-db";
import { toast } from "sonner";
import { addMemoryProject, deleteMemory, patchMemory, removeMemoryProject } from "@/lib/api";
import { memoriesCollection, projectsCollection, queryClient } from "@/lib/collections";

export function useWorkspaceMemoryDetail(id: string, onClose: () => void) {
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

  const handleDeleteConflicting = async (conflictingId: string) => {
    try {
      await deleteMemory(conflictingId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    } catch {
      toast.error("Failed to delete — try again");
    }
  };

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
    handleDeleteConflicting,
    handleClose: onClose,
  };
}
