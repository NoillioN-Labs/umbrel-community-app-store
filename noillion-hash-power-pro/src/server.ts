import { createServer } from "node:http";

import { loadConfig } from "./config.ts";
import { LeaseController } from "./lease-controller.ts";
import { StratumProxy } from "./stratum-proxy.ts";
import type { GatewayEvent } from "./types.ts";

const config = loadConfig();
const events: GatewayEvent[] = [];
const proxy = new StratumProxy(config.stratumHost, config.stratumPort, config.ownerRoute, (event) => {
  events.push(event);
  if (events.length > 500) events.shift();
  process.stdout.write(`${JSON.stringify(event)}\n`);
});
const leases = new LeaseController(proxy, config.ownerRoute);

function send(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
}

function authorised(header: string | undefined): boolean {
  return header === `Bearer ${config.controlToken}`;
}

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  let content = "";
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 16_384) throw new Error("Request body is too large");
  }
  return content ? JSON.parse(content) : {};
}

await proxy.start();
const control = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return send(response, 200, { status: "ok" });
    }
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hash Power Pro Gateway</title>
<style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px;background:#0d1117;color:#e6edf3}section{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px}code{color:#7ee787}</style>
<h1>Hash Power Pro Gateway</h1><section><p>Physical control plane status</p><pre id="status">Loading…</pre></section>
<script>async function refresh(){const r=await fetch('./v1/status');document.querySelector('#status').textContent=JSON.stringify(await r.json(),null,2)}refresh();setInterval(refresh,5000)</script></html>`);
    }
    if (request.method === "GET" && request.url === "/v1/status") {
      return send(response, 200, {
        ...leases.status(),
        activeRouteId: proxy.routeId(),
        connections: proxy.connectionCount(),
        recentEvents: events.slice(-20),
      });
    }
    if (!authorised(request.headers.authorization)) {
      return send(response, 401, { error: "unauthorised" });
    }
    if (request.method === "POST" && request.url === "/v1/leases") {
      const payload = (await body(request)) as {
        durationSeconds?: unknown;
        username?: unknown;
        password?: unknown;
      };
      if (typeof payload.username !== "string" || payload.username.trim().length < 10) {
        throw new Error("A valid renter username or wallet is required");
      }
      const renterRoute = {
        ...config.renterRoute,
        credentials: {
          username: payload.username.trim(),
          password: typeof payload.password === "string" ? payload.password : "x",
        },
      };
      const expiresAt = await leases.activate(renterRoute, Number(payload.durationSeconds));
      return send(response, 201, { routeId: "renter", expiresAt });
    }
    if (request.method === "POST" && request.url === "/v1/owner-restore") {
      await leases.restore();
      return send(response, 200, { routeId: "owner" });
    }
    return send(response, 404, { error: "not_found" });
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : "invalid_request" });
  }
});

control.listen(config.controlPort, config.controlHost, () => {
  process.stdout.write(`Control API listening on ${config.controlHost}:${config.controlPort}\n`);
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await leases.restore("gateway-shutdown");
  await new Promise<void>((resolve) => control.close(() => resolve()));
  await proxy.stop();
  process.exit(0);
}

function requestShutdown(): void {
  void shutdown().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
