/**
 * Browser-only Supabase client.
 * Uses the public URL and anon/publishable key. Never import server secrets here.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * @returns {import("@supabase/supabase-js").SupabaseClient | null}
 */
export function getSupabaseBrowserClient() {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
