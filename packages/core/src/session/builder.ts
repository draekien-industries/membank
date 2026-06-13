import type { MemoryRepository } from "../memory/ports.js";
import type { MemoryType, SessionContext } from "../schemas.js";
import { MEMORY_TYPE_VALUES } from "../schemas.js";
import { getSessionContext, type SessionSectionInput } from "./application/get-session-context.js";

export function listMemoryTypes(): MemoryType[] {
  return [...MEMORY_TYPE_VALUES];
}

export class SessionContextBuilder {
  readonly #repo: MemoryRepository;

  constructor(repo: MemoryRepository) {
    this.#repo = repo;
  }

  getSessionContext(
    projectHash: string,
    sections?: readonly SessionSectionInput[]
  ): SessionContext {
    return getSessionContext(
      { projectHash, ...(sections !== undefined && { sections }) },
      { repo: this.#repo }
    );
  }
}
