import { GLOBAL_SCOPE_HASH } from "@membank/core/client";
import { useLiveQuery } from "@tanstack/react-db";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectCardHero } from "@/components/ProjectCardHero";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { projectsCollection } from "@/lib/collections";

export function ProjectsLanding() {
  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const globalProject = projects.find((p) => p.scopeHash === GLOBAL_SCOPE_HASH);
  const rest = projects
    .filter((p) => p.scopeHash !== GLOBAL_SCOPE_HASH)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {globalProject && (
        <section className="space-y-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
            Inherited by all projects
          </span>
          <ProjectCardHero
            projectId={globalProject.id}
            projectName={globalProject.name}
            linkOptions={{ to: "/$projectId", params: { projectId: globalProject.id } }}
          />
        </section>
      )}

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-sm font-mono font-medium text-foreground">Projects</h1>
          <span className="text-[11px] font-mono text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
        </header>

        {rest.length === 0 ? (
          <Empty>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Memories are associated with projects automatically as your AI tools work in different
              repositories.
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rest.map((project) => (
              <ProjectCard
                key={project.id}
                projectId={project.id}
                projectName={project.name}
                linkOptions={{ to: "/$projectId", params: { projectId: project.id } }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
