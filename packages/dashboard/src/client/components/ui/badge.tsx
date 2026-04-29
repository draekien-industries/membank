import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-muted-foreground",
        destructive: "bg-destructive/15 text-destructive",
        correction: "bg-[var(--type-correction)]/15 text-[var(--type-correction)]",
        preference: "bg-[var(--type-preference)]/15 text-[var(--type-preference)]",
        decision: "bg-[var(--type-decision)]/15 text-[var(--type-decision)]",
        learning: "bg-[var(--type-learning)]/15 text-[var(--type-learning)]",
        fact: "bg-[var(--type-fact)]/15 text-[var(--type-fact)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export type { BadgeVariant };
export { Badge, badgeVariants };
