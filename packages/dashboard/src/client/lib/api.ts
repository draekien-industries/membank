import type { Filters, Memory, MemoryType, Stats } from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
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
  const qs = params.toString();
  return request<Memory[]>(`/memories${qs ? `?${qs}` : ""}`);
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
