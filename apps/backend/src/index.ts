import { loadEnv } from "./env.js";
import { buildApp } from "./app.js";

const env = loadEnv();
const app = await buildApp({ env });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  const force = setTimeout(() => {
    app.log.error("forced exit after timeout");
    process.exit(1);
  }, 10_000);
  force.unref();

  await app.close();
  clearTimeout(force);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: env.BACKEND_PORT, host: env.HOST });
  app.log.info(`Atlas API listening on http://${env.HOST}:${env.BACKEND_PORT}`);
  app.log.info(`Swagger docs at http://${env.HOST}:${env.BACKEND_PORT}/docs`);
} catch (err) {
  app.log.error(err, "failed to start");
  process.exit(1);
}
