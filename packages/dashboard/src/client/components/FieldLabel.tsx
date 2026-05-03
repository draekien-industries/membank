import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn("text-[11px] uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    />
  );
}
