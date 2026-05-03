import { MagnifyingGlass } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/memories/")({
  component: EmptyDetail,
});

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <MagnifyingGlass weight="regular" className="size-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">Select a memory to view or edit</p>
      <p className="text-[10px] text-muted-foreground/60">
        Press{" "}
        <kbd className="font-mono px-1 py-0.5 rounded border border-border text-[10px]">/</kbd> to
        search
      </p>
    </div>
  );
}
