import { createFileRoute } from "@tanstack/react-router";
import { RetentionMode } from "@/views/RetentionMode";

export const Route = createFileRoute("/retention")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.projectId === "string" && { projectId: search.projectId }),
  }),
  component: RetentionMode,
});
