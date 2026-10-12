import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// Explicitly use this SEYSES project's public publishable key in the browser.
// Do not read NEXT_PUBLIC_SUPABASE_ANON_KEY here: it may have been misconfigured
// with a secret key in Vercel Preview and would override the valid public key.
const SUPABASE_URL = "https://isddbsunqyksqisoqjmd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iOhlV46KJV1Imm2Y4Jeisg_xWvFZlHX";

export function getSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return browserClient;
}
