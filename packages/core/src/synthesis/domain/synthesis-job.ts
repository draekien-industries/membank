export type ScopeStatus = "expired" | "dirty" | "missing";

export interface DirtyScope {
  scope: string;
  reason: ScopeStatus;
}
