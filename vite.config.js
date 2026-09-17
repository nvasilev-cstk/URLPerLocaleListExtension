import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Contentstack loads this app inside an iframe in the entry editor / config screen,
// so it must be served over a stable origin (localhost:3000 during "Test on localhost").
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // The Contentstack UI (app.contentstack.com / eu-app.contentstack.com) embeds this
    // dev server in an iframe — Vite's default frame-ancestors-friendly headers are fine,
    // but some browsers still need this relaxed during local testing.
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    // Vite rejects requests whose Host header it doesn't recognize (DNS-rebinding
    // protection). Tunneling through ngrok (needed to dodge Chrome's Local Network
    // Access block on iframes loading localhost) sends the tunnel hostname as Host, so
    // it has to be allow-listed here. The wildcard covers ngrok issuing a new random
    // subdomain on every restart of a free-tier tunnel.
    allowedHosts: ['.ngrok-free.app']
  },
  build: {
    outDir: 'dist'
  }
});
