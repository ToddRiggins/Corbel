import type { Mesh } from "../scene/mesh.js";
import type { RenderBackend, RenderFrame } from "./frame.js";
import { CLEAR_COLOR, surface_attribs } from "./frame.js";
import { light_dir_for, SHADER_FRAG_GLSL, SHADER_VERT_GLSL, view_proj_for_backend } from "./shaders.js";

interface UploadedMesh {
  vertex: WebGLBuffer;
  indices: WebGLBuffer;
  count: number;
}

export class WebGL2RenderBackend implements RenderBackend {
  readonly name = "webgl2" as const;

  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private readonly meshes = new Map<Mesh, UploadedMesh>();
  private readonly view_proj = new Float32Array(16);

  private constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (gl === null) {
      throw new Error("WebGL2 is not available.");
    }
    this.gl = gl;
    this.program = link_program(gl, SHADER_VERT_GLSL, SHADER_FRAG_GLSL);
    this.uniforms = {
      view_proj: gl.getUniformLocation(this.program, "u_view_proj"),
      model: gl.getUniformLocation(this.program, "u_model"),
      normal_mat: gl.getUniformLocation(this.program, "u_normal_mat"),
      light_dir: gl.getUniformLocation(this.program, "u_light_dir"),
      light_color: gl.getUniformLocation(this.program, "u_light_color"),
      ambient: gl.getUniformLocation(this.program, "u_ambient"),
      albedo: gl.getUniformLocation(this.program, "u_albedo"),
    };
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
    gl.clearColor(CLEAR_COLOR.r, CLEAR_COLOR.g, CLEAR_COLOR.b, CLEAR_COLOR.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!frame.camera || !frame.camera_transform || frame.draws.length === 0) {
      return;
    }
    gl.useProgram(this.program);
    view_proj_for_backend(frame, false, this.view_proj);
    gl.uniformMatrix4fv(this.uniforms.view_proj, false, this.view_proj);
    const dir = light_dir_for(frame);
    gl.uniform4f(this.uniforms.light_dir, dir.x, dir.y, dir.z, 0);
    gl.uniform4f(this.uniforms.light_color, frame.light_color.r, frame.light_color.g, frame.light_color.b, 1);
    gl.uniform4f(this.uniforms.ambient, frame.ambient.r, frame.ambient.g, frame.ambient.b, 1);

    for (const draw of frame.draws) {
      const uploaded = this.mesh_for(draw.mesh);
      gl.bindBuffer(gl.ARRAY_BUFFER, uploaded.vertex);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, uploaded.indices);
      gl.uniformMatrix4fv(this.uniforms.model, false, draw.transform);
      gl.uniformMatrix3fv(this.uniforms.normal_mat, false, draw.normal_matrix);
      gl.uniform4f(this.uniforms.albedo, draw.albedo.r, draw.albedo.g, draw.albedo.b, 1);
      gl.drawElements(gl.TRIANGLES, uploaded.count, gl.UNSIGNED_INT, 0);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.gl.deleteBuffer(mesh.vertex);
      this.gl.deleteBuffer(mesh.indices);
    }
    this.meshes.clear();
    this.gl.deleteProgram(this.program);
  }

  private mesh_for(mesh: Mesh): UploadedMesh {
    const cached = this.meshes.get(mesh);
    if (cached) {
      return cached;
    }
    const surface = mesh.surface();
    const { count, normals, colors } = surface_attribs(surface);
    const interleaved = new Float32Array(count * 9);
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
        ],
        i * 9,
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
