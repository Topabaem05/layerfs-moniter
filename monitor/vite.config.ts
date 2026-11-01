import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type PreviewServer, type ViteDevServer } from "vite";

import { createApi } from "./src/server/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const handle = createApi({
  repoRoot: path.resolve(here, ".."),
  dataDir: path.join(here, ".data"),
});

function studioApi() {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      void handle(req, res)
        .then((taken) => {
          if (!taken) next();
        })
        .catch((error: unknown) => {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "failed" }));
        });
    });
  };
  return {
    name: "studio-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  plugins: [react(), studioApi()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 5173, strictPort: true },
});
