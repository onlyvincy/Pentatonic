import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
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

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaVersionStampPlugin(BUILD_ID)],
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5173,
    host: true,
  },
});
