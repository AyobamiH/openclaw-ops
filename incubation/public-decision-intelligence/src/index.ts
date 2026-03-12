import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

async function bootstrap() {
  const env = loadEnv();
  const app = buildApp(env);

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT
    });
    app.log.info({ host: env.HOST, port: env.PORT }, "public decision intelligence scaffold listening");
  } catch (error) {
    app.log.error({ err: error }, "failed to start public decision intelligence scaffold");
    process.exit(1);
  }
}

void bootstrap();
