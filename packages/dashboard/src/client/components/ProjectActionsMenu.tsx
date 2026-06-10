import { DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { MergeProjectDialog } from "@/components/MergeProjectDialog";
import { StopPropagation } from "@/components/StopPropagation";
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

  // The card is an AppLink (<a>). The menu and dialogs are portaled, so they only
  // reach the link via React's event tree — StopPropagation guards against that.
  // The trigger button sits inside the <a> in the DOM, so it also preventDefaults
  // its own click to stop the browser following the link.
  return (
    <StopPropagation>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${project.name}`}
              onClick={(e) => e.preventDefault()}
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setDialog("merge")}>Merge</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              Delete
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
    </StopPropagation>
  );
}
