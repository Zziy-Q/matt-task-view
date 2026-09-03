#!/usr/bin/env node
import { createTaskViewServer } from "./server.mjs";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseOptions(args) {
  let host = "127.0.0.1";
  let port = 0;
  while (args.length) {
    const option = args.shift();
    const value = args.shift();
    if (!value || !["--host", "--port"].includes(option)) throw new Error("Usage: matt-task-view serve [--port 0-65535] [--host 127.0.0.1]");
    if (option === "--host") host = value;
    if (option === "--port") port = Number(value);
  }
  if (host !== "127.0.0.1") throw new Error("For local privacy, matt-task-view only listens on 127.0.0.1.");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("Port must be an integer from 0 to 65535.");
  return { port };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "serve") throw new Error("Usage: matt-task-view serve [--port 0-65535] [--host 127.0.0.1]");
  const { port } = parseOptions(args);
  const app = createTaskViewServer(process.cwd());
  const { url } = await app.listen(port);
  console.log(`开发任务视图: ${url}`);
  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await app.close();
}

main().catch((error) => fail(error.message));
