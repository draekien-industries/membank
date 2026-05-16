import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { WorkspaceMemoryDetail } from "@/views/WorkspaceMemoryDetail";

interface MemoryDetailDrawerProps {
  selectedId: string;
  projectId: string;
}

export function MemoryDetailDrawer({ selectedId, projectId }: MemoryDetailDrawerProps) {
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = useCallback(() => {
    void navigate({ to: "/$projectId", params: { projectId }, search: (prev) => prev });
  }, [navigate, projectId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close]);

  return (
    <div
      ref={drawerRef}
      className={cn(
        "absolute inset-y-0 right-0 w-[65ch] border-l border-border bg-card",
        "flex flex-col overflow-hidden z-10",
        "transition-transform duration-[180ms] ease-out",
        visible ? "translate-x-0" : "translate-x-full"
      )}
    >
      <WorkspaceMemoryDetail key={selectedId} id={selectedId} />
    </div>
  );
}
