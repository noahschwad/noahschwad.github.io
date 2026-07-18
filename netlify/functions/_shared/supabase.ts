/**
 * Server-only Supabase client.
 * Lives under netlify/functions so Vite browser bundles cannot import it.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never VITE_* secrets).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket as WsWebSocket } from "ws";

// supabase-js constructs a Realtime client at createClient() time, which requires
// a global WebSocket constructor to exist. Netlify's Functions runtime (Node 20)
// has no native WebSocket, so supply one. We never open a realtime connection.
const globalWithWs = globalThis as unknown as { WebSocket?: unknown };
if (typeof globalWithWs.WebSocket === "undefined") {
  globalWithWs.WebSocket = WsWebSocket;
}

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  if (!cached) {
    cached = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cached;
}

/** Reset cache (tests only). */
export function __resetSupabaseAdminForTests() {
  cached = null;
}
