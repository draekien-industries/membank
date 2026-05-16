import { useLiveQuery } from "@tanstack/react-db";
import { ProjectCard } from "@/components/ProjectCard";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { projectsCollection } from "@/lib/collections";

export function ProjectsLanding() {
  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-mono font-medium text-foreground">Projects</h1>
        <span className="text-[11px] font-mono text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
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
