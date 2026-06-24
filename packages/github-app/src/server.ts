import { createServer } from "node:http";
import { createNodeMiddleware, Probot } from "probot";
import app from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const webhooksPath = process.env.GITHUB_WEBHOOK_PATH ?? "/github/webhooks";

const probot = new Probot({
  appId: readNumberEnv("GITHUB_APP_ID"),
  privateKey: readPrivateKeyEnv("GITHUB_PRIVATE_KEY"),
  secret: readStringEnv("GITHUB_WEBHOOK_SECRET")
});

const middleware = await createNodeMiddleware(app, {
  probot,
  webhooksPath
});

createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "codedecay-github-app" }));
    return;
  }

  void Promise.resolve(middleware(request, response)).catch((error: unknown) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  });
}).listen(port, () => {
  process.stdout.write(`CodeDecay GitHub App listening on port ${port} at ${webhooksPath}\n`);
});

function readStringEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readNumberEnv(name: string): number {
  const parsed = Number(readStringEnv(name));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function readPrivateKeyEnv(name: string): string {
  return readStringEnv(name).replace(/\\n/g, "\n");
}
