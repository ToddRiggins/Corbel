import { is_equal_approx, is_zero_approx } from "./approx.js";

/** Godot 4 Vector3. Y-up, right-handed. `FORWARD` is (0, 0, -1). */
export class Vector3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  static readonly ZERO = new Vector3(0, 0, 0);
  static readonly ONE = new Vector3(1, 1, 1);
  static readonly LEFT = new Vector3(-1, 0, 0);
  static readonly RIGHT = new Vector3(1, 0, 0);
  static readonly UP = new Vector3(0, 1, 0);
  static readonly DOWN = new Vector3(0, -1, 0);
  static readonly FORWARD = new Vector3(0, 0, -1);
  static readonly BACK = new Vector3(0, 0, 1);

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  length_squared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  normalize(): void {
    const len = this.length();
    if (len === 0) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      return;
    }
    this.x /= len;
    this.y /= len;
    this.z /= len;
  }

  normalized(): Vector3 {
    const v = this.clone();
    v.normalize();
    return v;
  }

  is_normalized(): boolean {
    return is_equal_approx(this.length_squared(), 1);
  }

  dot(with_: Vector3): number {
    return this.x * with_.x + this.y * with_.y + this.z * with_.z;
  }

  cross(with_: Vector3): Vector3 {
    return new Vector3(
      this.y * with_.z - this.z * with_.y,
      this.z * with_.x - this.x * with_.z,
      this.x * with_.y - this.y * with_.x,
    );
  }

  lerp(to: Vector3, weight: number): Vector3 {
    return new Vector3(
      this.x + (to.x - this.x) * weight,
      this.y + (to.y - this.y) * weight,
      this.z + (to.z - this.z) * weight,
    );
  }

  distance_to(to: Vector3): number {
    return Math.hypot(this.x - to.x, this.y - to.y, this.z - to.z);
  }

  distance_squared_to(to: Vector3): number {
    const dx = this.x - to.x;
    const dy = this.y - to.y;
    const dz = this.z - to.z;
    return dx * dx + dy * dy + dz * dz;
  }

  direction_to(to: Vector3): Vector3 {
    return to.sub(this).normalized();
  }

  angle_to(to: Vector3): number {
    const denom = Math.sqrt(this.length_squared() * to.length_squared());
    if (denom === 0) {
      return 0;
    }
    const cos = Math.min(1, Math.max(-1, this.dot(to) / denom));
    return Math.acos(cos);
  }

  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  mul(v: number | Vector3): Vector3 {
    if (typeof v === "number") {
      return new Vector3(this.x * v, this.y * v, this.z * v);
    }
    return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
  }

  div(v: number | Vector3): Vector3 {
    if (typeof v === "number") {
      return new Vector3(this.x / v, this.y / v, this.z / v);
    }
    return new Vector3(this.x / v.x, this.y / v.y, this.z / v.z);
  }

  neg(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  abs(): Vector3 {
    return new Vector3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z));
  }

  inverse(): Vector3 {
    return new Vector3(1 / this.x, 1 / this.y, 1 / this.z);
  }

  get_any_perpendicular(): Vector3 {
    const axis =
      Math.abs(this.x) <= Math.abs(this.y) && Math.abs(this.x) <= Math.abs(this.z)
        ? Vector3.RIGHT
        : Vector3.UP;
    return this.cross(axis).normalized();
  }

  is_equal_approx(v: Vector3): boolean {
    return (
      is_equal_approx(this.x, v.x) &&
      is_equal_approx(this.y, v.y) &&
      is_equal_approx(this.z, v.z)
    );
  }

  is_zero_approx(): boolean {
    return is_zero_approx(this.x) && is_zero_approx(this.y) && is_zero_approx(this.z);
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  component(index: number): number {
    if (index === 0) return this.x;
    if (index === 1) return this.y;
    return this.z;
  }
}
