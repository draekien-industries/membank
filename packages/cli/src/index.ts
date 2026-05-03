#!/usr/bin/env node

import { cancel, intro, isCancel, multiselect, note, outro } from "@clack/prompts";
import { DatabaseManager } from "@membank/core";
import { startServer } from "@membank/mcp";
import chalk from "chalk";
import { Command } from "commander";
import { addCommand } from "./commands/add.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { deleteCommand } from "./commands/delete.js";
import { exportCommand } from "./commands/export.js";
import { importCommand } from "./commands/import.js";
import { injectCommand } from "./commands/inject.js";
import { listCommand } from "./commands/list.js";
import { migrateCommand } from "./commands/migrate.js";
import { pinCommand } from "./commands/pin.js";
import { queryCommand } from "./commands/query.js";
import { statsCommand } from "./commands/stats.js";
import { unpinCommand } from "./commands/unpin.js";
import { Formatter } from "./formatter.js";
import { PromptHelper } from "./prompt-helper.js";
import { HarnessConfigWriter, SUPPORTED_HARNESSES } from "./setup/harness-config-writer.js";
import type { DetectedHarness } from "./setup/harness-detector.js";
import { InjectionHookWriter } from "./setup/injection-hook-writer.js";
import { ModelDownloader } from "./setup/model-downloader.js";
import { SetupOrchestrator } from "./setup/setup-orchestrator.js";

if (process.argv.includes("--mcp")) {
  await startServer();
}

const program = new Command();

program
  .name("membank")
  .description("LLM memory management system")
  .option("--json", "emit machine-readable JSON only")
  .option("-y, --yes", "skip all confirmation prompts")
  .option("--mcp", "start the MCP stdio server (for harness integration)");

program
  .command("query <queryText>")
  .description("search memories by semantic similarity")
  .option("--type <type>", "filter by memory type (correction|preference|decision|learning|fact)")
  .option("--limit <n>", "maximum number of results", "10")
  .action(async (queryText: string, cmdOptions: { type?: string; limit?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await queryCommand(queryText, cmdOptions, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("list")
  .description("list memories with optional filters")
  .option("--type <type>", "filter by memory type (correction|preference|decision|learning|fact)")
  .option("--pinned", "return only pinned memories")
  .action(async (cmdOptions: { type?: string; pinned?: boolean }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await listCommand(cmdOptions, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("stats")
  .description("show memory counts by type, total, and needs_review")
  .action(async () => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await statsCommand(formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("delete <id>")
  .description("delete a memory by ID")
  .action(async (id: string) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    const autoConfirm = globalOpts.yes === true || !process.stdout.isTTY;
    const prompt = new PromptHelper(autoConfirm);
    const db = DatabaseManager.open();
    try {
      await deleteCommand(id, db, formatter, prompt);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    } finally {
      db.close();
    }
  });

program
  .command("add <content>")
  .description("save a new memory")
  .requiredOption("--type <type>", "memory type (correction|preference|decision|learning|fact)")
  .option("--tags <tags>", "comma-separated tags")
  .option("--global", "save as a global memory, not tied to any project")
  .action(
    async (content: string, cmdOptions: { type: string; tags?: string; global?: boolean }) => {
      const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
      const formatter = Formatter.create(globalOpts.json === true);
      try {
        await addCommand(content, cmdOptions, formatter);
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exit(2);
      }
    }
  );

program
  .command("pin <id>")
  .description("pin a memory by ID")
  .action((id: string) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      pinCommand(id);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("unpin <id>")
  .description("unpin a memory by ID")
  .action((id: string) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      unpinCommand(id);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("export")
  .description("export all memories to a JSON file")
  .option("--output <path>", "output file path (default: membank-export-<timestamp>.json in cwd)")
  .action((cmdOptions: { output?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    const db = DatabaseManager.open();
    try {
      exportCommand(db, formatter, cmdOptions);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    } finally {
      db.close();
    }
  });

program
  .command("import <file>")
  .description("import memories from a JSON export file")
  .action(async (file: string) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    const autoConfirm = globalOpts.yes === true || !process.stdout.isTTY;
    const prompt = new PromptHelper(autoConfirm);
    const db = DatabaseManager.open();
    try {
      await importCommand(file, db, formatter, prompt);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    } finally {
      db.close();
    }
  });

program
  .command("inject")
  .description("output session context for harness injection (used by setup hooks)")
  .option(
    "--harness <name>",
    "format output for a specific harness (claude-code|copilot-cli|codex|opencode)"
  )
  .option(
    "--event <event>",
    "hook event type (only session-start is supported; other values no-op for legacy hook compatibility)",
    "session-start"
  )
  .action(async (cmdOptions: { harness?: string; event?: string }) => {
    try {
      await injectCommand(cmdOptions);
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    }
  });

program
  .command("setup")
  .description("detect installed harnesses and write MCP config for each")
  .option("--yes", "skip all confirmation prompts")
  .option("--dry-run", "print planned changes without writing any file")
  .option("--harness <name>", "target only the named harness (skip detection)")
  .action(async (cmdOptions: { yes?: boolean; dryRun?: boolean; harness?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const autoYes = cmdOptions.yes === true || globalOpts.yes === true;
    const formatter = Formatter.create(globalOpts.json === true);
    const interactive = !formatter.isJson && !autoYes && cmdOptions.harness === undefined;

    if (cmdOptions.harness !== undefined) {
      if (!SUPPORTED_HARNESSES.some((h) => h === cmdOptions.harness)) {
        formatter.error(
          `Unknown harness: "${cmdOptions.harness}". Supported: ${SUPPORTED_HARNESSES.join(", ")}`
        );
        process.exit(1);
      }
    }

    if (!formatter.isJson) {
      intro(chalk.bold("  membank  setup  "));
    }

    function decoratedOut(msg: string): void {
      const decorated = msg
        .replace(/✓/g, chalk.green("✓"))
        .replace(/✗/g, chalk.red("✗"))
        .replace(/⚠/g, chalk.yellow("⚠"));
      const styled = /^Step \d/.test(msg) ? `\n${chalk.bold(decorated)}` : decorated;
      process.stdout.write(`${styled}\n`);
    }

    const writer = new HarnessConfigWriter();
    const hookWriter = new InjectionHookWriter();
    const promptHelper = new PromptHelper(autoYes);

    let harnessSelector: ((detected: DetectedHarness[]) => Promise<DetectedHarness[]>) | undefined;
    if (interactive) {
      harnessSelector = async (detected: DetectedHarness[]) => {
        const options = SUPPORTED_HARNESSES.map((name) => {
          const found = detected.find((d) => d.name === name);
          return {
            value: (found ?? {
              name: name as DetectedHarness["name"],
              configPath: "",
            }) satisfies DetectedHarness,
            label: name,
            hint: found !== undefined ? found.configPath : "(not detected)",
          };
        });
        const selected = await multiselect<DetectedHarness>({
          message: "Which harnesses to configure?",
          options,
          initialValues: detected,
        });
        if (isCancel(selected)) {
          cancel("Setup cancelled.");
          process.exit(0);
        }
        return selected;
      };
    }

    const orchestrator = new SetupOrchestrator({
      writer,
      hookWriter,
      prompter: (question) => promptHelper.confirm(question),
      harnessSelector,
      modelDownloader: new ModelDownloader(),
      out: formatter.isJson ? undefined : decoratedOut,
    });
    try {
      const results = await orchestrator.run({
        yes: autoYes,
        dryRun: cmdOptions.dryRun,
        harness: cmdOptions.harness,
        json: formatter.isJson,
      });
      if (!formatter.isJson && !cmdOptions.dryRun && results.length > 0) {
        note(
          'Start a new session to activate injection\nRun  membank query "test"  to verify',
          "Next steps"
        );
        outro(`${chalk.green("✓")} Setup complete`);
      }
      if (results.some((r) => r.status === "error")) {
        process.exit(1);
      }
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("migrate <mode> [name]")
  .description("list or run a named data migration (modes: list, run)")
  .action(async (mode: string, name: string | undefined) => {
    if (mode !== "list" && mode !== "run") {
      process.stderr.write(`Error: mode must be "list" or "run"\n`);
      process.exit(1);
    }
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await migrateCommand(mode, name, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("dashboard")
  .description("open the memory management dashboard in the browser")
  .option("--port <port>", "port to listen on (default: 3847, fallback to random)")
  .action(async (cmdOptions: { port?: string }) => {
    try {
      await dashboardCommand(cmdOptions);
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    }
  });

program.on("command:*", () => {
  program.outputHelp();
  process.exit(1);
});

if (!process.argv.includes("--mcp")) {
  program.parse(process.argv);
}
