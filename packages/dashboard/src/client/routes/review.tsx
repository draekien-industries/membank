import { createFileRoute } from "@tanstack/react-router";
import { ReviewMode } from "@/views/ReviewMode";

export const Route = createFileRoute("/review")({
  component: ReviewMode,
});
