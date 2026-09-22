import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

import { loadConfig } from "./config.ts";
import { GatewayIdentity } from "./gateway-identity.ts";
import { IcpLeaseReader, LeaseObserver } from "./icp-lease-observer.ts";
import { LeaseController } from "./lease-controller.ts";
import { assertOwnerRouteReadiness } from "./miner-registration.ts";
import { StratumProxy } from "./stratum-proxy.ts";
import type { GatewayEvent } from "./types.ts";

const config = loadConfig();
const gatewayIdentity = GatewayIdentity.loadOrCreate(config.gatewayIdentityPath);
const pairingCsrfToken = randomBytes(24).toString("base64url");
const events: GatewayEvent[] = [];
const proxy = new StratumProxy(config.stratumHost, config.stratumPort, config.ownerRoute, (event) => {
  events.push(event);
  if (events.length > 500) events.shift();
  process.stdout.write(`${JSON.stringify(event)}\n`);
});
const leases = new LeaseController(proxy, config.ownerRoute);
let leaseObserver: LeaseObserver | undefined;

if (config.icpObserver) {
  const reader = await IcpLeaseReader.create(config.icpObserver);
  leaseObserver = new LeaseObserver(
    reader,
    config.icpObserver.minerId,
    config.icpObserver.pollIntervalMs,
    (event) => {
      events.push(event);
      if (events.length > 500) events.shift();
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  );
  await leaseObserver.start();
}

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
<style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px;background:#0d1117;color:#e6edf3}section{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;margin:16px 0}code{color:#7ee787}textarea{box-sizing:border-box;width:100%;min-height:150px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;padding:12px}button{padding:10px 16px}</style>
<h1>Hash Power Pro Gateway</h1>
<section><p>Physical control plane status</p><pre id="status">Loading…</pre></section>
<section><h2>Pair with ICP</h2><p>Copy this public identity into your private Owner console. Then paste the short-lived ICP challenge below. The private signing key never leaves this Gateway.</p><pre id="identity">Loading…</pre><textarea id="challenge" aria-label="ICP pairing challenge" placeholder="Paste the pairing challenge from Hash Power Pro"></textarea><p><button id="sign" type="button">Sign pairing challenge</button></p><pre id="proof"></pre></section>
<section><h2>Register a miner</h2><p>With the Gateway on the owner route and the miner connected to its owner upstream, paste the short-lived miner challenge. This proves local readiness only; it does not enable rentals or claim accepted shares.</p><textarea id="miner-challenge" aria-label="ICP miner registration challenge" placeholder="Paste the miner registration challenge from Hash Power Pro"></textarea><p><button id="sign-miner" type="button">Sign miner readiness proof</button></p><pre id="miner-proof"></pre></section>
<script>const pairingToken=${JSON.stringify(pairingCsrfToken)};async function refresh(){const r=await fetch('./v1/status');document.querySelector('#status').textContent=JSON.stringify(await r.json(),null,2)}async function identity(){const r=await fetch('./v1/pairing-identity');document.querySelector('#identity').textContent=JSON.stringify(await r.json(),null,2)}async function signChallenge(path,input,output){const challenge=document.querySelector(input).value;const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-hpp-pairing-token':pairingToken},body:JSON.stringify({challenge})});document.querySelector(output).textContent=JSON.stringify(await r.json(),null,2)}document.querySelector('#sign').onclick=()=>signChallenge('./v1/pairing-proof','#challenge','#proof');document.querySelector('#sign-miner').onclick=()=>signChallenge('./v1/miner-registration-proof','#miner-challenge','#miner-proof');refresh();identity();setInterval(refresh,5000)</script></html>`);
    }
    if (request.method === "GET" && request.url === "/v1/status") {
      return send(response, 200, {
        ...leases.status(),
        activeRouteId: proxy.routeId(),
        connections: proxy.connectionCount(),
        readyMinerConnections: proxy.readyMinerConnectionCount(),
        icpLeaseObserver: leaseObserver?.status() ?? { mode: "disabled" },
        recentEvents: events.slice(-20),
      });
    }
    if (request.method === "GET" && request.url === "/v1/pairing-identity") {
      return send(response, 200, gatewayIdentity.view());
    }
    if (request.method === "POST" && request.url === "/v1/pairing-proof") {
      if (request.headers["x-hpp-pairing-token"] !== pairingCsrfToken) {
        return send(response, 403, { error: "pairing_request_not_from_gateway_ui" });
      }
      const payload = (await body(request)) as { challenge?: unknown };
      if (typeof payload.challenge !== "string") throw new Error("A pairing challenge is required");
      return send(response, 200, {
        gatewayId: gatewayIdentity.view().gatewayId,
        signatureBase64: gatewayIdentity.signPairingChallenge(payload.challenge),
      });
    }
    if (request.method === "POST" && request.url === "/v1/miner-registration-proof") {
      if (request.headers["x-hpp-pairing-token"] !== pairingCsrfToken) {
        return send(response, 403, { error: "miner_registration_request_not_from_gateway_ui" });
      }
      const payload = (await body(request)) as { challenge?: unknown };
      if (typeof payload.challenge !== "string") throw new Error("A miner registration challenge is required");
      assertOwnerRouteReadiness(proxy.routeId(), proxy.readyMinerConnectionCount());
      return send(response, 200, {
        gatewayId: gatewayIdentity.view().gatewayId,
        signatureBase64: gatewayIdentity.signMinerRegistrationChallenge(payload.challenge),
        attestation: "owner-route-upstream-connected",
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
  leaseObserver?.stop();
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
