import { ReplitConnectors } from "@replit/connectors-sdk";

type SupabaseInit = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function supabaseRequest<T>(
  path: string,
  init: SupabaseInit = {},
): Promise<T> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  let response: Response;

  if (supabaseUrl && supabaseKey) {
    const headers = {
      ...(init.headers ?? {}),
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };
    response = await fetch(`${supabaseUrl.replace(/\/$/, "")}${path}`, {
      method: init.method,
      headers,
      body:
        typeof init.body === "string" ? init.body : JSON.stringify(init.body),
    });
  } else {
    const connectors = new ReplitConnectors();
    response = await connectors.proxy("supabase", path, init);
  }
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Supabase request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const supabaseHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Prefer: "return=representation",
};