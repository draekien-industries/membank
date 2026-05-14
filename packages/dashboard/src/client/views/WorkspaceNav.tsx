import { ArrowLeft, PushPin, Warning } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { MemoryType } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { Route as WorkspaceRoute } from "@/routes/v2.$projectId";

interface WorkspaceNavProps {
  projectName: string;
}

export function WorkspaceNav({ projectName }: WorkspaceNavProps) {
  const { projectId } = WorkspaceRoute.useParams();
  const search = WorkspaceRoute.useSearch();
  const navigate = useNavigate();

  const setType = (type: MemoryType | undefined) =>
    void navigate({
      to: "/v2/$projectId",
      params: { projectId },
      search: (prev) => ({ ...prev, type }),
    });

  const togglePinned = () =>
    void navigate({
      to: "/v2/$projectId",
      params: { projectId },
      search: (prev) => ({ ...prev, pinned: !prev.pinned }),
    });

  const toggleReview = () =>
    void navigate({
      to: "/v2/$projectId",
      params: { projectId },
      search: (prev) => ({ ...prev, needsReview: !prev.needsReview }),
    });

  return (
    <nav className="flex flex-col h-full bg-background border-r border-border py-3 overflow-y-auto">
      <div className="px-4">
        <Link
          to="/v2"
          className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft weight="regular" className="size-3" />
          Projects
        </Link>
        <p className="text-xs font-mono font-medium text-foreground truncate mt-3 mb-4">
          {projectName}
        </p>
      </div>

      <div className="mb-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1 px-4">
          Types
        </p>
        <button
          type="button"
          onClick={() => setType(undefined)}
          className={cn(
            "w-full text-left py-1 px-4 text-xs font-mono transition-colors",
            !search.type
              ? "text-primary bg-muted/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          )}
        >
          All
        </button>
        {MEMORY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "w-full text-left py-1 px-4 text-xs font-mono transition-colors",
              search.type === t
                ? "text-primary bg-muted/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            {capitalize(t)}
          </button>
        ))}
      </div>

      <div className="border-t border-border my-3" />

      <button
        type="button"
        onClick={togglePinned}
        className={cn(
          "flex items-center gap-2 px-4 py-1 text-xs font-mono transition-colors w-full text-left",
          search.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <PushPin weight={search.pinned ? "fill" : "regular"} className="size-3 shrink-0" />
        Pinned only
      </button>

      <button
        type="button"
        onClick={toggleReview}
        className={cn(
          "flex items-center gap-2 px-4 py-1 text-xs font-mono transition-colors w-full text-left",
          search.needsReview ? "text-destructive" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Warning weight={search.needsReview ? "fill" : "regular"} className="size-3 shrink-0" />
        Needs review
      </button>
    </nav>
  );
}
