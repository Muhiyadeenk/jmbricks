export function validateSupabaseConfig(url = '', key = '') {
  if (!url && !key) return { configured: false, error: null };
  if (!url || !key) return { configured: false, error: 'Both the Supabase project URL and public key are required.' };
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error();
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) throw new Error();
  } catch { return { configured: false, error: 'Use a valid HTTPS Supabase project URL.' }; }
  if (key.startsWith('sb_publishable_') && key.length > 20) return { configured: true, error: null };
  try {
    const body = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (body.role === 'anon') return { configured: true, error: null };
  } catch { /* Reject private or unrecognized keys. */ }
  return { configured: false, error: 'Use a publishable or legacy anon key. Secret and service-role keys are not permitted.' };
}
