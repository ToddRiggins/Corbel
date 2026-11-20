import { Color } from "../math/color.js";
import type { Mesh } from "../scene/mesh.js";
import type { Material } from "../scene/material.js";
import { ShaderMaterial } from "../scene/material.js";
import { StandardMaterial3D } from "../scene/standard_material3d.js";
import { Texture2D } from "../scene/texture.js";
import type { RenderBackend, RenderFrame } from "./frame.js";
import { CLEAR_COLOR, surface_attribs } from "./frame.js";
import { Shader, coerce_vec4, light_dir_for, view_proj_for_backend } from "./shaders.js";
import { LIT_SHADER } from "./shaders.js";

const WHITE_ALBEDO = new Color(1, 1, 1, 1);

interface UploadedMesh {
  vertex: WebGLBuffer;
  indices: WebGLBuffer;
  count: number;
}


interface CompiledShader {
  program: WebGLProgram;
  /** Locations resolved once per program, cached by uniform name. */
  locations: Map<string, WebGLUniformLocation | null>;
}

export function material_id(): (material: Material) => number {
  const ids = new WeakMap<Material, number>();
  let next = 1;
  return (material) => {
    let id = ids.get(material);
    if (id === undefined) {
      id = next;
      next += 1;
      ids.set(material, id);
    }
    return id;
  };
}

const id_of = material_id();

export class WebGL2RenderBackend implements RenderBackend {
  readonly name = "webgl2" as const;

  private readonly gl: WebGL2RenderingContext;
  private readonly compiled = new Map<Shader, CompiledShader>();
  private readonly meshes = new Map<Mesh, UploadedMesh>();
  private readonly view_proj = new Float32Array(16);

  private constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (gl === null) {
      throw new Error("WebGL2 is not available.");
    }
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  static create(canvas: HTMLCanvasElement): WebGL2RenderBackend {
    return new WebGL2RenderBackend(canvas);
  }

  render(frame: RenderFrame): void {
    const gl = this.gl;
    gl.viewport(0, 0, frame.width, frame.height);
    gl.clearColor(frame.background.r, frame.background.g, frame.background.b, frame.background.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!frame.camera || !frame.camera_transform || frame.draws.length === 0) {
      return;
    }
    const dir = light_dir_for(frame);

    for (let slot = 0; slot < frame.draws.length; slot += 1) {
      const draw = frame.draws[slot];
      const material = draw.material;
      const shader = material instanceof ShaderMaterial ? material.shader : LIT_SHADER;
      const compiled = this.shader_for(shader);
      const uploaded = this.mesh_for(draw.mesh);

      gl.useProgram(compiled.program);
      view_proj_for_backend(frame, false, this.view_proj);
      this.set_uniform(compiled, "u_view_proj", (location) => gl.uniformMatrix4fv(location, false, this.view_proj));
      this.set_uniform(compiled, "u_light_dir", (location) => gl.uniform4f(location, dir.x, dir.y, dir.z, 0));
      this.set_uniform(compiled, "u_light_color", (location) => gl.uniform4f(location, frame.light_color.r, frame.light_color.g, frame.light_color.b, 1));
      this.set_uniform(compiled, "u_ambient", (location) => gl.uniform4f(location, frame.ambient.r, frame.ambient.g, frame.ambient.b, 1));

      const albedo = material instanceof StandardMaterial3D ? material.albedo : WHITE_ALBEDO;
      gl.bindBuffer(gl.ARRAY_BUFFER, uploaded.vertex);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, uploaded.indices);
      gl.uniformMatrix4fv(this.location(compiled, "u_model"), false, draw.transform);
      gl.uniformMatrix3fv(this.location(compiled, "u_normal_mat"), false, draw.normal_matrix);
      gl.uniform4f(this.location(compiled, "u_albedo"), albedo.r, albedo.g, albedo.b, 1);
      // The albedo texture: unit 0, or the white dummy when the material has none.
      const albedo_texture = material instanceof StandardMaterial3D ? material.albedo_texture : null;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.albedo_gpu_texture(albedo_texture));
      gl.uniform1i(this.location(compiled, "u_albedo_texture"), 0);
      if (material instanceof ShaderMaterial) {
        const values = material.get_shader_parameter_list();
        for (const name of shader.params) {
          const [r, g, b, a] = coerce_vec4(values.get(name));
          gl.uniform4f(this.location(compiled, name), r, g, b, a);
        }
      }
      gl.drawElements(gl.TRIANGLES, uploaded.count, gl.UNSIGNED_INT, 0);
    }
  }

  private shader_for(shader: Shader): CompiledShader {
    let compiled = this.compiled.get(shader);
    if (compiled === undefined) {
      compiled = {
        program: link_program(this.gl, shader.webgl.vertex, shader.webgl.fragment),
        locations: new Map(),
      };
      this.compiled.set(shader, compiled);
    }
    return compiled;
  }

  private readonly gl_textures = new Map<Texture2D, WebGLTexture>();
  private dummy_texture: WebGLTexture | null = null;
  private dummy_uploaded = false;

  /** Uploads (once) the albedo texture; no texture binds the white 1x1. */
  private albedo_gpu_texture(texture: Texture2D | null): WebGLTexture {
    const gl = this.gl;
    if (texture === null) {
      if (!this.dummy_uploaded) {
        this.dummy_texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.dummy_texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        this.dummy_uploaded = true;
      }
      return this.dummy_texture as WebGLTexture;
    }
    let uploaded = this.gl_textures.get(texture);
    if (uploaded === undefined) {
      uploaded = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, uploaded);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image as unknown as TexImageSource);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.gl_textures.set(texture, uploaded);
    }
    return uploaded;
  }

  private location(compiled: CompiledShader, name: string): WebGLUniformLocation | null {
    let location = compiled.locations.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(compiled.program, name);
      compiled.locations.set(name, location);
    }
    return location;
  }

  /** Sets one uniform when the program actually has it; optional uniforms stay silent. */
  private set_uniform(compiled: CompiledShader, name: string, write: (location: WebGLUniformLocation) => void): void {
    const location = this.location(compiled, name);
    if (location) {
      write(location);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.gl.deleteBuffer(mesh.vertex);
      this.gl.deleteBuffer(mesh.indices);
    }
    for (const compiled of this.compiled.values()) {
      this.gl.deleteProgram(compiled.program);
    }
    this.meshes.clear();
    this.compiled.clear();
  }

  private mesh_for(mesh: Mesh): UploadedMesh {
    const cached = this.meshes.get(mesh);
    if (cached) {
      return cached;
    }
    const surface = mesh.surface();
    const { count, normals, colors, uvs } = surface_attribs(surface);
    const interleaved = new Float32Array(count * 11);
    for (let i = 0; i < count; i += 1) {
      interleaved.set(
        [
          surface.positions[i * 3],
          surface.positions[i * 3 + 1],
          surface.positions[i * 3 + 2],
          normals[i * 3],
          normals[i * 3 + 1],
          normals[i * 3 + 2],
          colors[i * 3],
          colors[i * 3 + 1],
          colors[i * 3 + 2],
          uvs[i * 2],
          uvs[i * 2 + 1],
        ],
        i * 11,
      );
    }
    const gl = this.gl;
    const vertex = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);

    const indices = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, surface.indices, gl.STATIC_DRAW);

    const uploaded = { vertex, indices, count: surface.indices.length };
    this.meshes.set(mesh, uploaded);
    return uploaded;
  }
}

/** Compiles and links one program; throws with the driver's log on failure. */
function link_program(gl: WebGL2RenderingContext, vert_src: string, frag_src: string): WebGLProgram {
  const program = gl.createProgram()!;
  const vert = compile_shader(gl, gl.VERTEX_SHADER, vert_src);
  const frag = compile_shader(gl, gl.FRAGMENT_SHADER, frag_src);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL2 program link failed: ${log ?? "no log"}`);
  }
  return program;
}

function compile_shader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL2 shader compile failed: ${log ?? "no log"}`);
  }
  return shader;
}
