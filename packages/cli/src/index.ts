#!/usr/bin/env node

import { cancel, intro, isCancel, multiselect, note, outro } from "@clack/prompts";
import { DatabaseManager } from "@membank/core";
import { startServer } from "@membank/mcp";
import chalk from "chalk";
import { Command } from "commander";
import { activityCommand } from "./commands/activity.js";
import { addCommand } from "./commands/add.js";
import { configGetCommand, configSetCommand, configShowCommand } from "./commands/config.js";
import { deleteCommand } from "./commands/delete.js";
import { exportCommand } from "./commands/export.js";
import { extractCommand } from "./commands/extract.js";
import { importCommand } from "./commands/import.js";
import { injectCommand } from "./commands/inject.js";
import { listCommand } from "./commands/list.js";
import { migrateCommand } from "./commands/migrate.js";
import { pinCommand } from "./commands/pin.js";
import { queryCommand } from "./commands/query.js";
import { reviewCommand } from "./commands/review.js";
import { statsCommand } from "./commands/stats.js";
import {
  synthesizeRunCommand,
  synthesizeShowCommand,
  synthesizeStatusCommand,
} from "./commands/synthesize.js";
import { unpinCommand } from "./commands/unpin.js";
import { Formatter } from "./formatter.js";
import { PromptHelper } from "./prompt-helper.js";
import { MigrateModeSchema, SetupHarnessSchema } from "./schemas.js";
import { HarnessConfigWriter, SUPPORTED_HARNESSES } from "./setup/harness-config-writer.js";
import type { DetectedHarness } from "./setup/harness-detector.js";
import { InjectionHookWriter } from "./setup/injection-hook-writer.js";
import { ModelDownloader } from "./setup/model-downloader.js";
import { SetupOrchestrator } from "./setup/setup-orchestrator.js";

if (process.argv.includes("--mcp")) {
  process.stderr.write(
    "[membank] Deprecation: `membank --mcp` is deprecated. Use: npx @membank/mcp\n"
  );
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
  .option("--include-pinned", "include pinned memories in results (excluded by default)")
  .action(
    async (
      queryText: string,
      cmdOptions: { type?: string; limit?: string; includePinned?: boolean }
    ) => {
      const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
      const formatter = Formatter.create(globalOpts.json === true);
      try {
        await queryCommand(queryText, cmdOptions, formatter);
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exit(2);
      }
    }
  );

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
  .command("extract")
  .description(
    "(internal) run session-end memory extraction; reads the harness's Stop hook payload from stdin"
  )
  .option(
    "--harness <name>",
    "harness whose stop-hook payload is on stdin (only claude-code is supported today)",
    "claude-code"
  )
  .option("--session <id>", "session id (otherwise read from stdin)")
  .option("--transcript <path>", "transcript JSONL path (otherwise read from stdin)")
  .action(async (cmdOptions: { harness?: string; session?: string; transcript?: string }) => {
    try {
      await extractCommand({
        harness: cmdOptions.harness,
        sessionId: cmdOptions.session,
        transcript: cmdOptions.transcript,
      });
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(0);
  });

const setupCmd = program
  .command("setup")
  .description("detect installed harnesses and write MCP config for each")
  .option("--yes", "skip all confirmation prompts")
  .option("--dry-run", "print planned changes without writing any file")
  .option("--harness <name>", "target only the named harness (skip detection)");

setupCmd
  .command("upgrade")
  .description("upgrade harness configs from membank --mcp to standalone membank-mcp")
  .action(async () => {
    const globalOpts = program.opts<{ json?: boolean }>();
    const isJson = globalOpts.json === true;
    const writer = new HarnessConfigWriter();

    const stale: string[] = [];
    for (const harness of SUPPORTED_HARNESSES) {
      if (await writer.isStale(harness)) stale.push(harness);
    }

    if (stale.length === 0) {
      if (isJson) {
        process.stdout.write(`${JSON.stringify({ upgraded: [] })}\n`);
      } else {
        process.stdout.write("All harness configs are already up to date.\n");
      }
      return;
    }

    const upgraded: string[] = [];
    const errors: string[] = [];
    for (const harness of stale) {
      try {
        await writer.write(harness, { overwrite: true });
        upgraded.push(harness);
        if (!isJson) process.stdout.write(`  ${chalk.green("✓")} ${harness}\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${harness}: ${msg}`);
        if (!isJson) process.stderr.write(`  ${chalk.red("✗")} ${harness}: ${msg}\n`);
      }
    }

    if (isJson) {
      process.stdout.write(`${JSON.stringify({ upgraded, errors })}\n`);
    }
    if (errors.length > 0) process.exit(1);
  });

setupCmd.action(async (cmdOptions: { yes?: boolean; dryRun?: boolean; harness?: string }) => {
  const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
  const autoYes = cmdOptions.yes === true || globalOpts.yes === true;
  const formatter = Formatter.create(globalOpts.json === true);
  const interactive = !formatter.isJson && !autoYes && cmdOptions.harness === undefined;

  if (cmdOptions.harness !== undefined) {
    const harnessCheck = SetupHarnessSchema.safeParse(cmdOptions.harness);
    if (!harnessCheck.success) {
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
            name,
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
    synthesisOptIn: true,
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
  .command("review")
  .description("list memories flagged for review, or resolve review events")
  .option("--resolve <id>", "resolve all open review events for the given memory id")
  .action(async (cmdOptions: { resolve?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await reviewCommand(cmdOptions, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("migrate <mode> [name]")
  .description("list or run a named data migration (modes: list, run)")
  .action(async (mode: string, name: string | undefined) => {
    const modeResult = MigrateModeSchema.safeParse(mode);
    if (!modeResult.success) {
      process.stderr.write(`Error: mode must be "list" or "run"\n`);
      process.exit(1);
    }
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await migrateCommand(modeResult.data, name, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("dashboard")
  .description("(deprecated) open the memory management dashboard")
  .allowUnknownOption()
  .action(() => {
    process.stderr.write(
      "The dashboard is now a standalone package.\nRun: npx @membank/dashboard\n"
    );
    process.exit(1);
  });

const configCmd = program.command("config").description("manage membank configuration");

configCmd
  .command("get <key>")
  .description("print a config value as JSON")
  .action((key: string) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    configGetCommand(key, formatter);
  });

configCmd
  .command("set <key> <value>")
  .description("set a config value and persist")
  .action((key: string, value: string) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    configSetCommand(key, value, formatter);
  });

configCmd
  .command("show")
  .description("print the entire config as formatted JSON")
  .action(() => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    configShowCommand(formatter);
  });

const synthesizeCmd = program.command("synthesize").description("view and manage synthesis");

synthesizeCmd
  .command("run")
  .description("trigger a synthesis run for a scope")
  .option("--scope <scope>", "scope to synthesize (default: global)")
  .action(async (cmdOptions: { scope?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      await synthesizeRunCommand(cmdOptions, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

synthesizeCmd
  .command("show")
  .description("display current synthesis for a scope")
  .option("--scope <scope>", "scope to show (default: global)")
  .action((cmdOptions: { scope?: string }) => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      synthesizeShowCommand(cmdOptions, formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

synthesizeCmd
  .command("status")
  .description("show all scopes with synthesis status")
  .action(() => {
    const globalOpts = program.opts<{ json?: boolean; yes?: boolean }>();
    const formatter = Formatter.create(globalOpts.json === true);
    try {
      synthesizeStatusCommand(formatter);
    } catch (err) {
      formatter.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command("activity")
  .description("list activity events for the current project (or --global for global memories)")
  .option(
    "--type <event_type>",
    "filter by event type (memory.created|updated|deleted|flagged|queried)"
  )
  .option("--since <date>", "return events after this ISO date/time")
  .option("--memory-id <id>", "filter by memory id")
  .option("--limit <n>", "maximum number of results (default 50)")
  .option("--global", "show activity for global (sentinel) project")
  .option("--scope <hash>", "show activity for a specific scope hash (advanced)")
  .action(
    async (cmdOptions: {
      type?: string;
      since?: string;
      memoryId?: string;
      limit?: string;
      global?: boolean;
      scope?: string;
    }) => {
      const globalOpts = program.opts<{ json?: boolean }>();
      const formatter = Formatter.create(globalOpts.json === true);
      try {
        await activityCommand({ ...cmdOptions, json: globalOpts.json }, formatter);
      } catch (err) {
        formatter.error(err instanceof Error ? err.message : String(err));
        process.exit(2);
      }
    }
  );

program.on("command:*", () => {
  program.outputHelp();
  process.exit(1);
});

if (!process.argv.includes("--mcp")) {
  program.parse(process.argv);
}
