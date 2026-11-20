import { describe, expect, it } from "vitest";
import { StandardMaterial3D } from "../src/scene/standard_material3d.js";
import { AABB } from "../src/math/aabb.js";
import { Vector3 } from "../src/math/vector3.js";
import { ARRAY, ArrayMesh, BoxMesh, Mesh, PrimitiveType, SurfaceArrays } from "../src/scene/mesh.js";
import { GeometryInstance3D, MeshInstance3D } from "../src/scene/mesh_instance3d.js";

/** A tiny two-triangle quad as a surface. */
function quad(): SurfaceArrays {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { positions, indices };
}

describe("Mesh Godot API", () => {
  it("get_faces returns three Vector3 corner points per triangle", () => {
    const mesh = new BoxMesh(new Vector3(1, 1, 1));
    const faces = mesh.get_faces();
    // 12 triangles, 3 Vector3 corners each.
    expect(faces.length).toBe(36);
    // The first face sits on the +Z half-extent plane.
    for (const corner of faces.slice(0, 6)) {
      expect(corner.z).toBeCloseTo(0.5);
    }
  });

  it("get_aabb wraps every surface", () => {
    const mesh = new BoxMesh(new Vector3(2, 4, 6));
    const box = mesh.get_aabb();
    const center = box.get_center();
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0);
    expect(center.z).toBeCloseTo(0);
    expect(box.get_end()).toEqual(new Vector3(1, 2, 3));
  });

  it("a mesh is a Mesh and carries the ARRAY slot names, as in Godot", () => {
    expect(new BoxMesh() instanceof Mesh).toBe(true);
    expect(ARRAY.VERTEX).toBe(0);
    expect(ARRAY.NORMAL).toBe(1);
    expect(ARRAY.TANGENT).toBe(2);
    expect(ARRAY.COLOR).toBe(3);
    expect(ARRAY.TEX_UV).toBe(4);
    expect(ARRAY.INDEX).toBe(5);
    expect(PrimitiveType.TRIANGLES).toBe(3);
  });
});

describe("ArrayMesh", () => {
  it("add_surface_from_arrays accepts a quad and answers surface queries", () => {
    const mesh = new ArrayMesh();
    mesh.add_surface_from_arrays(PrimitiveType.TRIANGLES, quad());
    expect(mesh.get_surface_count()).toBe(1);
    expect(mesh.surface_get_primitive_type(0)).toBe(PrimitiveType.TRIANGLES);
    expect(mesh.surface_get_arrays(0).positions.length).toBe(12);
    mesh.surface_set_name(0, "quad");
    expect(mesh.surface_get_name(0)).toBe("quad");
  });

  it("holds many surfaces with their own materials", () => {
    const mesh = new ArrayMesh();
    mesh.add_surface_from_arrays(PrimitiveType.TRIANGLES, quad());
    mesh.add_surface_from_arrays(PrimitiveType.TRIANGLES, quad());
    const material = new StandardMaterial3D();
    mesh.surface_set_material(0, material);
    expect(mesh.surface_get_material(0)).toBe(material);
    expect(mesh.surface_get_material(1)).toBeNull();
    mesh.surface_remove(0);
    expect(mesh.get_surface_count()).toBe(1);
    expect(mesh.surface_get_material(0)).toBeNull();
    mesh.clear_surfaces();
    expect(mesh.get_surface_count()).toBe(0);
  });

  it("rejects ragged positions and out-of-range indices", () => {
    const mesh = new ArrayMesh();
    const ragged = new Float32Array(7);
    expect(() => mesh.add_surface_from_arrays(PrimitiveType.TRIANGLES, { positions: ragged, indices: new Uint32Array([0]) })).toThrow(/triplets/);
    expect(() => mesh.add_surface_from_arrays(PrimitiveType.TRIANGLES, { positions: quad().positions, indices: new Uint32Array([4]) })).toThrow(/out of range/);
  });

  it("custom_aabb overrides the measured AABB", () => {
    const mesh = new ArrayMesh(quad());
    expect(mesh.get_aabb().get_end()).toEqual(new Vector3(1, 1, 0));
    mesh.custom_aabb = new AABB(new Vector3(), new Vector3(5, 5, 5));
    expect(mesh.get_aabb().get_end()).toEqual(new Vector3(5, 5, 5));
  });
});

describe("BoxMesh subdivisions", () => {
  it("defaults to Godot's single split per dimension", () => {
    const box = new BoxMesh(new Vector3(2, 4, 6));
    expect(box.subdivide_width).toBe(1);
    expect(box.surface_get_arrays(0).positions.length / 3).toBe(24);
  });

  it("subdivide width splits every x-normal face pair", () => {
    const box = new BoxMesh(new Vector3(2, 4, 6));
    box.subdivide_width = 2;
    // Faces normal to X carry height x depth grids: (1+1)*(1+1) = 4 each.
    // Faces normal to Y carry width x depth grids: (2+1)*(1+1) = 6 each.
    // Faces normal to Z carry width x height grids: (2+1)*(1+1) = 6 each.
    const count = 2 * 4 + 2 * 6 + 2 * 6;
    expect(box.surface_get_arrays(0).positions.length / 3).toBe(count);
    const surface = box.surface_get_arrays(0);
    expect(surface.tangents?.length).toBe(count * 4);
  });
});

describe("MeshInstance3D", () => {
  it("material override, surface override, and active material chain", () => {
    const node = new MeshInstance3D();
    const material = new StandardMaterial3D();
    const override = new StandardMaterial3D();
    node.mesh = new ArrayMesh(quad());
    (node.mesh as ArrayMesh).surface_set_material(0, material);

    expect(node.get_active_material()).toBe(material);
    node.material_override = override;
    expect(node.get_active_material()).toBe(override);
    node.set_surface_override_material(0, material);
    expect(node.get_active_material()).toBe(material);
    expect(node.get_surface_override_material(0)).toBe(material);
    expect(node.get_surface_override_material_count()).toBe(1);
    node.set_surface_override_material(1, override);
    expect(node.get_surface_override_material_count()).toBe(2);
    expect(node.get_active_material(1)).toBe(override);
  });

  it("a negative surface override explains itself", () => {
    const node = new MeshInstance3D();
    expect(() => node.set_surface_override_material(-1, null)).toThrow(/negative/);
  });

  it("GeometryInstance3D is the material_override home, like Godot", () => {
    const node = new GeometryInstance3D();
    expect(node.material_override).toBeNull();
    expect(node.transparency).toBe(0);
    expect(new MeshInstance3D() instanceof GeometryInstance3D).toBe(true);
  });
});
