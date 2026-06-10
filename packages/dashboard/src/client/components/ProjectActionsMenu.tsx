import { DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { MergeProjectDialog } from "@/components/MergeProjectDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@/lib/types";

type OpenDialog = "merge" | "delete" | null;

export function ProjectActionsMenu({
  project,
  onProjectRemoved,
}: {
  project: Pick<Project, "id" | "name">;
  onProjectRemoved?: () => void;
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${project.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setDialog("merge")}>
              Merge into another project
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              Delete project
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <MergeProjectDialog
        project={project}
        open={dialog === "merge"}
        onOpenChange={(open) => setDialog(open ? "merge" : null)}
        onSuccess={() => onProjectRemoved?.()}
      />
      <DeleteProjectDialog
        project={project}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onSuccess={() => onProjectRemoved?.()}
      />
    </>
  );
}
