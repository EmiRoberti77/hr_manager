import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to FastAPI so the browser never makes cross-origin
    // requests and CORS is not required for local dev.
    proxy: {
      '/demo-users': 'http://127.0.0.1:8000',
      '/chat': 'http://127.0.0.1:8000',
      '/conversations': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/training': 'http://127.0.0.1:8000',
      '/policies': 'http://127.0.0.1:8000',
      '/expenses': 'http://127.0.0.1:8000',
    },
  },
});
