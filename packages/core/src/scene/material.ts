import { Dictionary } from "../dictionary.js";
import type { Shader } from "../render/shaders.js";

/** Godot 4 Material base. The renderer reads the concrete type per draw. */
export abstract class Material {}

/**
 * Godot 4 ShaderMaterial: a Shader plus values for its named uniforms.
 * Values arrive at the GPU in the Shader's own parameter order; the WGSL
 * params are `vec4f`, so colors, vectors, and scalars all coerce.
 */
export class ShaderMaterial extends Material {
  shader: Shader;

  private readonly _params = new Dictionary<string, unknown>();

  constructor(shader: Shader) {
    super();
    this.shader = shader;
  }

  set_shader_parameter(name: string, value: unknown): void {
    this._params.set(name, value);
  }

  get_shader_parameter(name: string): unknown {
    return this._params.get(name);
  }

  /** A copy of the parameter values, keyed by name. */
  get_shader_parameter_list(): Dictionary<string, unknown> {
    return this._params.duplicate(false);
  }
}
