#!/usr/bin/env node
import "@membank/core/suppress-warning";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const { version } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")
) as { version: string };

const program = new Command();
program
  .name("membank-mcp")
  .description("Membank MCP stdio server — for harness integration")
  .version(version)
  .action(async () => {
    const { startServer } = await import("./index.js");
    await startServer();
  });

await program.parseAsync(process.argv);
