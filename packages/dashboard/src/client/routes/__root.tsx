import { useLiveQuery } from "@tanstack/react-db";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StatsBar } from "@/components/StatsBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { memoriesCollection } from "@/lib/collections";
import type { MemoryType, Stats } from "@/lib/types";

export const Route = createRootRoute({ component: RootLayout });

function getInitialTheme(): "dark" | "light" {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("membank-theme");
    if (stored === "dark" || stored === "light") return stored;
  }
  return "dark";
}

function RootLayout() {
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("membank-theme", theme);
  }, [theme]);

  const { data: allMemories = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }),
    []
  );

  const stats = useMemo<Stats | null>(() => {
    if (isLoading) return null;
    const byType = {
      correction: 0,
      preference: 0,
      decision: 0,
      learning: 0,
      fact: 0,
    } as Record<MemoryType, number>;
    let needsReview = 0;
    for (const m of allMemories) {
      const t = m.type as MemoryType;
      if (t in byType) byType[t]++;
      if (m.needsReview) needsReview++;
    }
    return { byType, total: allMemories.length, needsReview };
  }, [allMemories, isLoading]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center gap-4 px-4 py-2.5 border-b border-border shrink-0">
        <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
          membank
        </span>
        <div className="flex-1 min-w-0">
          <StatsBar stats={stats} />
        </div>
        <ThemeToggle
          theme={theme}
          onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        />
      </header>
      <div className="flex flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
