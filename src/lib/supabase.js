import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './config';
import projectConfig from './projectConfig.json';
// Public browser configuration only. Database access is enforced by RLS and checked RPCs.
const url = (import.meta.env.VITE_SUPABASE_URL || projectConfig.url || '').trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || projectConfig.publishableKey || '').trim();
export const configuration = validateSupabaseConfig(url, key);
// The SDK stores authentication tokens only. Business data always belongs in PostgreSQL.
export const supabase = configuration.configured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;
export const recoveryRedirect = () => `${window.location.origin}${window.location.pathname}?recovery=1`;
