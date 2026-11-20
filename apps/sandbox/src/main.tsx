import { createRoot } from "react-dom/client";
import {
  BoxMesh,
  Camera3D,
  Color,
  DirectionalLight3D,
  Input,
  InputEventKey,
  InputMap,
  MeshInstance3D,
  type Node,
  PrimitiveType,
  SceneTree,
  Shader,
  ShaderMaterial,
  StandardMaterial3D,
  SurfaceTool,
  Transform3D,
  Vector2,
  Vector3,
  key_from_name,
  key_name_from_dom,
  key_name_from_layout,
  mouse_event_from_dom,
} from "@corbel/core";
import { EngineView, useSceneTree } from "@corbel/react";
import { useEffect, useState } from "react";

/** Procedural, Godot SurfaceTool style: a pyramid with one colored face per side. */
function build_pyramid(): MeshInstance3D {
  const tool = new SurfaceTool();
  tool.begin(PrimitiveType.TRIANGLES);
  const apex = new Vector3(0, 1, 0);
  const base = [
    new Vector3(-0.9, -0.5, 0.9),
    new Vector3(0.9, -0.5, 0.9),
    new Vector3(0.9, -0.5, -0.9),
    new Vector3(-0.9, -0.5, -0.9),
  ];
  const side_colors = [Color.html("#3b82f6"), Color.html("#22c55e"), Color.html("#eab308"), Color.html("#ef4444")];
  for (let side = 0; side < 4; side += 1) {
    for (const slot of [side, (side + 1) % 4, -1]) {
      tool.set_color(side_colors[side]);
      tool.add_vertex(slot === -1 ? apex : base[slot]);
    }
  }
  const ground = Color.html("#52525b");
  for (const triangle of [[0, 3, 2], [0, 2, 1]] as const) {
    for (const slot of triangle) {
      tool.set_color(ground);
      tool.add_vertex(base[slot]);
    }
  }
  tool.generate_normals();
  const body = new MeshInstance3D();
  body.set_name("Pyramid");
  body.mesh = tool.commit();
  // A user material: same names in both bodies, the tint arrives as a vec4.
  const pyramid_shader = Shader.lit({
    uniforms: ["Sides"],
    webgpu_body: `  return vec4f(color * lighting(normal, in.world) * Sides.rgb + albedo * 0.15, 1.0);`,
    webgl_body: `  return vec4(color * lighting() * Sides.rgb + albedo * 0.15, 1.0);`,
  });
  const tinted = new ShaderMaterial(pyramid_shader);
  tinted.set_shader_parameter("Sides", Color.html("#eab308"));
  body.material_override = tinted;
  body.position = new Vector3(2.2, 0.45, -0.6);
  return body;
}

/** Spins faster while the bind "spin_fast" is held. */
class SpinCube extends MeshInstance3D {
  override _process(delta: number): void {
    const speed = Input.is_action_pressed("spin_fast") ? 10 : 1.5;
    this.rotation = this.rotation.add(new Vector3(0, delta * speed, delta * speed * 0.4));
  }
}

function build_demo(tree: SceneTree): void {
  const cube = new SpinCube();
  cube.set_name("Cube");
  cube.mesh = new BoxMesh(new Vector3(1.6, 1.6, 1.6));
  const material = new StandardMaterial3D();
  material.albedo = new Color(0.9, 0.45, 0.15, 1);
  cube.material_override = material;
  cube.visible = true;
  tree.get_root().add_child(build_pyramid());
  tree.get_root().add_child(cube);

  const sun = new DirectionalLight3D();
  sun.set_name("Sun");
  sun.rotation = new Vector3(-0.6, 0.4, 0);
  tree.get_root().add_child(sun);

  const camera = new Camera3D();
  camera.transform = new Transform3D().translated(new Vector3(0, 1.2, 3)).looking_at(Vector3.ZERO);
  tree.get_root().add_child(camera);
}

function count_nodes(node: Node): number {
  let count = 1;
  for (const child of node.get_children()) {
    count += count_nodes(child);
  }
  return count;
}

/** DOM events on the canvas become Godot events for the whole engine. */
function attach_input(canvas: HTMLCanvasElement): () => void {
  const modifiers = (event: KeyboardEvent | MouseEvent) => ({
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  });
  const on_key = (event: KeyboardEvent, pressed: boolean): void => {
    Input.parse_input_event(new InputEventKey(key_from_name(key_name_from_layout(event)), pressed, {
      physical: key_from_name(key_name_from_dom(event)),
      echo: event.repeat,
      unicode: event.key,
      ...modifiers(event),
    }));
    // Input lock: game keys while the canvas holds focus; devtools stays reachable.
    const devtools = event.key === "F12" || (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase()));
    if (!devtools) {
      event.preventDefault();
    }
  };
  const on_button = (event: MouseEvent, pressed: boolean): void => {
    Input.parse_input_event(mouse_event_from_dom(event, canvas, "button", new Vector2(), pressed));
  };
  const on_context = (event: MouseEvent): void => {
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

function Panel(): React.JSX.Element {
  const tree = useSceneTree();
  const [nodes, setNodes] = useState(1);
  useEffect(() => {
    const pulse = window.setInterval(() => setNodes(count_nodes(tree.get_root())), 500);
    return () => window.clearInterval(pulse);
  }, [tree]);
  return (
    <aside>
      <h1>Corbel Sandbox</h1>
      <dl>
        <dt>Renderer</dt>
        <dd>{tree.renderer_name ?? "starting…"}</dd>
        <dt>Nodes</dt>
        <dd>{nodes}</dd>
        <dt>Input</dt>
        <dd>Hold Space to spin fast</dd>
      </dl>
    </aside>
  );
}

function Sandbox(): React.JSX.Element {
  return (
    <EngineView
      className="view"
      preference={(window.location.search.includes("webgl2") === true ? "webgl2" : "webgpu")}
      onReady={(tree) => {
        InputMap.load_from_project({ spin_fast: { events: [{ key: "Space" }] } });
        build_demo(tree);
        const canvas = document.querySelector("canvas");
        if (canvas) {
          attach_input(canvas);
        }
      }}
    >
      <Panel />
    </EngineView>
  );
}

createRoot(document.getElementById("root")!).render(<Sandbox />);
