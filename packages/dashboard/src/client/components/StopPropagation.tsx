import type { ReactNode } from "react";

export function StopPropagation({ children }: { children: ReactNode }) {
  return (
    <div role="none" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
