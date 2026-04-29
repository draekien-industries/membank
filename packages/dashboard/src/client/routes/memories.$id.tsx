import { createFileRoute } from "@tanstack/react-router";
import { MemoryDetail } from "@/views/MemoryDetail";

export const Route = createFileRoute("/memories/$id")({
  component: MemoryDetailPage,
});

function MemoryDetailPage() {
  const { id } = Route.useParams();
  return <MemoryDetail key={id} id={id} />;
}
