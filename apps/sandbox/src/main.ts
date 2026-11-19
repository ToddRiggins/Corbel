import {
  BoxMesh,
  Camera3D,
  Color,
  DirectionalLight3D,
  MeshInstance3D,
  SceneTree,
  StandardMaterial3D,
  Transform3D,
  Vector3,
} from "@corbel/core";

/** Rotates the cube a little each frame, showing `_process` running on the live tree. */
class SpinCube extends MeshInstance3D {
  override _process(delta: number): void {
    this.rotation = this.rotation.add(new Vector3(0, delta * 0.8, delta * 0.4));
  }
}

function start(): void {
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const tree = new SceneTree();

  const cube = new SpinCube();
  cube.set_name("Cube");
  cube.geometry = new BoxMesh(new Vector3(1.6, 1.6, 1.6));
  const material = new StandardMaterial3D();
  material.albedo = new Color(0.9, 0.45, 0.15, 1);
  cube.material_override = material;
  tree.get_root().add_child(cube);

  // Tilting the light's -Z toward the cube from above and to the side.
  const sun = new DirectionalLight3D();
  sun.set_name("Sun");
  sun.rotation = new Vector3(-0.6, 0.4, 0);
  tree.get_root().add_child(sun);

  const camera = new Camera3D();
  camera.set_name("Camera");
  camera.transform = new Transform3D().translated(new Vector3(0, 1.2, 3)).looking_at(Vector3.ZERO);
  tree.get_root().add_child(camera);

  const label = document.getElementById("renderer")!;
  const forced = new URLSearchParams(window.location.search).get("backend");
  const preference = forced === "webgl2" ? "webgl2" : "webgpu";
  tree.init({ canvas, preference }).then(() => {
    label.textContent = tree.renderer_name;
  });
}

start();
