import {
  Camera3D,
  Color,
  DirectionalLight3D,
  Environment,
  MeshInstance3D,
  SceneTree,
  StandardMaterial3D,
  Vector3,
  WorldEnvironment,
  BoxMesh,
} from "@corbel/core";

/** The engine module the helpers build nodes with. */
export let core: typeof import("@corbel/core");

/** The page's backend: `?backend=webgl2` forces the fallback, WebGPU otherwise. */
export function backend_choice(): "webgpu" | "webgl2" {
  if (new URLSearchParams(window.location.search).has("webgl2")) {
    return "webgl2";
  }
  return (new URLSearchParams(window.location.search).get("backend") ?? "webgpu") as "webgpu" | "webgl2";
}

/** A tree with a dim environment so point lights read clearly. */
export function dim_tree(): { tree: SceneTree; environment: Environment } {
  const tree = new SceneTree();
  const environment = new Environment();
  environment.background_color = Color.html("#2c3444");
  environment.ambient = Color.html("#40404c");
  const world = new WorldEnvironment();
  world.environment = environment;
  tree.get_root().add_child(world);
  return { tree, environment };
}

/** A camera the scene can be framed with: position and rotation in radians. */
export function camera(tree: SceneTree, position: [number, number, number], rotation: [number, number, number]): Camera3D {
  const cam = new Camera3D();
  cam.set_name("Camera");
  cam.position = new Vector3(position[0], position[1], position[2]);
  cam.rotation = new Vector3(rotation[0], rotation[1], rotation[2]);
  tree.get_root().add_child(cam);
  return cam;
}

/** The floor every ground example shares, with its own material. */
export function floor(tree: SceneTree, size = 8): void {
  const mesh = new MeshInstance3D();
  mesh.set_name("Floor");
  mesh.mesh = new BoxMesh(new Vector3(size, 0.2, size));
  mesh.position = new Vector3(0, -0.6, 0);
  const material = new StandardMaterial3D();
  material.albedo = Color.html("#8a8f9c");
  mesh.material_override = material;
  tree.get_root().add_child(mesh);
}

/** Status line under the canvas. */
export function status(line: string): void {
  document.getElementById("status")!.textContent = line;
}

/** Boots the tree on the page's canvas and reports the running backend. */
export function boot(tree: SceneTree): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  return tree.init({ canvas, preference: backend_choice() }).then(() => status(`running: ${tree.renderer_name}`));
}
