import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// These are public client settings (URL + publishable key), never a service-role secret.
// The fallback keeps Preview deployments working even when Vercel env vars are scoped only to Production.
const PUBLIC_SUPABASE_URL = "https://isddbsunqyksqisoqjmd.supabase.co";
const PUBLIC_SUPABASE_KEY = "sb_publishable_iOhlV46KJV1Imm2Y4Jeisg_xWvFZlHX";

export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    PUBLIC_SUPABASE_KEY;

  if (!url || !key) {
    throw new Error("No se pudo configurar la conexión pública con Supabase.");
  }

  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return browserClient;
}
