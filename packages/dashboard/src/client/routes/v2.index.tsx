import { createFileRoute } from "@tanstack/react-router";
import { V2ProjectsLanding } from "@/views/V2ProjectsLanding";

export const Route = createFileRoute("/v2/")({
  component: V2LandingPage,
});

function V2LandingPage() {
  return <V2ProjectsLanding />;
}
