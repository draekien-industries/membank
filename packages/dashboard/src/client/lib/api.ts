import type {
  ActivityDay,
  ActivityEvent,
  ActivityEventFilter,
  BulkOpResult,
  CapabilitiesResponse,
  Filters,
  Memory,
  MemoryCluster,
  MemoryType,
  MemoryVersion,
  MergeResult,
  OrphanSuggestion,
  Project,
  ProjectStats,
  SessionContext,
  Stats,
  Synthesis,
  SynthesisVersion,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function buildQs(params: URLSearchParams): string {
  const s = params.toString();
  return s ? `?${s}` : "";
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getMemory(id: string): Promise<Memory> {
  return request<Memory>(`/memories/${id}`);
}

export function listMemories(filters: Partial<Filters>): Promise<Memory[]> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.pinned) params.set("pinned", "true");
  if (filters.needsReview) params.set("needsReview", "true");
  if (filters.search) params.set("search", filters.search);
  return request<Memory[]>(`/memories${buildQs(params)}`);
}

export function getStats(): Promise<Stats> {
  return request<Stats>("/stats");
}

export function patchMemory(
  id: string,
  patch: {
    content?: string;
    tags?: string[];
    type?: MemoryType;
    pinned?: boolean;
    needsReview?: boolean;
  }
): Promise<Memory> {
  return request<Memory>(`/memories/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteMemory(id: string): Promise<void> {
  return request<void>(`/memories/${id}`, { method: "DELETE" });
}

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/projects");
}

export function renameProject(id: string, name: string): Promise<Project> {
  return request<Project>(`/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function getOrphanSuggestion(): Promise<OrphanSuggestion | null> {
  return request<OrphanSuggestion | null>("/projects/orphan");
}

export function reconcileOrphan(): Promise<MergeResult | null> {
  return postJson<MergeResult | null>("/projects/reconcile", {});
}

export function mergeProjects(sourceId: string, targetId: string): Promise<MergeResult> {
  return postJson<MergeResult>(`/projects/${sourceId}/merge`, { targetId });
}

export function deleteProject(id: string): Promise<{ ok: true; deletedMemories: number }> {
  return request<{ ok: true; deletedMemories: number }>(`/projects/${id}`, { method: "DELETE" });
}

export function addMemoryProject(memoryId: string, projectId: string): Promise<void> {
  return postJson<void>(`/memories/${memoryId}/projects`, { projectId });
}

export function removeMemoryProject(memoryId: string, projectId: string): Promise<void> {
  return request<void>(`/memories/${memoryId}/projects/${projectId}`, {
    method: "DELETE",
  });
}

export function listSyntheses(): Promise<Synthesis[]> {
  return request<Synthesis[]>("/syntheses");
}

export function runProjectSynthesis(projectId: string, memoryType?: MemoryType): Promise<void> {
  return postJson<void>(`/projects/${projectId}/synthesis`, memoryType ? { memoryType } : {});
}

export function resetProjectSynthesis(projectId: string): Promise<void> {
  return request<void>(`/projects/${projectId}/synthesis/in-flight`, { method: "DELETE" });
}

export function getProjectStats(projectId: string): Promise<ProjectStats> {
  return request<ProjectStats>(`/projects/${projectId}/stats`);
}

export function getProjectActivity(projectId: string, days?: number): Promise<ActivityDay[]> {
  const qs = days !== undefined ? `?days=${days}` : "";
  return request<ActivityDay[]>(`/projects/${projectId}/activity${qs}`);
}

export function getGlobalActivity(days?: number): Promise<ActivityDay[]> {
  const qs = days !== undefined ? `?days=${days}` : "";
  return request<ActivityDay[]>(`/activity${qs}`);
}

export function getMemoryHistory(memoryId: string): Promise<MemoryVersion[]> {
  return request<MemoryVersion[]>(`/memories/${memoryId}/history`);
}

export function revertMemoryToVersion(memoryId: string, version: number): Promise<Memory> {
  return postJson<Memory>(`/memories/${memoryId}/revert`, { version });
}

export function getSynthesisHistory(projectId: string): Promise<SynthesisVersion[]> {
  return request<SynthesisVersion[]>(`/projects/${projectId}/synthesis/history`);
}

export function revertSynthesisToVersion(
  projectId: string,
  version: number,
  memoryType: MemoryType
): Promise<void> {
  return postJson<void>(`/projects/${projectId}/synthesis/revert`, { version, memoryType });
}

export function getSessionContext(projectId: string): Promise<SessionContext> {
  return request<SessionContext>(`/projects/${projectId}/session-context`);
}

export function getFlaggedClusters(projectId?: string): Promise<MemoryCluster[]> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return request<MemoryCluster[]>(`/memories/flagged-clusters${qs}`);
}

export function mergeMemories(
  keepId: string,
  dropIds: string[],
  mergedContent: string
): Promise<Memory> {
  return postJson<Memory>("/memories/merge", { keepId, dropIds, mergedContent });
}

export function deleteManyMemories(ids: string[]): Promise<BulkOpResult[]> {
  return postJson<BulkOpResult[]>("/memories/delete-many", { ids });
}

export function resolveManyMemories(ids: string[]): Promise<BulkOpResult[]> {
  return postJson<BulkOpResult[]>("/memories/resolve-many", { ids });
}

export function suggestMerge(ids: string[]): Promise<{ content: string }> {
  return postJson<{ content: string }>("/memories/merge-suggest", { ids });
}

export function getActivityEvents(filter: ActivityEventFilter): Promise<ActivityEvent[]> {
  const params = new URLSearchParams();
  if (filter.scope !== undefined) params.set("scope", filter.scope);
  if (filter.type !== undefined) params.set("type", filter.type);
  if (filter.since !== undefined) params.set("since", filter.since);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  return request<ActivityEvent[]>(`/activity/events${buildQs(params)}`);
}

export function listCapabilities(): Promise<CapabilitiesResponse> {
  return request<CapabilitiesResponse>("/capabilities");
}

export function listCapabilityMemories(key: string): Promise<Memory[]> {
  const params = new URLSearchParams({ key });
  return request<Memory[]>(`/capabilities/memories?${params.toString()}`);
}
