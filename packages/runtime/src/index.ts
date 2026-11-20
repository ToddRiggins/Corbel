import {
  Color,
  Input,
  InputEventKey,
  InputMap,
  InputEventMouseButton,
  Node,
  Node3D,
  ProjectSettings,
  PackedScene,
  register_node_class,
  registered_node_class_names,
  resource_loader,
  SceneTree,
  StandardMaterial3D,
  key_from_name,
  key_name_from_dom,
  key_name_from_layout,
  mouse_event_from_dom,
  pack_scene,
  unpack_scene,
  Texture2D,
  type CSceneNode,
  Vector2,
} from "@corbel/core";

export type PlayLog = (line: string, kind?: "info" | "error") => void;

/** Runs the open scene in a canvas: a fresh tree, the scripts as real classes, errors reported. */
export class Player {
  private tree: SceneTree | null = null;
  private log: PlayLog = () => {};
  private root = "";
  private project = "demo";
  private stamp = 0;
  private detach_input: (() => void) | null = null;

  private readonly on_error = (event: ErrorEvent): void => {
    this.log(`Engine: ${event.message}`, "error");
  };
  private readonly on_rejection = (event: PromiseRejectionEvent): void => {
    this.log(`Uncaught promise: ${String(event.reason)}`, "error");
  };

  get running(): boolean {
    return this.tree !== null;
  }

  get paused(): boolean {
    return this.tree?.paused ?? false;
  }

  get renderer_name(): string | null {
    return this.tree?.renderer_name ?? null;
  }

  async start(scene: Node, project: string, canvas: HTMLCanvasElement, log: PlayLog): Promise<void> {
    this.stop();
    this.log = log;
    this.project = project;
    this.stamp = Date.now();
    window.addEventListener("error", this.on_error);
    window.addEventListener("unhandledrejection", this.on_rejection);
    if (!this.root) {
      this.root = (await fetch("/__project/root").then((response) => response.json() as Promise<{ root?: string }>)).root ?? "";
      this.root = this.root.replace(/\\/g, "/");
    }
    if (!this.root) {
      throw new Error("Could not read the project root from the dev server.");
    }

    // The shared ResourceLoader reads project files through the dev server,
    // and `.ts` scripts load as classes over the same dynamic-import path
    // the weave uses.
    resource_loader().set_file_loader(async (path) => {
      const payload = await fetch(`/__project/file?project=${encodeURIComponent(this.project)}&path=${encodeURIComponent(path)}`)
        .then(async (response) => (response.ok ? (await response.json() as { text?: string }) : null));
      if (!payload?.text) {
        throw new Error(`Could not read ${path} from project "${this.project}".`);
      }
      return payload.text;
    });
    resource_loader().set_loader("ts", async (text, path) => {
      const module = await this.load_module(path);
      return module.default;
    });
    for (const extension of ["png", "jpg", "jpeg", "webp", "gif"]) {
      resource_loader().set_loader(extension, (text, path) => this.load_texture(path));
    }
    resource_loader().set_loader("cmaterial", async (text, path) => await this.load_material(JSON.parse(text), path));

    const tree = new SceneTree();
    this.tree = tree;
    tree.on_node_error = (node, error, where) => {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`${node.name} (${where}): ${message}`, "error");
    };
    // change_scene_to_file loads saved scenes through the shared loader; the
    // tree's weaver attaches this project's scripts to the fresh instance.
    tree.scene_loader = async (path) => {
      const packed = await resource_loader().load(path) as PackedScene | null;
      if (!(packed instanceof PackedScene)) {
        throw new Error(`Could not load ${path} as a scene.`);
      }
      return packed.instantiate();
    };
    tree.node_weaver = async (node) => await this.weave(node);

    // Project settings: the Input Map goes live before any script's _ready can read it.
    let settings: ProjectSettings | null = null;
    try {
      const payload = await fetch("/__project/file?project=" + encodeURIComponent(project) + "&path=" + encodeURIComponent("res://project.corbel.json"))
        .then(async (response) => (response.ok ? (await response.json() as { text?: string }) : null));
      const settings_text = payload?.text ?? "";
      if (settings_text) {
        settings = ProjectSettings.load(JSON.parse(settings_text) as Record<string, unknown>);
        log(`Project settings: ${InputMap.get_actions().length} action${InputMap.get_actions().length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      this.log(`Project settings did not load: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
    if (!settings) {
      InputMap.clear();
      Input._reset();
    }

    // Project classes register by their class name, Godot's `class_name` style,
    // so scenes can hold custom node types and scripts can access them.
    await this.load_project_classes(log);

    // Godot's Globals/Autoload: each entry instantiates under /root/Name
    // before the main scene, with access through get_node("/root/Name").
    const autoloads = (settings?.get("autoload") ?? {}) as Record<string, string>;
    for (const [name, script] of Object.entries(autoloads)) {
      try {
        const module = await this.load_module(script);
        const Ctor = module.default as (new () => Node) | undefined;
        if (typeof Ctor !== "function") {
          throw new Error("no default export class to instantiate.");
        }
        const singleton = new Ctor();
        singleton.set_name(name);
        tree.get_root().add_child(singleton);
        log(`Autoload ${name}: ${script}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Autoload ${name} (${script}) did not load: ${pretty_path(message, this.project)}`, "error");
      }
    }

    log(`Building ${scene.name} for play...`);
    const packed = pack_scene(scene);
    const runtime = unpack_scene(packed);
    const woven = await this.weave(runtime);
    const walk = (node: Node): void => {
      for (const child of node.get_children()) {
        child.owner = woven;
        walk(child);
      }
    };
    // The scene runs as the current scene, so a later change_scene frees it.
    tree.change_scene_to_node(woven);
    walk(woven);
    this.detach_input = attach_input(canvas);
    await tree.init({ canvas, preference: "webgpu" });
    this.debug_expose(tree);
    if (this.tree !== tree) {
      // Stop ran while init was in flight; the loop just started must end now.
      tree.close();
      return;
    }
    log(`Playing ${scene.name}. Renderer: ${tree.renderer_name}. Click the canvas, then use the binds.`);
  }

  /**
   * Debug seam for the remote debugger and tests: the running tree on
   * `globalThis.__CORBEL_SCENE__` of the window the runner started in.
   */
  private debug_expose(tree: SceneTree): void {
    const holder = globalThis as { __CORBEL_SCENE__?: SceneTree };
    holder.__CORBEL_SCENE__ = tree;
  }

  toggle_pause(): void {
    const tree = this.tree;
    if (!tree) {
      return;
    }
    tree.paused = !tree.paused;
    this.log(tree.paused ? "Paused." : "Resumed.");
  }

  stop(): void {
    const tree = this.tree;
    this.tree = null;
    window.removeEventListener("error", this.on_error);
    window.removeEventListener("unhandledrejection", this.on_rejection);
    this.detach_input?.();
    this.detach_input = null;
    InputMap.clear();
    Input._reset();
    if (tree) {
      tree.close();
      this.log("Stopped.");
    }
  }

  /**
   * Rewrites one node at a time: children move first, then the node itself becomes
   * an instance of its script's default export when it has one and the class fits.
   */
  private async weave(node: Node): Promise<Node> {
    const woven: Node[] = [];
    for (const kid of node.get_children()) {
      node.remove_child(kid);
      woven.push(await this.weave(kid));
    }
    let result = node;
    const script = node.get_meta("script_path");
    if (typeof script === "string" && script) {
      try {
        const ScriptClass = await this.load_class(script);
        const instance = new ScriptClass();
        if (!(instance instanceof (node as object).constructor)) {
          throw new Error(`${script} does not extend ${node.get_class()}.`);
        }
        this.copy_into(instance, node);
        result = instance;
        this.log(`Script on ${node.name}: ${script}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Script on ${node.name} (${script}) did not load: ${pretty_path(message, this.project)}. The node stays plain.`, "error");
      }
    }
    for (const kid of woven) {
      result.add_child(kid);
    }
    return result;
  }

  private copy_into(instance: Node, node: Node): void {
    instance.set_name(node.name);
    for (const key of ["script_path", "godot_type", "instance"]) {
      if (node.has_meta(key)) {
        instance.set_meta(key, node.get_meta(key));
      }
    }
    if (instance instanceof Node3D && node instanceof Node3D) {
      instance.transform = node.transform;
      instance.visible = node.visible;
    }
  }

  /** Imports one project script through the dev server's TypeScript transform. */
  private async load_module(script: string): Promise<{ default?: unknown }> {
    const rel = script.replace(/^res:\/\//, "");
    const url = `/@fs/${this.root}/projects/${this.project}/${rel}?run=${this.stamp}`;
    return (await import(/* @vite-ignore */ url)) as { default?: unknown };
  }

  /** Reads a project image file (base64 over the project API) and decodes it. */
  private async load_texture(path: string): Promise<Texture2D> {
    const payload = await fetch(`/__project/file?project=${encodeURIComponent(this.project)}&path=${encodeURIComponent(path)}`)
      .then(async (response) => (response.ok ? (await response.json() as { base64?: string; error?: string }) : null));
    if (!payload?.base64) {
      throw new Error(payload?.error ?? `Could not read ${path}.`);
    }
    const image_type = path.split(".").pop()?.toLowerCase() ?? "png";
    const mime = image_type === "jpg" || image_type === "jpeg" ? "image/jpeg" : image_type === "gif" ? "image/gif" : image_type === "webp" ? "image/webp" : "image/png";
    return Texture2D.from_base64(`data:${mime};base64,${payload.base64}`);
  }

  /** Builds a material from a `.cmaterial` JSON file, referenced textures included. */
  private async load_material(data: { type?: string; albedo?: string; albedo_texture?: string; metallic?: number; roughness?: number }, path: string): Promise<StandardMaterial3D> {
    const material = new StandardMaterial3D();
    if (typeof data.albedo === "string") {
      material.albedo = Color.html(data.albedo);
    }
    if (typeof data.metallic === "number") {
      material.metallic = data.metallic;
    }
    if (typeof data.roughness === "number") {
      material.roughness = data.roughness;
    }
    if (typeof data.albedo_texture === "string") {
      const texture = await resource_loader().load(data.albedo_texture);
      if (texture instanceof Texture2D) {
        material.albedo_texture = texture;
      }
    }
    return material;
  }

  /**
   * Godot's `class_name` registry: every project script's default export
   * registers under the class's own name, so `create_node("Score")` builds
   * custom node types and the editor can list them.
   */
  private async load_project_classes(log: PlayLog): Promise<void> {
    await register_project_classes(this.project, log);
  }

  /**
   * Imports the script through the dev server's TypeScript transform. The path
   * is a user-authored project file known only at play time, so a static
   * import is impossible; the cache-busting query re-reads edited scripts.
   */
  private async load_class(script: string): Promise<new () => Node> {
    const module = await this.load_module(script) as { default?: new () => Node };
    if (typeof module.default !== "function") {
      throw new Error("no default export class to instantiate.");
    }
    return module.default;
  }
}

/** Rewrites a dev-server module URL inside an error into the res:// path the author wrote. */
export function pretty_path(message: string, project: string): string {
  const marker = `/projects/${project}/`;
  for (const token of message.split(/\s+/)) {
    const at = token.indexOf(marker);
    if (at >= 0) {
      const rel = token.slice(at + marker.length).split("?")[0].replace(/["')\]],?$/, "");
      return `res://${decodeURIComponent(rel)}`;
    }
  }
  return message;
}

/**
 * Registers every project script's default export class by its class name,
 * Godot's `class_name` style. Returns the names that registered. Safe to
 * call repeatedly; the loader is used by the runner and the editor.
 */
export async function register_project_classes(project: string, log: PlayLog = () => {}): Promise<string[]> {
  const scripts = await fetch(`/__project/scripts?project=${encodeURIComponent(project)}`)
    .then(async (response) => (response.ok ? (await response.json() as { scripts?: string[] }).scripts ?? [] : []));
  const root = await fetch("/__project/root")
    .then(async (response) => (await response.json() as { root?: string }).root ?? "")
    .then((root) => root.replace(/\\/g, "/"));
  const stamp = Date.now();
  const names: string[] = [];
  for (const script of scripts) {
    try {
      const url = `/@fs/${root}/projects/${project}/${script.replace(/^res:\/\//, "")}?run=${stamp}`;
      const candidate = (await import(/* @vite-ignore */ url) as { default?: unknown }).default;
      if (typeof candidate === "function" && candidate.prototype instanceof Node && candidate.name) {
        register_node_class(candidate.name, candidate as new () => Node);
        names.push(candidate.name);
      }
    } catch (error) {
      log(`Class from ${script} did not load: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }
  return names;
}

/** DOM events on the run canvas become Godot events for the play tree. */
function attach_input(canvas: HTMLCanvasElement): () => void {
  const modifiers = (event: KeyboardEvent | MouseEvent) => ({
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  });
  const on_key = (event: KeyboardEvent, pressed: boolean): void => {
    Input.parse_input_event(new InputEventKey(
      key_from_name(key_name_from_layout(event)),
      pressed,
      {
        physical: key_from_name(key_name_from_dom(event)),
        echo: event.repeat,
        unicode: event.key,
        ...modifiers(event),
      },
    ));
    // Input lock: while the game holds the canvas, its keys belong to the
    // game. Space, Alt, Backspace, and F5-like refresh no longer drive the
    // browser page. Devtools stays reachable (F12, Ctrl+Shift+I/J/C).
    const devtools = event.key === "F12" || (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase()));
    if (!devtools) {
      event.preventDefault();
    }
  };
  const on_button = (event: MouseEvent, pressed: boolean): void => {
    Input.parse_input_event(mouse_event_from_dom(event, canvas, "button", new Vector2(), pressed));
  };
  const on_context = (event: MouseEvent): void => {
    // A right-mouse bind needs the browser menu gone first.
    event.preventDefault();
  };
  let last = new Vector2();
  const on_motion = (event: MouseEvent): void => {
    const motion = mouse_event_from_dom(event, canvas, "motion", last);
    last = motion.position.clone();
    Input.parse_input_event(motion);
  };

  const keydown = (event: KeyboardEvent): void => on_key(event, true);
  const keyup = (event: KeyboardEvent): void => on_key(event, false);
  const mousedown = (event: MouseEvent): void => {
    // A click makes the canvas focusable, not focused; keyboard events
    // follow focus, so the game gets the keys the player is pressing.
    canvas.focus();
    on_button(event, true);
  };
  const mouseup = (event: MouseEvent): void => on_button(event, false);
  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("keyup", keyup);
  canvas.addEventListener("mousedown", mousedown);
  canvas.addEventListener("contextmenu", on_context);
  window.addEventListener("mouseup", mouseup);
  canvas.addEventListener("mousemove", on_motion);
  return () => {
    canvas.removeEventListener("keydown", keydown);
    canvas.removeEventListener("keyup", keyup);
    canvas.removeEventListener("mousedown", mousedown);
    canvas.removeEventListener("contextmenu", on_context);
    window.removeEventListener("mouseup", mouseup);
    canvas.removeEventListener("mousemove", on_motion);
  };
}

/** Re-exported for the editor: project classes are registered under these names. */
export { registered_node_class_names };
