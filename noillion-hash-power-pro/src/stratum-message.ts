import type { GatewayRoute } from "./types.ts";

export interface RewrittenLine {
  line: string;
  method?: string;
  rewritten: boolean;
}

export function rewriteClientLine(rawLine: string, route: GatewayRoute): RewrittenLine {
  const newline = rawLine.endsWith("\n") ? "\n" : "";
  const content = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;

  let message: unknown;
  try {
    message = JSON.parse(content);
  } catch {
    return { line: rawLine, rewritten: false };
  }

  if (!message || typeof message !== "object") {
    return { line: rawLine, rewritten: false };
  }

  const record = message as { method?: unknown; params?: unknown };
  const method = typeof record.method === "string" ? record.method : undefined;
  if (!route.credentials || !Array.isArray(record.params)) {
    return { line: rawLine, method, rewritten: false };
  }

  if (method !== "mining.authorize" && method !== "mining.submit") {
    return { line: rawLine, method, rewritten: false };
  }

  const params = [...record.params];
  params[0] = route.credentials.username;
  if (method === "mining.authorize") params[1] = route.credentials.password;

  return {
    line: `${JSON.stringify({ ...record, params })}${newline}`,
    method,
    rewritten: true,
  };
}

