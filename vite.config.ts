import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5179,
    strictPort: true,
    proxy: { "/rpc": { target: "http://127.0.0.1:8545", changeOrigin: true, rewrite: () => "/" } },
  },
});
