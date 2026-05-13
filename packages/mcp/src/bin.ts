#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { startServer } from "./index.js";

const { version } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")
) as { version: string };

const program = new Command();
program
  .name("membank-mcp")
  .description("Membank MCP stdio server — for harness integration")
  .version(version)
  .action(startServer);

await program.parseAsync(process.argv);
