import { createFileRoute } from "@tanstack/react-router";
import { ReviewMode } from "@/views/ReviewMode";

export const Route = createFileRoute("/review")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.projectId === "string" && { projectId: search.projectId }),
  }),
  component: ReviewMode,
});
