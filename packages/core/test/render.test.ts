import { describe, expect, it } from "vitest";
import { Basis } from "../src/math/basis.js";
import { Color } from "../src/math/color.js";
import { Transform3D } from "../src/math/transform3d.js";
import { Vector3 } from "../src/math/vector3.js";
import {
  basis_to_mat3,
  build_render_frame,
  mat4_mul,
  perspective_proj,
  transform_to_mat4,
} from "../src/render/frame.js";
import { Camera3D } from "../src/scene/camera3d.js";
import { DirectionalLight3D } from "../src/scene/directional_light3d.js";
import { BoxMesh } from "../src/scene/mesh.js";
import { MeshInstance3D } from "../src/scene/mesh_instance3d.js";
import { Node } from "../src/scene/node.js";
import { Node3D } from "../src/scene/node3d.js";
import { SceneTree } from "../src/scene/scene_tree.js";
import { StandardMaterial3D } from "../src/scene/standard_material3d.js";

/** Applies a column-major 4x4 to a point. */
function xform_point(m: Float32Array, p: Vector3): Vector3 {
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
  return new Vector3(
    (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) / w,
    (m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) / w,
    (m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]) / w,
  );
}

describe("BoxMesh", () => {
  it("builds six CCW faces with outward normals", () => {
    const surface = new BoxMesh(new Vector3(2, 4, 6)).surface();
    expect(surface.positions.length).toBe(24 * 3);
    expect(surface.indices.length).toBe(36);

    // Every normal has length 1 and points outward from the center.
    const normals = surface.normals!;
    for (let v = 0; v < 24; v += 1) {
      const x = surface.positions[v * 3];
      const y = surface.positions[v * 3 + 1];
      const z = surface.positions[v * 3 + 2];
      const nx = normals[v * 3];
      const ny = normals[v * 3 + 1];
      const nz = normals[v * 3 + 2];
      expect(nx * x + ny * y + nz * z).toBeGreaterThan(0);
    }

    // First triangle of the +Z face is counter-clockwise seen from outside.
    const [i0, i1, i2] = surface.indices;
    const a = new Vector3(surface.positions[i0 * 3], surface.positions[i0 * 3 + 1], surface.positions[i0 * 3 + 2]);
    const b = new Vector3(surface.positions[i1 * 3], surface.positions[i1 * 3 + 1], surface.positions[i1 * 3 + 2]);
    const c = new Vector3(surface.positions[i2 * 3], surface.positions[i2 * 3 + 1], surface.positions[i2 * 3 + 2]);
    expect(b.sub(a).cross(c.sub(a)).z).toBeGreaterThan(0);

    // Corners span the size (2 x 4 x 6), centered on the origin.
    const xs = [...surface.positions].filter((_, i) => i % 3 === 0);
    const ys = [...surface.positions].filter((_, i) => i % 3 === 1);
    const zs = [...surface.positions].filter((_, i) => i % 3 === 2);
    expect(Math.max(...xs)).toBeCloseTo(1);
    expect(Math.max(...ys)).toBeCloseTo(2);
    expect(Math.max(...zs)).toBeCloseTo(3);
  });
});

describe("matrices", () => {
  it("column-major mat4 matches Basis rows and Transform3D origin", () => {
    const t = new Transform3D(Basis.from_euler(new Vector3(0, Math.PI / 2, 0)), new Vector3(1, 2, 3));
    const m = transform_to_mat4(t);
    // A point at the node origin lands on the origin.
    const mapped = xform_point(m, Vector3.ZERO);
    expect(mapped.x).toBeCloseTo(1);
    expect(mapped.y).toBeCloseTo(2);
    expect(mapped.z).toBeCloseTo(3);
    // One unit of local X maps through the rotated basis.
    const local_x = xform_point(m, new Vector3(1, 0, 0)).sub(new Vector3(1, 2, 3));
    expect(local_x.x).toBeCloseTo(0);
    expect(local_x.z).toBeCloseTo(-1);
  });

  it("composes parent transforms: view of a child equals inverse of the chain", () => {
    const world = new Node3D();
    world.position = new Vector3(1, 0, 0);
    const child = new Node3D();
    child.position = new Vector3(0, 1, 0);
    world.add_child(child);
    expect(child.get_global_transform().origin.x).toBeCloseTo(1);
    expect(child.get_global_transform().origin.y).toBeCloseTo(1);

    const view = transform_to_mat4(child.get_global_transform().inverse());
    const back = xform_point(view, new Vector3(1, 1, 0));
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
    expect(back.z).toBeCloseTo(0);
  });

  it("mat4_mul composes model * point like Basis.xform plus origin", () => {
    const a = transform_to_mat4(new Transform3D(Basis.from_euler(new Vector3(0, 0, Math.PI / 2)), new Vector3(5, 0, 0)));
    const b = transform_to_mat4(new Transform3D(Basis.IDENTITY, new Vector3(1, 2, 3)));
    const combined = mat4_mul(a, b);
    // b applies first: ZERO -> (1, 2, 3), then a rotates it about Z and offsets.
    const point = xform_point(combined, Vector3.ZERO);
    expect(point.x).toBeCloseTo(3);
    expect(point.y).toBeCloseTo(1);
    expect(point.z).toBeCloseTo(3);
  });

  it("perspective projects the near plane center correctly for both depth ranges", () => {
    const webgl = perspective_proj(90, 1, 1, 2, false);
    const gpu = perspective_proj(90, 1, 1, 2, true);
    // Points on the near plane: NDC -1 for GL, 0 for the [0, 1] WebGPU range.
    const center = new Vector3(0, 0, -1);
    expect(xform_point(webgl, center).z).toBeCloseTo(-1);
    expect(xform_point(gpu, center).z).toBeCloseTo(0);
    // fov 90: the point one unit up at the near plane fills the screen top.
    const top = new Vector3(0, 1, -1);
    expect(xform_point(webgl, top).y).toBeCloseTo(1);
    expect(xform_point(gpu, top).y).toBeCloseTo(1);
  });
});

describe("build_render_frame", () => {
  function tree_with(...children: (() => Node)[]): SceneTree {
    const tree = new SceneTree();
    for (const build of children) {
      tree.get_root().add_child(build());
    }
    return tree;
  }

  function camera(name: string, current = true): () => Camera3D {
    return () => {
      const node = new Camera3D();
      node.set_name(name);
      node.current = current;
      return node;
    };
  }

  function box(): () => MeshInstance3D {
    return () => {
      const node = new MeshInstance3D();
      node.geometry = new BoxMesh();
      return node;
    };
  }

  function light(name: string, rotation: Vector3 = Vector3.ZERO, color = Color.WHITE): () => DirectionalLight3D {
    return () => {
      const node = new DirectionalLight3D();
      node.set_name(name);
      node.rotation = rotation.clone();
      node.light_color = color;
      return node;
    };
  }

  it("collects one draw per visible mesh with composed transforms", () => {
    const world = new Node3D();
    world.position = new Vector3(1, 0, 0);
    const mesh_a = new MeshInstance3D();
    mesh_a.geometry = new BoxMesh();
    const mesh_b = new MeshInstance3D();
    mesh_b.geometry = new BoxMesh();
    mesh_b.visible = false;
    world.add_child(mesh_a);
    world.add_child(mesh_b);

    const tree = new SceneTree();
    tree.get_root().add_child(world);
    tree.get_root().add_child(new Camera3D());

    const frame = build_render_frame(tree, 1280, 720);
    expect(frame.camera?.name).toBe("Camera3D");
    expect(frame.draws.length).toBe(1);
    expect(frame.draws[0].mesh).toBe(mesh_a.geometry);
    // mesh_a's origin composes with its world parent.
    const origin = xform_point(frame.draws[0].transform, Vector3.ZERO);
    expect(origin.x).toBeCloseTo(1);
    expect(frame.draws[0].albedo.is_equal_approx(new StandardMaterial3D().albedo)).toBe(true);
  });

  it("picks the last current camera, or the first when none is current", () => {
    const frame = build_render_frame(tree_with(camera("First"), camera("Second")), 800, 600);
    expect(frame.camera?.name).toBe("Second");

    const frame_two = build_render_frame(tree_with(camera("First", false), camera("Second", false)), 800, 600);
    expect(frame_two.camera?.name).toBe("First");
  });

  it("uses the first light's world -Z as the light direction", () => {
    const sideways = new Vector3(Math.PI / 2, 0, 0);
    const frame = build_render_frame(tree_with(light("Key", sideways)), 800, 600);
    // +90 degrees about X turns -Z into +Y.
    expect(frame.light_direction.x).toBeCloseTo(0);
    expect(frame.light_direction.y).toBeCloseTo(1);
    expect(frame.light_direction.z).toBeCloseTo(0);

    const frame_two = build_render_frame(tree_with(light("Key", sideways), light("Brim", Vector3.ZERO, new Color(0, 1, 0))), 800, 600);
    expect(frame_two.light_color.is_equal_approx(Color.WHITE)).toBe(true);
  });

  it("without a camera the frame still clears: camera null, draws kept", () => {
    const frame = build_render_frame(tree_with(box()), 800, 600);
    expect(frame.camera).toBe(null);
    expect(frame.draws.length).toBe(1);
  });
});
