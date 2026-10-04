import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let adminClient;
let anonClient;

export function getSupabaseAdmin() {
  if (!adminClient) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    }

    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

// Password sign-in must use the anon (publishable) key. The service_role
// key bypasses RLS and does not mint normal user sessions, so using the
// admin client for signInWithPassword causes session anomalies.
export function getSupabaseAnon() {
  if (!anonClient) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) are required.');
    }

    anonClient = createClient(supabaseUrl, anonKey);
  }

  return anonClient;
}

const supabase = new Proxy({}, {
  get(_target, property) {
    return getSupabaseAdmin()[property];
  },
});

export default supabase;
