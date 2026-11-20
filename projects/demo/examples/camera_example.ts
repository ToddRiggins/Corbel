import {
  BoxMesh,
  DirectionalLight3D,
  Camera3D,
  Color,
  MeshInstance3D,
  Node3D,
  Projection,
  CylinderMesh,
  CapsuleMesh,
  Mesh,
  PrismMesh,
  SphereMesh,
  TorusMesh,
  StandardMaterial3D,
  Vector3,
} from "@corbel/core";

/**
 * Example: the built-in mesh family and the orthographic camera. The six
 * primitives (plus BoxMesh) sit in a row; the camera's projection flips
 * between PERSPECTIVE and ORTHOGONAL — with ORTHOGONAL, `size` is the view's
 * height in world units and parallel lines stay parallel on screen.
 */
export default class OrthoExample extends Node3D {
  override _ready(): void {
    const camera = new Camera3D();
    camera.set_name("Camera");
    camera.projection = Projection.ORTHOGONAL;
    camera.size = 3.4;
    camera.position = new Vector3(0, 1.4, 7.0);
    this.add_child(camera);

    const sun = new DirectionalLight3D();
    sun.set_name("Sun");
    sun.rotation = new Vector3(0.7, 0.4, 0);
    sun.light_color = Color.html("#d8dcff");
    sun.light_color.g = Math.max(0.6, sun.light_color.g);
    this.add_child(sun);

    // One of each primitive, in a row.
    const row: Array<[string, Mesh]> = [
      ["Plane", new BoxMesh(new Vector3(1.2, 1.2, 0.1))],
      ["Sphere", new SphereMesh(0.6, 1.2, 24, 12)],
      ["Cylinder", new CylinderMesh(0.5, 0.5, 1.3, 24)],
      ["Capsule", new CapsuleMesh(0.5, 1.3, 24, 8)],
      ["Torus", new TorusMesh(0.35, 0.7, 24, 12)],
      ["Prism", new PrismMesh(new Vector3(1.1, 1.1, 1.1))],
      ["Box", new BoxMesh(new Vector3(1.0, 1.0, 1.0))],
    ];
    const material = new StandardMaterial3D();
    material.albedo = Color.html("#c8a050");
    let index = 0;
    for (const [name, mesh] of row) {
      const node = new MeshInstance3D();
      node.set_name(name);
      node.mesh = mesh;
      node.position = new Vector3(-3.6 + index * 1.2, 0.7, 0);
      node.material_override = material;
      this.add_child(node);
      index += 1;
    }
    // The floor: a wide plane under the row.
    const floor = new MeshInstance3D();
    floor.set_name("Floor");
    floor.mesh = new BoxMesh(new Vector3(12, 0.2, 4));
    floor.position = new Vector3(0, -0.1, 0);
    const floor_material = new StandardMaterial3D();
    floor_material.albedo = Color.html("#6a7080");
    floor.material_override = floor_material;
    this.add_child(floor);
  }
}
