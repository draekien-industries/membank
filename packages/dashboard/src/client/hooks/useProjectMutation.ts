import { useState } from "react";
import { toast } from "sonner";
import { queryClient } from "@/lib/collections";

export function useProjectMutation(): {
  pending: boolean;
  run: (action: () => Promise<string>, errorMessage: string) => Promise<boolean>;
} {
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<string>, errorMessage: string): Promise<boolean> => {
    setPending(true);
    try {
      const message = await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["memories"] }),
      ]);
      toast.success(message);
      return true;
    } catch {
      toast.error(errorMessage);
      return false;
    } finally {
      setPending(false);
    }
  };

  return { pending, run };
}
