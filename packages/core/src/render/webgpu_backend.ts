import type { Mesh } from "../scene/mesh.js";
import type { RenderBackend, RenderFrame } from "./frame.js";
import { CLEAR_COLOR } from "./frame.js";
import { fill_wgsl_uniforms, SHADER_WGSL, view_proj_for_backend, WGSL_UNIFORM_FLOATS } from "./shaders.js";

const VERTEX_FLOATS = 9; // position 3 + normal 3 + color 3
const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VERTEX_FLOATS * 4,
  attributes: [
    { shaderLocation: 0, format: "float32x3", offset: 0 },
    { shaderLocation: 1, format: "float32x3", offset: 12 },
    { shaderLocation: 2, format: "float32x3", offset: 24 },
  ],
};

interface UploadedMesh {
  vertex: GPUBuffer;
  indices: GPUBuffer;
  count: number;
}

export class WebGPURenderBackend implements RenderBackend {
  readonly name = "webgpu" as const;

  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniform: GPUBuffer;
  private readonly bind_group: GPUBindGroup;
  private readonly scratch = new Float32Array(WGSL_UNIFORM_FLOATS);
  private readonly meshes = new Map<Mesh, UploadedMesh>();
  private readonly view_proj = new Float32Array(16);
  private depth: GPUTexture | null = null;
  private depth_view: GPUTextureView | null = null;

  private constructor(
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
  ) {
    this.context = context;
    this.device = device;
    const module = device.createShaderModule({ code: SHADER_WGSL });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs", buffers: [VERTEX_LAYOUT] },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
    this.uniform = device.createBuffer({
      size: WGSL_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bind_group = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });
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
    return new WebGPURenderBackend(context, device, format);
  }

  render(frame: RenderFrame): void {
    const depth = this.depth_view_for(frame.width, frame.height);
    if (frame.draws.length > 0 && frame.camera && frame.camera_transform) {
      view_proj_for_backend(frame, true, this.view_proj);
    }

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
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bind_group);

    for (const draw of frame.draws) {
      const uploaded = this.mesh_for(draw.mesh);
      fill_wgsl_uniforms(this.scratch, this.view_proj, frame, draw.transform, draw.normal_matrix, draw.albedo);
      this.device.queue.writeBuffer(this.uniform, 0, this.scratch);
      pass.setVertexBuffer(0, uploaded.vertex);
      pass.setIndexBuffer(uploaded.indices, "uint32");
      pass.drawIndexed(uploaded.count);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
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
    return this.depth_view as GPUTextureView;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.vertex.destroy();
      mesh.indices.destroy();
    }
    this.meshes.clear();
    this.depth?.destroy();
    this.depth = null;
    this.depth_view = null;
    this.uniform.destroy();
  }

  private mesh_for(mesh: Mesh): UploadedMesh {
    const cached = this.meshes.get(mesh);
    if (cached) {
      return cached;
    }
    const surface = mesh.surface();
    const count = surface.positions.length / 3;
    const interleaved = new Float32Array(count * VERTEX_FLOATS);
    for (let i = 0; i < count; i += 1) {
      interleaved.set(
        [
          surface.positions[i * 3],
          surface.positions[i * 3 + 1],
          surface.positions[i * 3 + 2],
          surface.normals[i * 3],
          surface.normals[i * 3 + 1],
          surface.normals[i * 3 + 2],
          surface.colors[i * 3],
          surface.colors[i * 3 + 1],
          surface.colors[i * 3 + 2],
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
