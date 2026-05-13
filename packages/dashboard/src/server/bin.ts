#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
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
  .option("--open", "open the dashboard in your browser on startup")
  .action(async (opts: { port?: number; open?: boolean }) => {
    const spinner = ora("Starting membank dashboard…").start();

    await startDashboard({
      port: opts.port,
      open: opts.open,
      onReady: (port) => {
        spinner.succeed(
          `${chalk.bold("membank dashboard")}  →  ${chalk.cyan(`http://localhost:${port}`)}`
        );
        process.stdout.write(`  ${chalk.dim("Press Ctrl+C to stop")}\n`);
      },
    });
  });

await program.parseAsync(process.argv);
