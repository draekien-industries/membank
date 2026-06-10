import { ArrowsMergeIcon, GitBranchIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOrphanSuggestion } from "@/hooks/useOrphanSuggestion";
import { useProjectMutation } from "@/hooks/useProjectMutation";
import { reconcileOrphan } from "@/lib/api";

export function OrphanBanner() {
  const { orphan, clear } = useOrphanSuggestion();
  const { pending, run } = useProjectMutation();

  if (orphan === null) return null;

  const parentName = orphan.target.name;

  const handleMerge = async () => {
    const ok = await run(async () => {
      const result = await reconcileOrphan();
      const moved = result?.movedMemories ?? 0;
      return `Merged into ${parentName}, moved ${moved} ${moved === 1 ? "memory" : "memories"}`;
    }, "Could not merge the worktree project");
    if (ok) clear();
  };

  return (
    <Alert>
      <GitBranchIcon />
      <AlertTitle>This looks like a worktree of {parentName}</AlertTitle>
      <AlertDescription>
        <p>
          Memories saved here from "{orphan.orphan.name}" belong to {parentName}. Merge them back so
          the project stays in one place.
        </p>
        <div className="mt-2 flex">
          <Button variant="outline" size="sm" onClick={handleMerge} disabled={pending}>
            {pending ? <Spinner /> : <ArrowsMergeIcon data-icon="inline-start" />}
            Merge into {parentName}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
