import { MagnifyingGlass } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { projectsCollection } from "@/lib/collections";
import { Route as MemoriesRoute } from "@/routes/memories";
import { ProjectSynthesisPanel } from "@/views/ProjectSynthesisPanel";

export const Route = createFileRoute("/memories/")({
  component: MemoriesIndexPanel,
});

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <MagnifyingGlass weight="regular" className="size-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">Select a memory to view or edit</p>
      <p className="text-[10px] text-muted-foreground/60">
        Press{" "}
        <kbd className="font-mono px-1 py-0.5 rounded border border-border text-[10px]">/</kbd> to
        search
      </p>
    </div>
  );
}

function MemoriesIndexPanel() {
  const { projectId } = MemoriesRoute.useSearch();
  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  if (projectId && projectId !== "global") {
    const project = allProjects.find((p) => p.id === projectId);
    if (project) {
      return <ProjectSynthesisPanel project={project} />;
    }
  }

  return <EmptyDetail />;
}
