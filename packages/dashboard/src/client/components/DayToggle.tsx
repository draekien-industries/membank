import { cva } from "class-variance-authority";
import { StopPropagation } from "@/components/StopPropagation";
import { cn } from "@/lib/utils";

export type DaysOption = 30 | 14 | 7;
export const DAY_OPTIONS = [30, 14, 7] as const satisfies readonly DaysOption[];

export const dayToggleVariants = cva(
  "text-[11px] font-mono px-1.5 py-0.5 rounded transition-colors",
  {
    variants: {
      active: {
        true: "bg-muted text-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { active: false },
  }
);

interface DayToggleProps {
  days: DaysOption;
  onDaysChange: (d: DaysOption) => void;
  className?: string;
}

export function DayToggle({ days, onDaysChange, className }: DayToggleProps) {
  return (
    <StopPropagation>
      <div className={cn("flex gap-0.5", className)}>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={dayToggleVariants({ active: days === d })}
            onClick={() => onDaysChange(d)}
          >
            {`${d}d`}
          </button>
        ))}
      </div>
    </StopPropagation>
  );
}
