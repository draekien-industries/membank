import { createFileRoute } from "@tanstack/react-router";
import { ProjectsLanding } from "@/views/ProjectsLanding";

export const Route = createFileRoute("/v2/")({
  component: ProjectsLanding,
});
