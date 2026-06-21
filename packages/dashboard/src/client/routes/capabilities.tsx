import { createFileRoute } from "@tanstack/react-router";
import { CapabilitiesLanding } from "@/views/CapabilitiesLanding";

export const Route = createFileRoute("/capabilities")({
  component: CapabilitiesLanding,
});
