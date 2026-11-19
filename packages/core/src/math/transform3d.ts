import { Basis } from "./basis.js";
import { Vector3 } from "./vector3.js";

/** Godot 4 Transform3D. A basis plus an origin. */
export class Transform3D {
  basis: Basis;
  origin: Vector3;

  constructor(basis: Basis = Basis.IDENTITY, origin: Vector3 = Vector3.ZERO) {
    this.basis = basis;
    this.origin = origin;
  }

  static readonly IDENTITY = new Transform3D();

  xform(point: Vector3): Vector3 {
    return this.basis.xform(point).add(this.origin);
  }

  /**
   * Returns a copy that looks at `target` from this origin.
   * `use_model_front` makes local +Z face the target.
   */
  looking_at(target: Vector3, up: Vector3 = Vector3.UP, use_model_front = false): Transform3D {
    return new Transform3D(Basis.looking_at(target.sub(this.origin), up, use_model_front), this.origin.clone());
  }

  translated(offset: Vector3): Transform3D {
    return new Transform3D(this.basis, this.origin.add(offset));
  }

  is_equal_approx(t: Transform3D): boolean {
    return this.basis.is_equal_approx(t.basis) && this.origin.is_equal_approx(t.origin);
  }
}
