import type { MemoryRepository } from "../memory/ports.js";
import { MEMORY_TYPE_VALUES } from "../schemas.js";
import type { MemoryType, SessionContext } from "../types.js";
import { getSessionContext } from "./application/get-session-context.js";

export function listMemoryTypes(): MemoryType[] {
  return [...MEMORY_TYPE_VALUES];
}

export class SessionContextBuilder {
  readonly #repo: MemoryRepository;

  constructor(repo: MemoryRepository) {
    this.#repo = repo;
  }

  getSessionContext(projectHash: string, synthesis?: string): SessionContext {
    return getSessionContext(
      { projectHash, ...(synthesis !== undefined && { synthesis }) },
      { repo: this.#repo }
    );
  }
}
