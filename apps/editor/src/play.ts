import {
  Input,
  InputEventKey,
  InputMap,
  InputEventMouseButton,
  type Node,
  Node3D,
  ProjectSettings,
  SceneTree,
  key_from_name,
  key_name_from_dom,
  key_name_from_layout,
  mouse_event_from_dom,
  pack_scene,
  unpack_scene,
} from "@corbel/core";
import { Vector2 } from "@corbel/core";

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

    const tree = new SceneTree();
    this.tree = tree;
    tree.on_node_error = (node, error, where) => {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`${node.name} (${where}): ${message}`, "error");
    };

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
    tree.get_root().add_child(woven);
    walk(woven);
    this.detach_input = attach_input(canvas);
    await tree.init({ canvas, preference: "webgpu" });
    if (this.tree !== tree) {
      // Stop ran while init was in flight; the loop just started must end now.
      tree.close();
      return;
    }
    log(`Playing ${scene.name}. Renderer: ${tree.renderer_name}. Click the canvas, then use the binds.`);
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
        this.log(`Script on ${node.name} (${script}) did not load: ${message}. The node stays plain.`, "error");
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

  /**
   * Imports the script through the dev server's TypeScript transform. The path
   * is a user-authored project file known only at play time, so a static
   * import is impossible; the cache-busting query re-reads edited scripts.
   */
  private async load_class(script: string): Promise<new () => Node> {
    const rel = script.replace(/^res:\/\//, "");
    const url = `/@fs/${this.root}/projects/${this.project}/${rel}?run=${this.stamp}`;
    const module = (await import(/* @vite-ignore */ url)) as { default?: new () => Node };
    if (typeof module.default !== "function") {
      throw new Error("no default export class to instantiate.");
    }
    return module.default;
  }
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
    // The game canvas should not scroll the page or trigger browser shortcuts.
    if (event.key === " " || event.key === "Backspace") {
      event.preventDefault();
    }
  };
  const on_button = (event: MouseEvent, pressed: boolean): void => {
    Input.parse_input_event(mouse_event_from_dom(event, canvas, "button", new Vector2(), pressed));
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
  window.addEventListener("mouseup", mouseup);
  canvas.addEventListener("mousemove", on_motion);
  return () => {
    canvas.removeEventListener("keydown", keydown);
    canvas.removeEventListener("keyup", keyup);
    canvas.removeEventListener("mousedown", mousedown);
    window.removeEventListener("mouseup", mouseup);
    canvas.removeEventListener("mousemove", on_motion);
  };
}
