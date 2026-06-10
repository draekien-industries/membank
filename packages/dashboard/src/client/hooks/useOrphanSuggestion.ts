import { useEffect, useState } from "react";
import { getOrphanSuggestion } from "@/lib/api";
import type { OrphanSuggestion } from "@/lib/types";

export function useOrphanSuggestion(): {
  orphan: OrphanSuggestion | null;
  clear: () => void;
} {
  const [orphan, setOrphan] = useState<OrphanSuggestion | null>(null);

  useEffect(() => {
    let active = true;
    getOrphanSuggestion()
      .then((result) => {
        if (active) setOrphan(result);
      })
      .catch(() => {
        if (active) setOrphan(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return { orphan, clear: () => setOrphan(null) };
}
