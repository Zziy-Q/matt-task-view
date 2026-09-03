// PROTOTYPE: three Architecture Design layouts on the existing task-view surface.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const artifactPath = process.env.ARCHIFY_PROTOTYPE_ARTIFACT
  || join(root, "artifacts", "development-architecture.zh-CN.html");
const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 0 : Number(process.argv[portIndex + 1]);

function send(response, status, type, body, csp) {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Content-Security-Policy": csp,
    "Permissions-Policy": "clipboard-write=(), fullscreen=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const pageCsp = "default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
const artifactCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method Not Allowed");
    return;
  }
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      send(response, 200, "text/html; charset=utf-8", await readFile(join(root, "index.html")), pageCsp);
      return;
    }
    if (url.pathname === "/artifact.html") {
      response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      send(response, 200, "text/html; charset=utf-8", await readFile(artifactPath), artifactCsp);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    send(response, 404, "text/plain; charset=utf-8", "Not Found", "default-src 'none'");
  } catch (error) {
    send(response, 500, "text/plain; charset=utf-8", error.message, "default-src 'none'");
  }
});

server.listen({ host: "127.0.0.1", port }, () => {
  const address = server.address();
  console.log("架构设计原型: http://127.0.0.1:" + address.port + "/?variant=A&scenario=greenfield");
});
