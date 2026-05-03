import { useEffect, useState } from "react";

function getInitialTheme(): "dark" | "light" {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("membank-theme");
    if (stored === "dark" || stored === "light") return stored;
  }
  return "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("membank-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}
