import { ArrowLeft, PushPin, Warning } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cva } from "class-variance-authority";
import { AppLink } from "@/components/AppLink";
import { MEMORY_TYPES } from "@/lib/types";
import { capitalize } from "@/lib/utils";
import { Route as WorkspaceRoute } from "@/routes/$projectId";

interface WorkspaceNavProps {
  projectName: string;
}

const navFilterButtonVariants = cva(
  "block w-full text-left py-1 px-4 text-xs font-mono transition-colors",
  {
    variants: {
      active: {
        true: "text-primary bg-muted/50",
        false: "text-muted-foreground hover:text-foreground hover:bg-muted/30",
      },
    },
    defaultVariants: { active: false },
  }
);

const navToggleButtonVariants = cva(
  "flex items-center gap-2 px-4 py-1 text-xs font-mono transition-colors w-full text-left",
  {
    variants: {
      active: { true: "", false: "text-muted-foreground hover:text-foreground" },
      color: { primary: "", destructive: "" },
    },
    compoundVariants: [
      { active: true, color: "primary", class: "text-primary" },
      { active: true, color: "destructive", class: "text-destructive" },
    ],
    defaultVariants: { active: false, color: "primary" },
  }
);

export function WorkspaceNav({ projectName }: WorkspaceNavProps) {
  const { projectId } = WorkspaceRoute.useParams();
  const search = WorkspaceRoute.useSearch();

  return (
    <nav className="flex flex-col h-full bg-background border-r border-border py-3 overflow-y-auto">
      <div className="px-4">
        <Link
          to="/"
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
        <AppLink
          to="/$projectId"
          params={{ projectId }}
          search={(prev) => ({ ...prev, type: undefined })}
          className={navFilterButtonVariants({ active: !search.type })}
        >
          All
        </AppLink>
        {MEMORY_TYPES.map((t) => (
          <AppLink
            key={t}
            to="/$projectId"
            params={{ projectId }}
            search={(prev) => ({ ...prev, type: t })}
            className={navFilterButtonVariants({ active: search.type === t })}
          >
            {capitalize(t)}
          </AppLink>
        ))}
      </div>

      <div className="border-t border-border my-3" />

      <AppLink
        to="/$projectId"
        params={{ projectId }}
        search={(prev) => ({ ...prev, pinned: !prev.pinned })}
        className={navToggleButtonVariants({ active: search.pinned, color: "primary" })}
      >
        <PushPin weight={search.pinned ? "fill" : "regular"} className="size-3 shrink-0" />
        Pinned only
      </AppLink>

      <AppLink
        to="/$projectId"
        params={{ projectId }}
        search={(prev) => ({ ...prev, needsReview: !prev.needsReview })}
        className={navToggleButtonVariants({ active: search.needsReview, color: "destructive" })}
      >
        <Warning weight={search.needsReview ? "fill" : "regular"} className="size-3 shrink-0" />
        Needs review
      </AppLink>
    </nav>
  );
}
