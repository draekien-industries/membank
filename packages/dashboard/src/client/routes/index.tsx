import { createFileRoute } from "@tanstack/react-router";
import { ProjectsLanding } from "@/views/ProjectsLanding";

export const Route = createFileRoute("/")({
  component: ProjectsLanding,
});
