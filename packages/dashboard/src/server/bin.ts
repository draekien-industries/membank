#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { startDashboard } from "./index.js";

const { version } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")
) as { version: string };

const program = new Command();
program
  .name("membank-dashboard")
  .description("Membank dashboard web server")
  .version(version)
  .option("--port <port>", "port to listen on (default: 3847, fallback to random)", (v) => {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n) || n < 1 || n > 65535) throw new Error(`Invalid port: ${v}`);
    return n;
  })
  .action(async (opts: { port?: number }) => {
    await startDashboard({ port: opts.port });
  });

await program.parseAsync(process.argv);
