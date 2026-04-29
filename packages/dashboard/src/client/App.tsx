import { useCallback, useEffect, useState } from "react";
import { StatsBar } from "@/components/StatsBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getStats } from "@/lib/api";
import type { Memory, Stats } from "@/lib/types";
import { MemoryDetail } from "@/views/MemoryDetail";
import { MemoryList } from "@/views/MemoryList";

function getInitialTheme(): "dark" | "light" {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("membank-theme");
    if (stored === "dark" || stored === "light") return stored;
  }
  return "dark";
}

export function App() {
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("membank-theme", theme);
  }, [theme]);

  const fetchStats = useCallback(() => {
    void getStats().then(setStats);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSaved = (memory: Memory) => {
    fetchStats();
    setSelectedId(memory.id);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
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

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        <div className="w-[380px] shrink-0 border-r border-border overflow-hidden flex flex-col">
          <MemoryList
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefreshStats={fetchStats}
          />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          {selectedId ? (
            <MemoryDetail
              id={selectedId}
              onClose={() => setSelectedId(null)}
              onSaved={handleSaved}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              Select a memory to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
