import { GLOBAL_SCOPE_HASH } from "@membank/core/client";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useProjectMutation } from "@/hooks/useProjectMutation";
import { mergeProjects } from "@/lib/api";
import { projectsCollection } from "@/lib/collections";
import type { Project } from "@/lib/types";

export function MergeProjectDialog({
  project,
  open,
  onOpenChange,
  onSuccess,
}: {
  project: Pick<Project, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);
  const [targetId, setTargetId] = useState<string | null>(null);
  const { pending, run } = useProjectMutation();

  const candidates = projects
    .filter((p) => p.id !== project.id && p.scopeHash !== GLOBAL_SCOPE_HASH)
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectItems = candidates.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
  }));

  const handleOpenChange = (next: boolean) => {
    if (!next) setTargetId(null);
    onOpenChange(next);
  };

  const handleMerge = async () => {
    if (targetId === null) return;
    const ok = await run(async () => {
      const result = await mergeProjects(project.id, targetId);
      const moved = result.movedMemories;
      return `Moved ${moved} ${moved === 1 ? "memory" : "memories"} into ${result.target.name}`;
    }, "Could not merge the project");
    if (ok) {
      handleOpenChange(false);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {project.name} into another project</DialogTitle>
          <DialogDescription>
            Memories move to the project you choose, and {project.name} is removed.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No other projects are available to merge into.
          </p>
        ) : (
          <Select items={selectItems} value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleMerge} disabled={pending || targetId === null}>
            {pending && <Spinner />}
            Merge project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
