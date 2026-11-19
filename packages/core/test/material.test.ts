import { describe, expect, it } from "vitest";
import { Color } from "../src/math/color.js";
import { Dictionary } from "../src/dictionary.js";
import { Material, ShaderMaterial } from "../src/scene/material.js";
import { StandardMaterial3D } from "../src/scene/standard_material3d.js";
import { Shader, coerce_vec4 } from "../src/render/shaders.js";

/** A ShaderMaterial over a small tint shader, for API tests without a GPU. */
function tint_material(): ShaderMaterial {
  const shader = Shader.lit({
    uniforms: ["Tint"],
    webgpu_body: `  return vec4f(albedo * color * lighting(normal) * Tint.rgb, 1.0);`,
    webgl_body: `  return vec4(albedo * color * lighting() * Tint.rgb, 1.0);`,
  });
  return new ShaderMaterial(shader);
}

describe("ShaderMaterial", () => {
  it("Material is the shared base class", () => {
    expect(new StandardMaterial3D() instanceof Material).toBe(true);
    expect(tint_material() instanceof Material).toBe(true);
  });

  it("set and get parameters like Godot", () => {
    const material = tint_material();
    material.set_shader_parameter("Tint", Color.html("#7dd3fc"));
    expect((material.get_shader_parameter("Tint") as Color).to_html()).toBe("#7dd3fc");
    expect(material.get_shader_parameter("missing")).toBeNull();
  });

  it("get_shader_parameter_list returns a copy", () => {
    const material = tint_material();
    material.set_shader_parameter("Tint", Color.html("#7dd3fc"));
    const list = material.get_shader_parameter_list();
    list.set("Tint", null);
    expect((material.get_shader_parameter("Tint") as Color).r).toBeGreaterThan(0);
    expect(list instanceof Dictionary).toBe(true);
  });

  it("parameters coerce to GPU vec4", () => {
    expect(coerce_vec4(Color.html("#ff0000"))).toEqual([1, 0, 0, 1]);
    expect(coerce_vec4(2.5)).toEqual([2.5, 0, 0, 0]);
    expect(coerce_vec4(true)).toEqual([1, 1, 1, 1]);
    expect(coerce_vec4("word")).toEqual([0, 0, 0, 0]);
  });
});

describe("Shader.lit", () => {
  it("generates both programs, declaring each shared parameter once by name", () => {
    const shader = Shader.lit({
      uniforms: ["Tint", "Speed"],
      webgpu_body: `  return vec4f(albedo * color * lighting(normal) * Tint.rgb, 1.0);`,
      webgl_body: `  return vec4(albedo * color * lighting() * Tint.rgb, 1.0);`,
    });
    expect(shader.params).toEqual(["Tint", "Speed"]);

    // WGSL: the params struct on group 1 binding 1, plus one let per parameter.
    expect(shader.webgpu).toContain("struct Params {");
    expect(shader.webgpu).toContain("Tint : vec4f");
    expect(shader.webgpu).toContain("@group(1) @binding(1) var<uniform> p : Params;");
    expect(shader.webgpu).toContain("let Tint = p.Tint;");
    expect(shader.webgpu).toContain("fn lighting(normal : vec3f)");

    // GLSL: `uniform vec4 <Name>` per parameter, main() calling the fragment body.
    expect(shader.webgl.fragment).toContain("uniform vec4 Tint;");
    expect(shader.webgl.fragment).toContain("uniform vec4 Speed;");
    expect(shader.webgl.fragment).toContain("vec4 fs_fragment()");
    expect(shader.webgl.vertex).toContain("u_view_proj");
  });

  it("rejects malformed uniform names", () => {
    expect(() => Shader.lit({ uniforms: ["bad name"], webgpu_body: "", webgl_body: "" })).toThrow(/valid name/);
  });
});
