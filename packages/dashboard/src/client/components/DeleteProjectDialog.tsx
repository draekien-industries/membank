import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useProjectMutation } from "@/hooks/useProjectMutation";
import { deleteProject } from "@/lib/api";
import type { Project } from "@/lib/types";

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Pick<Project, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pending, run } = useProjectMutation();

  const handleDelete = async () => {
    const ok = await run(async () => {
      const { deletedMemories } = await deleteProject(project.id);
      return deletedMemories === 0
        ? `Deleted ${project.name}`
        : `Deleted ${project.name} and ${deletedMemories} ${deletedMemories === 1 ? "memory" : "memories"} unique to it`;
    }, "Could not delete the project");
    if (ok) onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Memories that belong only to {project.name} are deleted with it. Memories shared with
            another project are kept. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep project</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending && <Spinner />}
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
