import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { validateSupabaseConfig } from './src/lib/config.js';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const result = validateSupabaseConfig(
    (env.VITE_SUPABASE_URL || '').trim(),
    (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim(),
  );
  // Stop before Vite can embed a private or incorrectly configured key in browser assets.
  if (result.error) throw new Error(result.error);
  return { server: { allowedHosts: ['terminal.local'] }, plugins: [react(), tailwindcss()] };
});
