import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const webPort = Number(env.WEB_PORT || 5173);
  const webHost = env.WEB_HOST || '127.0.0.1';

  const apiHost = env.API_HOST || '127.0.0.1';
  const apiPort = Number(env.API_PORT || 4000);
  const apiUrl = env.VITE_API_URL || `http://${apiHost}:${apiPort}`;

  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    root: 'apps/web',
    server: {
      host: webHost,
      port: webPort,
      strictPort: true,
    },
    preview: {
      host: webHost,
      port: webPort,
      strictPort: true,
    },
  };
});
