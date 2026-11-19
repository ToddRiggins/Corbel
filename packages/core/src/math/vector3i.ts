import { Vector3 } from "./vector3.js";

/** Godot 4 Vector3i. Components are integers. A voxel cell is one of these. */
export class Vector3i {
  readonly x: number;
  readonly y: number;
  readonly z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = Math.trunc(x);
    this.y = Math.trunc(y);
    this.z = Math.trunc(z);
  }

  static readonly ZERO = new Vector3i(0, 0, 0);
  static readonly ONE = new Vector3i(1, 1, 1);
  static readonly LEFT = new Vector3i(-1, 0, 0);
  static readonly RIGHT = new Vector3i(1, 0, 0);
  static readonly UP = new Vector3i(0, 1, 0);
  static readonly DOWN = new Vector3i(0, -1, 0);
  static readonly FORWARD = new Vector3i(0, 0, -1);
  static readonly BACK = new Vector3i(0, 0, 1);

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  length_squared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  add(v: Vector3i): Vector3i {
    return new Vector3i(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vector3i): Vector3i {
    return new Vector3i(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  mul(v: number): Vector3i {
    return new Vector3i(this.x * v, this.y * v, this.z * v);
  }

  to_vector3(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  is_equal(v: Vector3i): boolean {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }
}
