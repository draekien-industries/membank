import { createFileRoute } from "@tanstack/react-router";
import { CapabilityDetail } from "@/views/CapabilityDetail";

export const Route = createFileRoute("/capabilities/$capabilityKey")({
  component: CapabilityDetailPage,
});

function CapabilityDetailPage() {
  const { capabilityKey } = Route.useParams();
  return <CapabilityDetail capabilityKey={capabilityKey} />;
}
