import { Dictionary } from "../dictionary.js";
import { PackedScene } from "./packed_scene.js";
import type { Node } from "./node.js";

/** The path of a file in the project, Godot-style `res://…`. */
export type FileLoader = (path: string) => Promise<string>;

/**
 * A resource loader for one extension, Godot's import-plugin shape:
 * `ResourceLoader.set_loader(ext, fn)` — `fn(file_text, path)` returns the
 * resource. Built-ins: `.cscene` → PackedScene; `.ts` → the script's class.
 */
export type ResourceHandler = (text: string, path: string) => Promise<unknown> | unknown;

/**
 * Godot 4 ResourceLoader: `load("res://…")` returns the resource, cached by
 * path like Godot. File IO is injected — the runtime wires the project API;
 * tests inject a map. The instance pins on `globalThis` (shared across page
 * realms, like the class registry).
 */
export class ResourceLoader {
  private readonly _texts = new Map<string, Promise<string>>();
  private readonly _resources = new Map<string, Promise<unknown>>();
  private readonly _handlers = new Dictionary<string, ResourceHandler>();
  private _file_loader: FileLoader | null = null;

  /** Installs the file read; the runtime fetches through the project API. */
  set_file_loader(loader: FileLoader): void {
    this._file_loader = loader;
  }

  /** Adds or replaces the handler for a path extension, with or without the dot. */
  set_loader(extension: string, handler: ResourceHandler): void {
    const key = extension.replace(/^\./, "").toLowerCase();
    this._handlers.set(key, handler);
  }

  /**
   * Godot 4 `load(path)`: the cached resource, resolving through the
   * matching handler (or the built-in PackedScene for `.cscene`). Returns
   * null for files the loader cannot fetch or extensions with no handler.
   */
  async load(path: string): Promise<unknown> {
    const load_promise = this._resources.get(path);
    if (load_promise !== undefined) {
      return load_promise;
    }
    const promise = this.load_fresh(path);
    this._resources.set(path, promise);
    return promise;
  }

  /** True when the path already sits in the cache. */
  has_cached(path: string): boolean {
    return this._resources.has(path);
  }

  private async load_fresh(path: string): Promise<unknown> {
    // Built-in scene handling reads text; registered handlers (textures,
    // scripts, anything binary) fetch their own bytes over the API instead.
    if (path.endsWith(".cscene") || path.endsWith(".tscn")) {
      const text = await this.read(path);
      return PackedScene.from_data(JSON.parse(text));
    }
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    const handler = this._handlers.get(extension);
    if (handler === undefined) {
      return null;
    }
    return await handler("", path);
  }

  private read(path: string): Promise<string> {
    if (this._file_loader === null) {
      return Promise.reject(new Error(`ResourceLoader has no file loader for "${path}".`));
    }
    if (!this._texts.has(path)) {
      const promise = this._file_loader(path);
      this._texts.set(path, promise);
      promise.catch(() => this._texts.delete(path));
    }
    return this._texts.get(path)!;
  }
}

/** The shared loader instance all realms see. */
interface LoaderState {
  loader: ResourceLoader;
}

const LOADER_KEY = "__CORBEL_RESOURCE_LOADER__";

function state(): LoaderState {
  const holder = globalThis as { [LOADER_KEY]?: LoaderState };
  if (!holder[LOADER_KEY]) {
    holder[LOADER_KEY] = { loader: new ResourceLoader() };
  }
  return holder[LOADER_KEY];
}

/** The shared ResourceLoader, Godot's global `load`. */
export function resource_loader(): ResourceLoader {
  return state().loader;
}

/** Godot 4 global `load("res://…")`: the shared loader's load. */
export function load(path: string): Promise<unknown> {
  return resource_loader().load(path);
}

/** Godot 4 global `resource_path_exists` needs IO; the loader knows after the first try. */
export function resource_cached(path: string): boolean {
  return resource_loader().has_cached(path);
}
