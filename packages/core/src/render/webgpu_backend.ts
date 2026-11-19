import { Color } from "../math/color.js";
import type { Mesh } from "../scene/mesh.js";
import type { Material } from "../scene/material.js";
import { ShaderMaterial } from "../scene/material.js";
import { StandardMaterial3D } from "../scene/standard_material3d.js";
import type { RenderBackend, RenderFrame } from "./frame.js";
import { CLEAR_COLOR, surface_attribs } from "./frame.js";
import { Shader } from "./shaders.js";
import {
  LIT_SHADER,
  WGSL_CAMERA_FLOATS,
  WGSL_DRAW_FLOATS,
  coerce_vec4,
  fill_camera,
  fill_draw,
  light_dir_for,
  view_proj_for_backend,
} from "./shaders.js";

const VERTEX_FLOATS = 9; // position 3 + normal 3 + color 3
const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VERTEX_FLOATS * 4,
  attributes: [
    { shaderLocation: 0, format: "float32x3", offset: 0 },
    { shaderLocation: 1, format: "float32x3", offset: 12 },
    { shaderLocation: 2, format: "float32x3", offset: 24 },
  ],
};

const DRAW_SCRATCH = new Float32Array(WGSL_DRAW_FLOATS);
const CAMERA_SCRATCH = new Float32Array(WGSL_CAMERA_FLOATS);
const WHITE_ALBEDO = new Color(1, 1, 1, 1);

interface UploadedMesh {
  vertex: GPUBuffer;
  indices: GPUBuffer;
  count: number;
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

export class WebGPURenderBackend implements RenderBackend {
  readonly name = "webgpu" as const;

  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly camera_layout: GPUBindGroupLayout;
  private readonly draw_layout: GPUBindGroupLayout;
  private readonly pipeline_layout: GPUPipelineLayout;
  private readonly camera_buffer: GPUBuffer;
  private readonly camera_group: GPUBindGroup;
  private readonly dummy_params: GPUBuffer;

  /** One pipeline per Shader, one draw uniform per draw slot, one bind group per slot-and-material. */
  private readonly pipelines = new Map<Shader, GPURenderPipeline>();
  private readonly draw_buffers: GPUBuffer[] = [];
  private readonly bind_groups = new Map<string, GPUBindGroup>();
  private readonly materials = new Map<ShaderMaterial, GPUBuffer>();
  private readonly meshes = new Map<Mesh, UploadedMesh>();
  private readonly view_proj = new Float32Array(16);
  private depth: GPUTexture | null = null;
  private depth_view: GPUTextureView | null = null;

  private constructor(context: GPUCanvasContext, device: GPUDevice) {
    this.context = context;
    this.device = device;
    const camera_layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }],
    });
    const draw_layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
      ],
    });
    this.pipeline_layout = device.createPipelineLayout({ bindGroupLayouts: [camera_layout, draw_layout] });
    this.draw_layout = draw_layout;
    this.camera_layout = camera_layout;
    this.camera_buffer = device.createBuffer({
      size: WGSL_CAMERA_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.camera_group = device.createBindGroup({
      layout: camera_layout,
      entries: [{ binding: 0, resource: { buffer: this.camera_buffer } }],
    });
    this.dummy_params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderBackend> {
    if (!("gpu" in navigator) || navigator.gpu === undefined) {
      throw new Error("WebGPU is not available.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) {
      throw new Error("WebGPU has no adapter.");
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (context === null) {
      throw new Error("WebGPU canvas context failed.");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    return new WebGPURenderBackend(context, device);
  }

  render(frame: RenderFrame): void {
    const depth = this.depth_view_for(frame.width, frame.height);
    if (frame.camera && frame.camera_transform) {
      view_proj_for_backend(frame, true, this.view_proj);
    }
    fill_camera(CAMERA_SCRATCH, this.view_proj, light_dir_for(frame), frame.light_color, frame.ambient);
    this.device.queue.writeBuffer(this.camera_buffer, 0, CAMERA_SCRATCH);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: CLEAR_COLOR.r, g: CLEAR_COLOR.g, b: CLEAR_COLOR.b, a: CLEAR_COLOR.a },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depth,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    for (let slot = 0; slot < frame.draws.length; slot += 1) {
      const draw = frame.draws[slot];
      const material = draw.material;
      const uploaded = this.mesh_for(draw.mesh);
      const albedo = material instanceof StandardMaterial3D ? material.albedo : WHITE_ALBEDO;
      fill_draw(DRAW_SCRATCH, draw.transform, draw.normal_matrix, albedo);
      const draw_buffer = this.draw_uniform(slot);
      this.device.queue.writeBuffer(draw_buffer, 0, DRAW_SCRATCH);
      const group = this.draw_bind_group(slot, material);
      if (material instanceof ShaderMaterial) {
        this.device.queue.writeBuffer(this.params_buffer(material), 0, this.param_scratch(material));
      }
      pass.setPipeline(this.pipeline_for(material));
      pass.setBindGroup(0, this.camera_group);
      pass.setBindGroup(1, group);
      pass.setVertexBuffer(0, uploaded.vertex);
      pass.setIndexBuffer(uploaded.indices, "uint32");
      pass.drawIndexed(uploaded.count);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private pipeline_for(material: Material): GPURenderPipeline {
    const shader = material instanceof ShaderMaterial ? material.shader : LIT_SHADER;
    let pipeline = this.pipelines.get(shader);
    if (pipeline === undefined) {
      const module = this.device.createShaderModule({ code: shader.webgpu });
      pipeline = this.device.createRenderPipeline({
        layout: this.pipeline_layout,
        vertex: { module, entryPoint: "vs", buffers: [VERTEX_LAYOUT] },
        fragment: {
          module,
          entryPoint: "fs",
          // The preferred surface format, read at configure time.
          targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
        },
        primitive: { topology: "triangle-list", cullMode: "back" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
      });
      this.pipelines.set(shader, pipeline);
    }
    return pipeline;
  }

  /** Grows the per-draw uniform pool; 128 bytes per slot. */
  private draw_uniform(slot: number): GPUBuffer {
    while (this.draw_buffers.length <= slot) {
      this.draw_buffers.push(this.device.createBuffer({
        size: WGSL_DRAW_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }));
    }
    return this.draw_buffers[slot];
  }

  private draw_bind_group(slot: number, material: Material): GPUBindGroup {
    const params = material instanceof ShaderMaterial ? this.params_buffer(material) : this.dummy_params;
    const key = `${slot}:${material instanceof ShaderMaterial ? id_of(material) : 0}`;
    let group = this.bind_groups.get(key);
    if (group === undefined) {
      group = this.device.createBindGroup({
        layout: this.draw_layout,
        entries: [
          { binding: 0, resource: { buffer: this.draw_uniform(slot) } },
          { binding: 1, resource: { buffer: params } },
        ],
      });
      this.bind_groups.set(key, group);
    }
    return group;
  }

  private params_buffer(material: ShaderMaterial): GPUBuffer {
    let buffer = this.materials.get(material);
    if (buffer === undefined) {
      buffer = this.device.createBuffer({
        size: Math.max(16, material.shader.params.length * 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.materials.set(material, buffer);
    }
    return buffer;
  }

  /** Packed shader parameters, in the Shader's own order. */
  private param_scratch(material: ShaderMaterial): Float32Array {
    const scratch = new Float32Array(Math.max(4, material.shader.params.length * 4));
    const values = material.get_shader_parameter_list();
    material.shader.params.forEach((name: string, index: number) => {
      const [r, g, b, a] = coerce_vec4(values.get(name));
      scratch[index * 4] = r;
      scratch[index * 4 + 1] = g;
      scratch[index * 4 + 2] = b;
      scratch[index * 4 + 3] = a;
    });
    return scratch;
  }

  /** Depth texture view matching the current canvas size; recreated when the size moves. */
  private depth_view_for(width: number, height: number): GPUTextureView {
    if (this.depth && this.depth_view && this.depth.width === width && this.depth.height === height) {
      return this.depth_view;
    }
    this.depth?.destroy();
    this.depth = this.device.createTexture({
      size: { width, height },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depth_view = this.depth.createView();
    return this.depth_view;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.vertex.destroy();
      mesh.indices.destroy();
    }
    for (const buffer of this.draw_buffers) {
      buffer.destroy();
    }
    for (const buffer of this.materials.values()) {
      buffer.destroy();
    }
    this.meshes.clear();
    this.draw_buffers.length = 0;
    this.materials.clear();
    this.bind_groups.clear();
    this.pipelines.clear();
    this.depth?.destroy();
    this.depth = null;
    this.depth_view = null;
    this.camera_buffer.destroy();
    this.dummy_params.destroy();
  }

  private mesh_for(mesh: Mesh): UploadedMesh {
    const cached = this.meshes.get(mesh);
    if (cached) {
      return cached;
    }
    const surface = mesh.surface();
    const { count, normals, colors } = surface_attribs(surface);
    const interleaved = new Float32Array(count * VERTEX_FLOATS);
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
        i * VERTEX_FLOATS,
      );
    }
    const vertex = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertex.getMappedRange()).set(interleaved);
    vertex.unmap();

    const indices = this.device.createBuffer({
      size: surface.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(indices.getMappedRange()).set(surface.indices);
    indices.unmap();

    const uploaded = { vertex, indices, count: surface.indices.length };
    this.meshes.set(mesh, uploaded);
    return uploaded;
  }
}
