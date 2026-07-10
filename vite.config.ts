import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { DEFAULT_PORT } from "./src/shared/ports.js";

const clientRoot = fileURLToPath(new URL("./src/client", import.meta.url));
const clientOutDir = fileURLToPath(new URL("./dist/client", import.meta.url));

export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  build: {
    outDir: clientOutDir,
    emptyOutDir: true,
  },
  // Dev only: Vite never writes this into the bundle. In development the SPA is served
  // by Vite, so `/api` is proxied to the dashboard server that `pnpm dev` starts
  // alongside it; running `vite` on its own leaves the proxy without a destination. In
  // production one process serves both, and the client's relative `/api/...` requests
  // reach it on the same origin without any proxy at all.
  //
  // The port is read from the same constant the CLI defaults to, so the two cannot drift
  // apart in source. They can still drift at runtime: if something already holds this
  // port, the server's bind-and-retry fallback lands on the next one and this proxy
  // answers 502. The port it actually bound is printed on startup.
  server: {
    proxy: {
      "/api": `http://localhost:${DEFAULT_PORT}`,
    },
  },
});
