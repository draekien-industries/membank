import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CoreServices } from "./server.js";
import { createServer, initCore } from "./server.js";

async function main(): Promise<void> {
  let core: CoreServices;
  try {
    core = initCore();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`membank: failed to initialise core: ${message}\n`);
    process.exit(1);
  }

  const server = createServer(core);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
