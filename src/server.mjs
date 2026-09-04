import { watch } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

import { buildTaskGraph, readVerifiedArchitectureArtifact } from "./task-graph.mjs";
import { deliverWorkflow, workflowSpecification } from "./workflow.mjs";

const pageCsp = "default-src 'self'; connect-src 'self'; frame-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'";
const artifactCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";
const artifactHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": artifactCsp,
  "Permissions-Policy": "clipboard-read=(), clipboard-write=(), fullscreen=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const unavailableArtifactHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "Permissions-Policy": "clipboard-read=(), clipboard-write=(), fullscreen=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.css", ["app.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

function asset(name) {
  return readFile(new URL(`./public/${name}`, import.meta.url));
}

function respond(response, status, headers, body) {
  response.writeHead(status, headers);
  response.end(body);
}

async function architectureFiles(root, feature) {
  if (!feature || feature === "." || feature === ".." || /[\\/\0]/u.test(feature)) throw new Error("Invalid feature");
  const canonicalRoot = await realpath(root);
  const scratch = join(canonicalRoot, ".scratch");
  if (await realpath(scratch) !== scratch) throw new Error("Invalid scratch directory");
  const featureDirectory = join(scratch, feature);
  if (await realpath(featureDirectory) !== featureDirectory) throw new Error("Invalid feature directory");
  const architectureDirectory = join(featureDirectory, "architecture");
  if (await realpath(architectureDirectory) !== architectureDirectory) throw new Error("Invalid architecture directory");
  for (const name of ["decision.json", "system.architecture.json", "system.architecture.html", "system.architecture.receipt.json"]) {
    const path = join(architectureDirectory, name);
    if (await realpath(path) !== path) throw new Error("Invalid architecture files");
  }
  return { featureDirectory };
}

export function createTaskViewServer(root) {
  const clients = new Set();
  const workflows = new Map();
  const fileWatchers = new Map();
  let refreshTimer;

  const server = createServer((request, response) => {
    handleRequest(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else respond(response, 500, unavailableArtifactHeaders, "Internal Server Error");
    });
  });

  async function handleRequest(request, response) {
    let url;
    try {
      url = new URL(request.url, "http://127.0.0.1");
    } catch {
      respond(response, 400, unavailableArtifactHeaders, "Bad Request");
      return;
    }
    if (request.method !== "GET") {
      respond(response, 405, { Allow: "GET" }, "Method Not Allowed");
      return;
    }

    if (assets.has(url.pathname)) {
      const [name, type] = assets.get(url.pathname);
      respond(response, 200, {
        "Content-Type": type,
        "Content-Security-Policy": pageCsp,
      }, await asset(name));
      return;
    }

    const architectureRoute = url.pathname.match(/^\/architecture\/([^/]+)\/artifact\.html$/);
    const workflowRoute = url.pathname.match(/^\/workflow\/([^/]+)\/artifact\.html$/);
    if (workflowRoute) {
      try {
        const feature = decodeURIComponent(workflowRoute[1]);
        if (!feature || feature === "." || feature === ".." || /[\\/\0]/u.test(feature)) throw new Error("Invalid feature");
        const graph = await buildTaskGraph(root);
        if (!graph.features.includes(feature)) {
          respond(response, 404, unavailableArtifactHeaders, "Workflow unavailable");
          return;
        }
        const specification = workflowSpecification(graph, feature);
        const revision = JSON.stringify(specification);
        let cached = workflows.get(feature);
        if (cached?.revision !== revision) {
          cached = { revision, html: deliverWorkflow(specification) };
          workflows.set(feature, cached);
        }
        const html = await cached.html.catch((error) => {
          if (workflows.get(feature) === cached) workflows.delete(feature);
          throw error;
        });
        respond(response, 200, artifactHeaders, html);
      } catch {
        respond(response, 422, unavailableArtifactHeaders, "无法生成当前依赖图，请查看任务列表与计划诊断。");
      }
      return;
    }
    if (architectureRoute) {
      try {
        const feature = decodeURIComponent(architectureRoute[1]);
        const files = await architectureFiles(root, feature);
        const delivery = await readVerifiedArchitectureArtifact(files.featureDirectory, feature);
        if (!delivery) {
          respond(response, 409, unavailableArtifactHeaders, "Architecture artifact unavailable");
          return;
        }
        respond(response, 200, artifactHeaders, delivery.artifact);
      } catch {
        respond(response, 404, unavailableArtifactHeaders, "Architecture artifact unavailable");
      }
      return;
    }

    if (url.pathname === "/api/snapshot") {
      try {
        respond(response, 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(await buildTaskGraph(root)));
      } catch {
        respond(response, 500, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Unable to read local task tickets." }));
      }
      return;
    }

    if (url.pathname === "/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (url.pathname === "/favicon.ico") {
      respond(response, 204, {}, "");
      return;
    }

    respond(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
  }

  function notifyRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      for (const client of clients) client.write("event: refresh\ndata: tickets changed\n\n");
    }, 30);
  }

  function watchDirectory(path, recursive, onChange) {
    fileWatchers.get(path)?.close();
    fileWatchers.delete(path);
    try {
      fileWatchers.set(path, watch(path, { recursive }, onChange));
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }

  function watchArchitecture() {
    watchDirectory(join(root, "docs", "architecture"), true, notifyRefresh);
  }

  function watchDocs() {
    watchDirectory(join(root, "docs"), false, (_, filename) => {
      if (filename === null || filename === "architecture") {
        watchArchitecture();
        notifyRefresh();
      }
    });
    watchArchitecture();
  }

  function closeWatchers() {
    for (const watcher of fileWatchers.values()) watcher.close();
    fileWatchers.clear();
  }

  return {
    async listen(port = 0) {
      try {
        // Observe directory creation without recursively watching unrelated project files.
        watchDirectory(root, false, (_, filename) => {
          if (filename === null || filename === "docs") watchDocs();
          if (filename === null || filename === ".scratch") {
            watchDirectory(join(root, ".scratch"), true, notifyRefresh);
          }
          if (filename === null || filename === "docs" || filename === ".scratch") notifyRefresh();
        });
        watchDirectory(join(root, ".scratch"), true, notifyRefresh);
        watchDocs();
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen({ host: "127.0.0.1", port }, () => {
            server.off("error", reject);
            resolve();
          });
        });
      } catch (error) {
        closeWatchers();
        clearTimeout(refreshTimer);
        throw error;
      }
      const address = server.address();
      return { url: `http://127.0.0.1:${address.port}/` };
    },
    async close() {
      clearTimeout(refreshTimer);
      closeWatchers();
      for (const client of clients) client.end();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
