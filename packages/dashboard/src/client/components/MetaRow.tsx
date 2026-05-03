import type { ReactNode } from "react";

interface MetaRowProps {
  label: string;
  value: ReactNode;
}

export function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="flex justify-between text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
