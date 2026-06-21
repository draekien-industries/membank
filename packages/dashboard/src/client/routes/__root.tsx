import { Moon, Sun } from "@phosphor-icons/react";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { MemoryLogo } from "@/components/MemoryLogo";
import { StatsBar } from "@/components/StatsBar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useStats } from "@/hooks/useStats";
import { useTheme } from "@/hooks/useTheme";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const { theme, toggle } = useTheme();
  const stats = useStats();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center gap-4 px-4 py-2.5 border-b border-border shrink-0">
        <Link to="/" className="shrink-0">
          <MemoryLogo />
        </Link>
        <nav className="flex items-center gap-3 shrink-0">
          <Link
            to="/"
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors [&.active]:text-foreground"
          >
            Projects
          </Link>
          <Link
            to="/capabilities"
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors [&.active]:text-foreground"
          >
            Capabilities
          </Link>
          <Link
            to="/review"
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors [&.active]:text-foreground"
          >
            Review
          </Link>
        </nav>
        <div className="flex-1 min-w-0">
          <StatsBar stats={stats} />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun weight="regular" /> : <Moon weight="regular" />}
        </Button>
      </header>
      <div className="flex flex-1 min-h-0">
        <Outlet />
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
