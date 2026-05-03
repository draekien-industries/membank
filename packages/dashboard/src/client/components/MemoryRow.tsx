import { PushPin, Trash, Warning } from "@phosphor-icons/react";
import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Memory, MemoryType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MemoryRowProps {
  memory: Memory;
  selected: boolean;
  focused: boolean;
  confirming: boolean;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
}

export const MemoryRow = forwardRef<HTMLLIElement, MemoryRowProps>(function MemoryRow(
  {
    memory,
    selected,
    focused,
    confirming,
    onSelect,
    onPin,
    onDelete,
    onDeleteStart,
    onDeleteCancel,
  },
  ref
) {
  const preview = memory.content.length > 140 ? `${memory.content.slice(0, 140)}…` : memory.content;

  return (
    <li
      ref={ref}
      className={cn(
        "group relative flex flex-col gap-1.5 border-b border-border px-4 py-3 transition-colors",
        "hover:bg-accent/40",
        selected && "bg-accent/60",
        focused && !selected && "bg-accent/20",
        focused && "outline-none ring-1 ring-inset ring-primary/40"
      )}
      onMouseLeave={onDeleteCancel}
    >
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          onClick={onSelect}
          className="h-auto flex-1 min-w-0 items-start justify-start whitespace-normal p-0 font-normal hover:bg-transparent"
        >
          <Badge variant={memory.type as MemoryType} className="mt-px shrink-0">
            {memory.type[0]?.toUpperCase()}
            {memory.type.slice(1)}
          </Badge>
          <p className="flex-1 text-xs leading-relaxed text-foreground line-clamp-2 min-w-0 text-left">
            {preview}
          </p>
        </Button>
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity shrink-0",
            memory.pinned
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPin}
            aria-label={memory.pinned ? "Unpin" : "Pin"}
            className={cn(memory.pinned && "text-primary")}
          >
            <PushPin weight={memory.pinned ? "fill" : "regular"} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={confirming ? onDelete : onDeleteStart}
            onBlur={onDeleteCancel}
            aria-label={confirming ? "Confirm delete" : "Delete"}
            className={cn(
              confirming ? "text-destructive bg-destructive/10" : "hover:text-destructive",
              memory.pinned &&
                "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            )}
          >
            <Trash weight={confirming ? "fill" : "regular"} />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[42px]">
        {memory.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {memory.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {memory.needsReview && (
            <Warning weight="fill" className="size-3 text-[var(--type-correction)]" />
          )}
          {memory.projects.length > 0 ? (
            <span className="text-[11px] text-muted-foreground truncate max-w-32">
              {memory.projects.map((p) => p.name).join(", ")}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">global</span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {new Date(memory.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </li>
  );
});
