import { DEFAULT_THRESHOLDS, type Thresholds } from "@membank/core/client";
import { useEffect, useState } from "react";
import { getThresholds } from "@/lib/api";

// Falls back to the shipped defaults until the server answers: the thresholds only affect
// labelling, so a brief default is better than withholding the view behind a second request.
export function useThresholds(): Thresholds {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);

  useEffect(() => {
    let active = true;
    getThresholds()
      .then((t) => {
        if (active) setThresholds(t);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return thresholds;
}
