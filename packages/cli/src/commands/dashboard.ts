import { startDashboard } from "@membank/dashboard";
import { PortSchema } from "../schemas.js";

export async function dashboardCommand(opts: { port?: string }): Promise<void> {
  const port = opts.port !== undefined ? PortSchema.parse(opts.port) : undefined;
  await startDashboard({ port });
}
