import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { memoriesCollection, projectsCollection } from "@/lib/collections";
import type { MemoryType, ProjectStats } from "@/lib/types";

export function ProjectsLanding() {
  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);
  const { data: allMemories = [], isLoading: memoriesLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }),
    []
  );

  const globalStats = useMemo<ProjectStats | undefined>(() => {
    if (memoriesLoading) return undefined;
    const globals = allMemories.filter((m) => m.projects.length === 0);
    const byType = { correction: 0, preference: 0, decision: 0, learning: 0, fact: 0 } as Record<
      MemoryType,
      number
    >;
    let needsReview = 0;
    for (const m of globals) {
      const t = m.type as MemoryType;
      if (t in byType) byType[t]++;
      if (m.reviewEvents.length > 0) needsReview++;
    }
    return {
      total: globals.length,
      byType,
      needsReview,
      pinned: 0,
      mostCommonType: null,
      lastActive: null,
      harness: null,
      activeDays: 0,
    };
  }, [allMemories, memoriesLoading]);

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-mono font-medium text-foreground">Projects</h1>
        <span className="text-[11px] font-mono text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""} · {allMemories.length} total
        </span>
      </header>

      {projects.length === 0 ? (
        <Empty>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>
            Memories are associated with projects automatically as your AI tools work in different
            repositories.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ProjectCard
            projectId="global"
            projectName="Global"
            linkOptions={{ to: "/global" }}
            statsOverride={globalStats}
          />
          {sortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              linkOptions={{ to: "/$projectId", params: { projectId: project.id } }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
