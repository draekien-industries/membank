import { MEMORY_TYPES } from "./types.js";

interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MEMBANK_TOOLS: ToolSchema[] = [
  {
    name: "list_memory_types",
    description: "Returns the ordered list of memory type values supported by membank.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "save_memory",
    description:
      "Save a new memory. Handles deduplication automatically — near-identical memories (cosine similarity >0.92, same type and scope) overwrite the existing record.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Memory content to save" },
        type: {
          type: "string",
          enum: [...MEMORY_TYPES],
          description: "Memory type",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags",
        },
        scope: { type: "string", description: "Scope (defaults to resolved project scope)" },
      },
      required: ["content", "type"],
    },
  },
  {
    name: "update_memory",
    description: "Update the content and/or tags of an existing memory by id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Memory id to update" },
        content: { type: "string", description: "New content for the memory" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Replacement tags (optional)",
        },
      },
      required: ["id", "content"],
    },
  },
  {
    name: "delete_memory",
    description: "Delete a memory by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Memory id to delete" } },
      required: ["id"],
    },
  },
  {
    name: "query_memory",
    description:
      "Search memories by semantic similarity. Returns results ranked by confidence score.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
        type: {
          type: "string",
          enum: [...MEMORY_TYPES],
          description: "Filter by memory type",
        },
        scope: { type: "string", description: "Filter by scope" },
        limit: { type: "number", description: "Maximum results to return (default 10)" },
      },
      required: ["query"],
    },
  },
];

export const HARNESS_TOOL_STUBS: ToolSchema[] = [
  {
    name: "Bash",
    description: "Execute a shell command and return its output.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string" }, description: { type: "string" } },
      required: ["command"],
    },
  },
  {
    name: "WebFetch",
    description: "Fetch a URL and return its content as markdown.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, prompt: { type: "string" } },
      required: ["url", "prompt"],
    },
  },
  {
    name: "Read",
    description: "Read a local file from the filesystem.",
    input_schema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
];

export const ALL_TOOLS: ToolSchema[] = [...MEMBANK_TOOLS, ...HARNESS_TOOL_STUBS];
