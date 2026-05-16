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
    name: "save_memory",
    description:
      "Save a new memory. Handles deduplication automatically — near-identical memories (cosine similarity >0.92, same type and project) overwrite the existing record.",
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
        scope: {
          type: "string",
          enum: ["current", "global"],
          description:
            '"current" (default) = scoped to this project; "global" = saved as a global memory',
        },
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
      'Search memories by semantic similarity. Returns results ranked by confidence score. scope="current" (default) searches this project and global memories; scope="global" returns global memories only; scope="all" returns across every project.',
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
        type: {
          type: "string",
          enum: [...MEMORY_TYPES],
          description: "Filter by memory type",
        },
        scope: {
          type: "string",
          enum: ["current", "global", "all"],
          description:
            '"current" (default) = project + global; "global" = global memories only; "all" = all projects',
        },
        limit: { type: "number", description: "Maximum results to return (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_migrations",
    description: "List available named data migrations. Use run_migration to execute one.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_migration",
    description:
      "Execute a named data migration. Use list_migrations first to see available migration names.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Migration name to execute" } },
      required: ["name"],
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
