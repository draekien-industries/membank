#!/usr/bin/env node
// CLI entry point — routes to MCP server or CLI commands based on argv

import { Command } from "commander";
import { queryCommand } from "./commands/query.js";
import { Formatter } from "./formatter.js";

const program = new Command();

program
  .name("membank")
  .description("LLM memory management system")
  .option("--json", "emit machine-readable JSON only")
  .option("-y, --yes", "skip all confirmation prompts");

program
  .command("query <queryText>")
  .description("search memories by semantic similarity")
  .option("--type <type>", "filter by memory type (correction|preference|decision|learning|fact)")
  .option("--limit <n>", "maximum number of results", "10")
  .action(async (queryText: string, cmdOptions: { type?: string; limit?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create().withJson(
      globalOpts.json === true || !process.stdout.isTTY
    );
    try {
      await queryCommand(queryText, cmdOptions, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

// Catch unknown commands
program.on("command:*", () => {
  program.help();
  process.exit(1);
});

program.parse(process.argv);
