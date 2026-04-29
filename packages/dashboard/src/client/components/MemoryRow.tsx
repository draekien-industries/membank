import { PushPin, Trash, Warning } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Memory, MemoryType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MemoryRowProps {
  memory: Memory;
  selected: boolean;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
}

const TYPE_ABBREV: Record<MemoryType, string> = {
  correction: "COR",
  preference: "PRF",
  decision: "DEC",
  learning: "LRN",
  fact: "FCT",
};

export function MemoryRow({ memory, selected, onSelect, onPin, onDelete }: MemoryRowProps) {
  const preview = memory.content.length > 140 ? `${memory.content.slice(0, 140)}…` : memory.content;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 border-b border-border px-4 py-3 transition-colors",
        "hover:bg-accent/40",
        selected && "bg-accent/60"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 w-full"
        aria-label="Select memory"
      />
      <div className="relative flex items-start gap-2">
        <Badge variant={memory.type as MemoryType} className="mt-px shrink-0">
          {TYPE_ABBREV[memory.type]}
        </Badge>
        <p className="flex-1 text-xs leading-relaxed text-foreground line-clamp-2 min-w-0">
          {preview}
        </p>
        <div className="relative flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPin}
            aria-label={memory.pinned ? "Unpin" : "Pin"}
            className={cn(memory.pinned && "text-primary opacity-100")}
          >
            <PushPin weight={memory.pinned ? "fill" : "regular"} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete"
            className="hover:text-destructive"
          >
            <Trash weight="regular" />
          </Button>
        </div>
      </div>
      <div className="relative flex items-center gap-2 pl-[42px]">
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
          {memory.scope !== "global" && (
            <span className="text-[10px] text-muted-foreground truncate max-w-24">
              {memory.scope}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(memory.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
