import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { projectApi } from "./projectApi.ts";

function rootPages(): Plugin {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const pages = new Set(["/documentation.html", "/tutorial.html", "/history.html"]);
  return {
    name: "corbel-pages",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!pages.has(url)) {
          next();
          return;
        }
        const file = path.join(root, url.slice(1));
        if (!fs.existsSync(file)) {
          next();
          return;
        }
        res.setHeader("content-type", "text/html; charset=utf-8");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), projectApi(), rootPages()],
  server: {
    host: "127.0.0.1",
    port: 5177,
    strictPort: true,
  },
});
