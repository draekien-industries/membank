import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/memories/")({
  component: () => (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
      Select a memory to view details
    </div>
  ),
});
