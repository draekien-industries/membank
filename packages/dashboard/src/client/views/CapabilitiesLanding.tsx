import { useEffect, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { listCapabilities } from "@/lib/api";
import type { CapabilitiesResponse, Capability } from "@/lib/types";
import { capitalize } from "@/lib/utils";

function useCapabilities() {
  const [data, setData] = useState<CapabilitiesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listCapabilities()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading };
}

function CapabilityRow({ capability }: { capability: Capability }) {
  const name = capability.key.slice(capability.kind.length + 1);
  return (
    <AppLink
      to="/capabilities/$capabilityKey"
      params={{ capabilityKey: encodeURIComponent(capability.key) }}
      className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent/40 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
          {capitalize(capability.kind)}
        </Badge>
        <span className="text-xs font-mono text-foreground truncate">{name}</span>
      </div>
      <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-4">
        {capability.memoryCount} {capability.memoryCount === 1 ? "memory" : "memories"}
      </span>
    </AppLink>
  );
}

function CapabilityGroup({ title, capabilities }: { title: string; capabilities: Capability[] }) {
  if (capabilities.length === 0) return null;
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
          {title}
        </h2>
        <span className="text-[11px] font-mono text-muted-foreground">{capabilities.length}</span>
      </header>
      <div className="border border-border rounded-md overflow-hidden">
        {capabilities.map((cap) => (
          <CapabilityRow key={cap.id} capability={cap} />
        ))}
      </div>
    </section>
  );
}

export function CapabilitiesLanding() {
  const { data, isLoading } = useCapabilities();

  const tools = data?.tools ?? [];
  const skills = data?.skills ?? [];
  const total = tools.length + skills.length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-sm font-mono font-medium text-foreground">
            Tool &amp; Skill Memories
          </h1>
          {!isLoading && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {total} {total === 1 ? "capability" : "capabilities"}
            </span>
          )}
        </header>

        {isLoading && (
          <div className="flex items-center justify-center h-24 text-xs font-mono text-muted-foreground">
            Loading…
          </div>
        )}

        {!isLoading && total === 0 && (
          <Empty>
            <EmptyTitle>No capability memories yet</EmptyTitle>
            <EmptyDescription>
              Memories attached to tools and skills will appear here once your AI saves them with a
              tool or skill scope.
            </EmptyDescription>
          </Empty>
        )}

        {!isLoading && total > 0 && (
          <>
            <CapabilityGroup title="Tools" capabilities={tools} />
            <CapabilityGroup title="Skills" capabilities={skills} />
          </>
        )}
      </section>
    </div>
  );
}
