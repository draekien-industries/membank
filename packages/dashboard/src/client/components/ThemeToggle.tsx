import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  theme: "dark" | "light";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun weight="regular" /> : <Moon weight="regular" />}
    </Button>
  );
}
