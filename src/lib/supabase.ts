import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

export const supabaseConfigured = Boolean(url && publicKey);

// This browser client must use only a publishable/anon key. RLS controls the
// rows the hosted dashboard can read; the service-role key never belongs here.
export const supabase = supabaseConfigured
  ? createClient(url!, publicKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export async function getCurrentAccessToken() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token || null;
}
