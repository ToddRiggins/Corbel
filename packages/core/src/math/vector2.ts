import { is_equal_approx, is_zero_approx } from "./approx.js";

/** Godot 4 Vector2. Operators are methods: `a + b` is `a.add(b)`. */
export class Vector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  static readonly ZERO = new Vector2(0, 0);
  static readonly ONE = new Vector2(1, 1);
  static readonly LEFT = new Vector2(-1, 0);
  static readonly RIGHT = new Vector2(1, 0);
  static readonly UP = new Vector2(0, -1);
  static readonly DOWN = new Vector2(0, 1);

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  length_squared(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): void {
    const len = this.length();
    if (len === 0) {
      this.x = 0;
      this.y = 0;
      return;
    }
    this.x /= len;
    this.y /= len;
  }

  normalized(): Vector2 {
    const v = this.clone();
    v.normalize();
    return v;
  }

  dot(with_: Vector2): number {
    return this.x * with_.x + this.y * with_.y;
  }

  /** The Z component of the 3D cross product. Godot returns a float here. */
  cross(with_: Vector2): number {
    return this.x * with_.y - this.y * with_.x;
  }

  lerp(to: Vector2, weight: number): Vector2 {
    return new Vector2(
      this.x + (to.x - this.x) * weight,
      this.y + (to.y - this.y) * weight,
    );
  }

  distance_to(to: Vector2): number {
    return Math.hypot(this.x - to.x, this.y - to.y);
  }

  direction_to(to: Vector2): Vector2 {
    return to.sub(this).normalized();
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  mul(v: number | Vector2): Vector2 {
    if (typeof v === "number") {
      return new Vector2(this.x * v, this.y * v);
    }
    return new Vector2(this.x * v.x, this.y * v.y);
  }

  div(v: number | Vector2): Vector2 {
    if (typeof v === "number") {
      return new Vector2(this.x / v, this.y / v);
    }
    return new Vector2(this.x / v.x, this.y / v.y);
  }

  neg(): Vector2 {
    return new Vector2(-this.x, -this.y);
  }

  is_equal_approx(v: Vector2): boolean {
    return is_equal_approx(this.x, v.x) && is_equal_approx(this.y, v.y);
  }

  is_zero_approx(): boolean {
    return is_zero_approx(this.x) && is_zero_approx(this.y);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }
}
