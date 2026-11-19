import { Basis } from "../math/basis.js";
import { Transform3D } from "../math/transform3d.js";
import { Vector3 } from "../math/vector3.js";
import { Node } from "./node.js";

const DEG = 180 / Math.PI;

/** Godot 4 Node3D. `rotation` is radians. `rotation_degrees` is the same value in degrees. */
export class Node3D extends Node {
  position = new Vector3();
  basis = new Basis();
  visible = true;

  get rotation(): Vector3 {
    return this.basis.get_euler();
  }

  set rotation(euler: Vector3) {
    this.basis = Basis.from_euler(euler);
  }

  get rotation_degrees(): Vector3 {
    const euler = this.rotation;
    return new Vector3(euler.x * DEG, euler.y * DEG, euler.z * DEG);
  }

  set rotation_degrees(degrees: Vector3) {
    this.rotation = new Vector3(degrees.x / DEG, degrees.y / DEG, degrees.z / DEG);
  }

  get transform(): Transform3D {
    return new Transform3D(copy_basis(this.basis), this.position.clone());
  }

  set transform(value: Transform3D) {
    this.basis = copy_basis(value.basis);
    this.position = value.origin.clone();
  }

  /** Godot 4 `global_transform`: this transform composed with every Node3D parent. */
  get_global_transform(): Transform3D {
    const parent = this.get_parent();
    if (parent instanceof Node3D) {
      return parent.get_global_transform().mul(this.transform);
    }
    return this.transform;
  }
}

export function copy_basis(basis: Basis): Basis {
  const rows = basis.rows;
  return new Basis(
    rows[0].x, rows[0].y, rows[0].z,
    rows[1].x, rows[1].y, rows[1].z,
    rows[2].x, rows[2].y, rows[2].z,
  );
}
