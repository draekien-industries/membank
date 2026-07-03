import { typeColorVariants } from "@/lib/typeColors";
import type { MemoryType } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CompositionBarProps {
  counts: Record<MemoryType, number>;
  className?: string;
}

const MIN_SEGMENT_WIDTH = 3;

export function CompositionBar({ counts, className }: CompositionBarProps) {
  const total = MEMORY_TYPES.reduce((sum, type) => sum + counts[type], 0);

  if (total === 0) {
    return (
      <div
        role="img"
        aria-label="No memories"
        className={cn("w-full h-1 rounded-full bg-border/40", className)}
      />
    );
  }

  const segments = MEMORY_TYPES.filter((type) => counts[type] > 0);
  const label = segments.map((type) => `${counts[type]} ${type}`).join(", ");

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex items-stretch w-full h-1 gap-[2px]", className)}
    >
      {segments.map((type) => (
        <div
          key={type}
          title={`${type} · ${counts[type]}`}
          className={cn("rounded-full opacity-75", typeColorVariants({ type, tone: "bg" }))}
          style={{ width: `${(counts[type] / total) * 100}%`, minWidth: MIN_SEGMENT_WIDTH }}
        />
      ))}
    </div>
  );
}
