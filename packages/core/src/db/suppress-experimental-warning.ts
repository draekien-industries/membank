const emit = process.emit;

/**
 * `node:sqlite` emits an ExperimentalWarning on first use. Membank's binaries speak
 * stdio to a harness or a terminal, where a stray stderr banner is noise the user
 * cannot act on. Import this first in every bin entrypoint.
 */
process.emit = function (this: NodeJS.Process, name: string | symbol, ...args: unknown[]): boolean {
  const [data] = args;
  if (
    name === "warning" &&
    data instanceof Error &&
    data.name === "ExperimentalWarning" &&
    data.message.includes("SQLite")
  ) {
    return false;
  }
  return Reflect.apply(emit, this, [name, ...args]) as boolean;
} as typeof process.emit;
