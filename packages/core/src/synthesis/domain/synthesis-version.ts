import type { MemoryType } from "../../schemas.js";

export type SynthesisVersion = {
  memoryType: MemoryType;
  version: number;
  content: string;
  sourceMemoryHash: string;
  synthesizedAt: string;
  createdAt: string;
};
