export type ShareResult = "accepted" | "rejected" | "stale";

interface JsonRpcMessage {
  id?: unknown;
  method?: unknown;
  result?: unknown;
  error?: unknown;
}

function parseMessage(line: string): JsonRpcMessage | undefined {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" ? value as JsonRpcMessage : undefined;
  } catch {
    return undefined;
  }
}

function requestKey(id: unknown): string | undefined {
  if (typeof id === "string") return `s:${id}`;
  if (typeof id === "number" && Number.isSafeInteger(id)) return `n:${id}`;
  return undefined;
}

function errorCode(error: unknown): number | undefined {
  if (Array.isArray(error) && typeof error[0] === "number") return error[0];
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  if (Array.isArray(error)) return error.map(String).join(" ").toLowerCase();
  if (error && typeof error === "object") return JSON.stringify(error).toLowerCase();
  return "";
}

export function parseKheavyhashSubmitRequest(line: string): string | undefined {
  const message = parseMessage(line);
  if (message?.method !== "mining.submit") return undefined;
  return requestKey(message.id);
}

export function classifyKheavyhashSubmitResponse(
  line: string,
): { requestKey: string; result: ShareResult } | undefined {
  const message = parseMessage(line);
  const key = requestKey(message?.id);
  if (!message || !key || (!("result" in message) && !("error" in message))) return undefined;

  if (message.result === true && (message.error === null || message.error === undefined)) {
    return { requestKey: key, result: "accepted" };
  }

  const text = errorText(message.error);
  const stale = errorCode(message.error) === 21
    || text.includes("stale")
    || text.includes("job not found")
    || text.includes("unknown job");
  return { requestKey: key, result: stale ? "stale" : "rejected" };
}
