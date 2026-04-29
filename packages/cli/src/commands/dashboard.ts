import { startDashboard } from "@membank/dashboard";

export async function dashboardCommand(opts: { port?: string }): Promise<void> {
  const port = opts.port !== undefined ? parseInt(opts.port, 10) : undefined;
  await startDashboard({ port });
}
