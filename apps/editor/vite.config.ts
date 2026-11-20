import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import type { ViteDevServer } from "vite";
import { projectApi } from "./projectApi.ts";

const corbelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const gameDir = path.join(corbelRoot, "apps", "game");

/** Serves the game window page at /game from the same dev server, so its
 *  relative URLs reach the project API and the project scripts. */
function gamePage(): Plugin {
  return {
    name: "corbel-game-page",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/game", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/" || url.pathname === "") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          const shell = fs.readFileSync(path.join(gameDir, "index.html"), "utf8");
          res.end(shell.replace("__GAME_MAIN__", "/@fs/" + path.join(gameDir, "src", "main.ts").replace(/\\/g, "/")));
          return;
        }
        const module_url = "/@fs/" + path.join(gameDir, url.pathname.slice(1)).replace(/\\/g, "/");
        const transformed = await server.transformRequest(module_url).catch(() => null);
        if (transformed === null) {
          res.statusCode = 404;
          res.end("Not found.");
          return;
        }
        res.setHeader("content-type", "text/javascript; charset=utf-8");
        res.end(transformed.code);
      });
    },
  };
}

function rootPages(): Plugin {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const pages = new Set(["/documentation.html", "/tutorial.html", "/history.html", "/class_reference.html", "/class_reference.json", "/class_reference_app.js"]);
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
  plugins: [react(), projectApi(), gamePage(), rootPages()],
  server: {
    host: "127.0.0.1",
    port: 5177,
    strictPort: true,
  },
});
