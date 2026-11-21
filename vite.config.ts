import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  String(Date.now());

function pwaVersionStampPlugin(buildId: string): Plugin {
  return {
    name: 'pwa-version-stamp',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      // 1) Emit /version.json for reliable iOS PWA & Vercel deploy detection
      fs.writeFileSync(
        path.join(distDir, 'version.json'),
        JSON.stringify({ buildId }),
        'utf-8'
      );

      // 2) Stamp /sw.js so its bytes change on every deploy
      const swPath = path.join(distDir, 'sw.js');
      if (fs.existsSync(swPath)) {
        const raw = fs.readFileSync(swPath, 'utf-8');
        fs.writeFileSync(swPath, raw.replace(/__BUILD_ID__/g, buildId), 'utf-8');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const SUPABASE_URL =
    env.VITE_SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const SUPABASE_ANON_KEY =
    env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  return {
    plugins: [react(), tailwindcss(), pwaVersionStampPlugin(BUILD_ID)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
      __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(SUPABASE_ANON_KEY),
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
