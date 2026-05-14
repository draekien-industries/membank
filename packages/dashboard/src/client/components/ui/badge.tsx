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
        correction: "bg-correction/15 text-correction",
        preference: "bg-preference/15 text-preference",
        decision: "bg-decision/15 text-decision",
        learning: "bg-learning/15 text-learning",
        fact: "bg-fact/15 text-fact",
        stale: "bg-stale/15 text-stale",
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
