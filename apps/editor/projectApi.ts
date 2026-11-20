import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Connect, Plugin } from "vite";

const corbelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectsDir = path.join(corbelRoot, "projects");

interface FileRow {
  path: string;
  name: string;
  depth: number;
  dir: boolean;
}

export function projectApi(): Plugin {
  return {
    name: "corbel-project",
    configureServer(server) {
      server.middlewares.use("/__project", (req, res) => {
        void handle(req, res).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          send(res, 400, { error: message });
        });
      });
    },
  };
}

async function handle(req: Connect.IncomingMessage, res: Connect.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname.replace(/^\/__project/, "") || "/";
  if (req.method === "GET" && pathname === "/projects") {
    const names = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    send(res, 200, { projects: names });
    return;
  }
  if (req.method === "GET" && pathname === "/root") {
    send(res, 200, { root: corbelRoot });
    return;
  }
  if (req.method === "GET" && pathname === "/files") {
    send(res, 200, { files: listFiles(required(url, "project")) });
    return;
  }
  if (req.method === "GET" && pathname === "/file") {
    const file = resToAbs(required(url, "project"), required(url, "path"));
    send(res, 200, { text: fs.readFileSync(file, "utf8") });
    return;
  }
  if (req.method === "GET" && pathname === "/scripts") {
    const scripts = listFiles(required(url, "project"))
      .filter((row) => !row.dir && row.path.endsWith(".ts"))
      .map((row) => row.path);
    send(res, 200, { scripts });
    return;
  }
  const body = await readBody(req);
  const payload = body ? JSON.parse(body) as { project?: string; path?: string; text?: string } : {};
  const project = payload.project ?? "";
  const resPath = payload.path ?? "";
  if (!project || !resPath) {
    throw new Error("project and path are required.");
  }
  const file = resToAbs(project, resPath);
  if (req.method === "PUT" && pathname === "/file") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, payload.text ?? "", "utf8");
    send(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && pathname === "/check") {
    if (!resPath.endsWith(".ts")) {
      send(res, 200, { diagnostics: [] });
      return;
    }
    send(res, 200, { diagnostics: checkTs(file, payload.text ?? "") });
    return;
  }
  send(res, 404, { error: "Not found." });
}

function listFiles(project: string): FileRow[] {
  const root = resToAbs(project, "res://placeholder");
  const projectRoot = path.dirname(root);
  const rows: FileRow[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry.name);
      const rel = path.relative(projectRoot, full).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        rows.push({ path: `res://${rel}`, name: entry.name, depth: rel.split("/").length - 1, dir: true });
        walk(full);
      } else {
        rows.push({ path: `res://${rel}`, name: entry.name, depth: rel.split("/").length - 1, dir: false });
      }
    }
  };
  walk(projectRoot);
  return rows;
}

function checkTs(filePath: string, text: string): Array<{ line: number; column: number; message: string }> {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    experimentalDecorators: true,
    useDefineForClassFields: false,
    skipLibCheck: true,
    baseUrl: corbelRoot,
    paths: { "@corbel/core": ["packages/core/src/index.ts"] },
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  const exists = host.fileExists.bind(host);
  const wanted = path.normalize(filePath);
  host.fileExists = (fileName) => path.normalize(fileName) === wanted || exists(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (path.normalize(fileName) === wanted) {
      return ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS);
    }
    return read(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram([filePath], options, host);
  return ts.getPreEmitDiagnostics(program).flatMap((diagnostic) => {
    if (!diagnostic.file || path.normalize(diagnostic.file.fileName) !== wanted || diagnostic.start === undefined) {
      return [];
    }
    const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return [{
      line: pos.line + 1,
      column: pos.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    }];
  });
}

function resToAbs(project: string, resPath: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(project)) {
    throw new Error("Bad project name.");
  }
  if (!resPath.startsWith("res://")) {
    throw new Error("A project path starts with res://.");
  }
  const rel = resPath.slice("res://".length).replaceAll("\\", "/");
  const parts = rel.split("/").filter((part) => part.length > 0);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("That path leaves the project.");
  }
  const root = path.resolve(projectsDir, project);
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("That path leaves the project.");
  }
  return full;
}

function required(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: Connect.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
