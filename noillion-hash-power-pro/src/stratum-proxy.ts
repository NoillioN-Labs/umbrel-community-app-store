import { randomUUID } from "node:crypto";
import { createServer, createConnection, type Server, type Socket } from "node:net";

import { resolvePublicEndpoint } from "./endpoint-policy.ts";
import { rewriteClientLine } from "./stratum-message.ts";
import type { GatewayEvent, GatewayRoute } from "./types.ts";

const MAX_LINE_BYTES = 1024 * 1024;

export class StratumProxy {
  #activeRoute: GatewayRoute;
  #server?: Server;
  #connections = new Set<Socket>();
  private readonly listenHost: string;
  private readonly listenPort: number;
  private readonly recordEvent: (event: GatewayEvent) => void;

  constructor(
    listenHost: string,
    listenPort: number,
    ownerRoute: GatewayRoute,
    recordEvent: (event: GatewayEvent) => void,
  ) {
    this.listenHost = listenHost;
    this.listenPort = listenPort;
    this.recordEvent = recordEvent;
    this.#activeRoute = ownerRoute;
  }

  routeId(): GatewayRoute["id"] {
    return this.#activeRoute.id;
  }

  connectionCount(): number {
    return this.#connections.size;
  }

  async start(): Promise<void> {
    if (this.#server) throw new Error("Stratum proxy is already running");
    this.#server = createServer((downstream) => void this.#accept(downstream));
    await new Promise<void>((resolve, reject) => {
      this.#server!.once("error", reject);
      this.#server!.listen(this.listenPort, this.listenHost, () => {
        this.#server!.off("error", reject);
        resolve();
      });
    });
    this.#event("listener-started", undefined, `${this.listenHost}:${this.listenPort}`);
  }

  async stop(): Promise<void> {
    for (const socket of this.#connections) socket.destroy();
    this.#connections.clear();
    if (!this.#server) return;
    const server = this.#server;
    this.#server = undefined;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  async switchRoute(route: GatewayRoute, reason: string): Promise<void> {
    const changed = this.#activeRoute.id !== route.id;
    this.#activeRoute = route;
    this.#event("route-selected", undefined, reason);
    if (changed) {
      for (const socket of this.#connections) socket.destroy();
    }
  }

  async #accept(downstream: Socket): Promise<void> {
    const route = this.#activeRoute;
    const connectionId = randomUUID();
    this.#connections.add(downstream);
    this.#event("miner-connected", connectionId);

    try {
      const host = route.publicOnly ? await resolvePublicEndpoint(route.host) : route.host;
      if (downstream.destroyed) return;
      const upstream = createConnection({ host, port: route.port });
      this.#connections.add(upstream);
      let buffer = "";

      const closeBoth = () => {
        downstream.destroy();
        upstream.destroy();
        this.#connections.delete(downstream);
        this.#connections.delete(upstream);
      };

      downstream.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) return closeBoth();
        while (true) {
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex < 0) break;
          const rawLine = buffer.slice(0, newlineIndex + 1);
          buffer = buffer.slice(newlineIndex + 1);
          const rewritten = rewriteClientLine(rawLine, route);
          if (rewritten.method === "mining.submit") {
            this.#event("share-submitted", connectionId);
          }
          upstream.write(rewritten.line);
        }
      });
      upstream.on("data", (chunk) => downstream.write(chunk));
      downstream.once("close", closeBoth);
      upstream.once("close", closeBoth);
      downstream.once("error", closeBoth);
      upstream.once("error", (error) => {
        this.#event("upstream-error", connectionId, error.message);
        closeBoth();
      });
      upstream.once("connect", () => this.#event("upstream-connected", connectionId, `${route.host}:${route.port}`));
    } catch (error) {
      this.#event("route-rejected", connectionId, error instanceof Error ? error.message : "unknown error");
      downstream.destroy();
      this.#connections.delete(downstream);
    }
  }

  #event(type: string, connectionId?: string, detail?: string): void {
    this.recordEvent({
      occurredAt: new Date().toISOString(),
      type,
      routeId: this.#activeRoute.id,
      connectionId,
      detail,
    });
  }
}
