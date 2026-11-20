import { Color } from "../math/color.js";
import { Vector3 } from "../math/vector3.js";
import type { Mesh } from "../scene/mesh.js";
import type { Material } from "../scene/material.js";
import { ShaderMaterial } from "../scene/material.js";
import { StandardMaterial3D } from "../scene/standard_material3d.js";
import { Texture2D } from "../scene/texture.js";
import type { RenderBackend, RenderFrame } from "./frame.js";
import { build_shadow_view, CLEAR_COLOR, surface_attribs } from "./frame.js";
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

const VERTEX_FLOATS = 15; // position 3 + normal 3 + color 3 + uv 2 + tangent 4
const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VERTEX_FLOATS * 4,
  attributes: [
    { shaderLocation: 0, format: "float32x3", offset: 0 },
    { shaderLocation: 1, format: "float32x3", offset: 12 },
    { shaderLocation: 2, format: "float32x3", offset: 24 },
    { shaderLocation: 3, format: "float32x2", offset: 36 },
    { shaderLocation: 4, format: "float32x4", offset: 44 },
  ],
};

const DRAW_SCRATCH = new Float32Array(WGSL_DRAW_FLOATS);
const CAMERA_SCRATCH = new Float32Array(WGSL_CAMERA_FLOATS);
const SHADOW_CAMERA_SCRATCH = new Float32Array(WGSL_CAMERA_FLOATS);
const SHADOW_MODULE = `
struct ShadowCamera {
  view_proj : mat4x4f,
};
@group(0) @binding(0) var<uniform> c : ShadowCamera;

@vertex
fn vs_shadow(@location(0) pos : vec3f) -> @builtin(position) vec4f {
  return c.view_proj * vec4f(pos, 1.0);
}

@fragment
fn fs_shadow() {}
`;
const CAM_POS = { x: 0, y: 0, z: 0 };
const WHITE_ALBEDO = new Color(1, 1, 1, 1);

/** Standard alpha blend: src alpha, one minus src alpha per channel. */
const BLEND_ALPHA: GPUBlendState = {
  color: {
    operation: "add",
    srcFactor: "src-alpha",
    dstFactor: "one-minus-src-alpha",
  },
  alpha: {
    operation: "add",
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
  },
};

interface UploadedMesh {
  vertex: GPUBuffer;
  indices: GPUBuffer;
  count: number;
  /** The surface carried real tangents (not the identity default). */
  has_tangents: boolean;
}

/** The four texture maps a material carries, all null when it is not standard. */
function map_pair_of(material: Material): { albedo: Texture2D | null; normal: Texture2D | null; roughness: Texture2D | null; metallic: Texture2D | null; emission: Texture2D | null } {
  if (material instanceof StandardMaterial3D) {
    return {
      albedo: material.albedo_texture,
      normal: material.normal_texture,
      roughness: material.roughness_texture,
      metallic: material.metallic_texture,
      emission: material.emission_texture,
    };
  }
  return { albedo: null, normal: null, roughness: null, metallic: null, emission: null };
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
  private readonly shadow_camera_buffer: GPUBuffer;
  private readonly shadow_camera_group: GPUBindGroup;
  private readonly shadow_texture: GPUTexture;
  private readonly shadow_view: GPUTextureView;
  private readonly shadow_sampler: GPUSampler;
  private readonly shadow_pipelines = new Map<string, GPURenderPipeline>();
  private readonly depth_pipeline: GPUPipelineLayout;
  private readonly shadow_uniform_layout: GPUBindGroupLayout;
  private readonly dummy_params: GPUBuffer;
  private readonly dummy_texture: GPUTexture;
  private readonly dummy_sampler: GPUSampler;
  /** Decoded GPU texture pairs per material albedo texture. */
  private readonly textures = new Map<Texture2D, { texture: GPUTexture; sampler: GPUSampler }>();

  /** One pipeline per Shader, one draw uniform per draw slot, one bind group per slot-and-material. */
  private readonly pipelines = new Map<string, GPURenderPipeline>();
  private readonly draw_buffers: GPUBuffer[] = [];
  private readonly bind_groups = new Map<string, GPUBindGroup>();
  private readonly materials = new Map<ShaderMaterial, GPUBuffer>();
  private readonly meshes = new Map<Mesh, UploadedMesh>();
  private readonly view_proj = new Float32Array(16);
  private readonly shadow_proj = new Float32Array(16);
  private depth: GPUTexture | null = null;
  private depth_view: GPUTextureView | null = null;

  private constructor(context: GPUCanvasContext, device: GPUDevice) {
    this.context = context;
    this.device = device;
    const camera_layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        // The directional shadow map, sampled with depth comparisons.
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      ],
    });
    const draw_layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 9, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 11, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 12, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 13, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 14, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 15, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 16, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 17, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 18, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 19, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.pipeline_layout = device.createPipelineLayout({ bindGroupLayouts: [camera_layout, draw_layout] });
    this.camera_layout = camera_layout;
    this.draw_layout = draw_layout;
    this.camera_buffer = device.createBuffer({
      size: WGSL_CAMERA_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // The directional shadow map: one fixed 2048 depth texture the light pass
    // rewrites each frame and every fragment compares against.
    this.shadow_texture = device.createTexture({
      size: [2048, 2048],
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadow_view = this.shadow_texture.createView();
    this.shadow_sampler = device.createSampler({
      compare: "greater-equal",
      magFilter: "linear",
      minFilter: "linear",
    });
    this.camera_group = device.createBindGroup({
      layout: camera_layout,
      entries: [
        { binding: 0, resource: { buffer: this.camera_buffer } },
        { binding: 1, resource: this.shadow_view },
        { binding: 2, resource: this.shadow_sampler },
      ],
    });
    this.shadow_camera_buffer = device.createBuffer({
      size: WGSL_CAMERA_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // The shadow pass's own layout: uniform only. It must not carry the
    // shadow-map bindings, or the depth pass writes and samples one texture.
    this.shadow_uniform_layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
    });
    this.shadow_camera_group = device.createBindGroup({
      layout: this.shadow_uniform_layout,
      entries: [{ binding: 0, resource: { buffer: this.shadow_camera_buffer } }],
    });
    this.depth_pipeline = device.createPipelineLayout({
      bindGroupLayouts: [this.shadow_uniform_layout],
    });
    this.dummy_params = device.createBuffer({ size: WGSL_CAMERA_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // The no-texture pair: a 1x1 white sample, so albedo texture multiplies neutral.
    this.dummy_texture = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: this.dummy_texture }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.dummy_sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "repeat", addressModeV: "repeat" });
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
      const origin = frame.camera_transform.origin;
      CAM_POS.x = origin.x;
      CAM_POS.y = origin.y;
      CAM_POS.z = origin.z;
    } else {
      this.view_proj.fill(0);
      CAM_POS.x = 0;
      CAM_POS.y = 0;
      CAM_POS.z = 0;
    }
    const shadow = frame.shadow
      ? {
          view_proj: build_shadow_view(light_dir_for(frame), new Vector3(CAM_POS.x, CAM_POS.y, CAM_POS.z), frame.shadow.range, true, this.shadow_proj),
          bias: frame.shadow.bias,
        }
      : null;
    fill_camera(CAMERA_SCRATCH, this.view_proj, light_dir_for(frame), frame.light_color, frame.ambient, frame.fog, CAM_POS, frame.lights, shadow);
    this.device.queue.writeBuffer(this.camera_buffer, 0, CAMERA_SCRATCH);
    // The shadow pass runs as its own command buffer: a depth texture cannot
    // be written and sampled inside one synchronization scope.
    if (shadow !== null && shadow.view_proj) {
      const encoder = this.device.createCommandEncoder();
      // The light's camera block: only the view_proj matters to the vertex stage.
      SHADOW_CAMERA_SCRATCH.fill(0);
      SHADOW_CAMERA_SCRATCH.set(shadow.view_proj, 0);
      this.device.queue.writeBuffer(this.shadow_camera_buffer, 0, SHADOW_CAMERA_SCRATCH);
      const shadow_pass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadow_view,
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      shadow_pass.setPipeline(this.shadow_pipeline());
      shadow_pass.setBindGroup(0, this.shadow_camera_group);
      for (const draw of frame.draws) {
        if (draw.transparency > 0) {
          continue;
        }
        const uploaded = this.mesh_for(draw.mesh);
        shadow_pass.setVertexBuffer(0, uploaded.vertex);
        shadow_pass.setIndexBuffer(uploaded.indices, "uint32");
        shadow_pass.drawIndexed(uploaded.count);
      }
      shadow_pass.end();
      this.device.queue.submit([encoder.finish()]);
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: frame.background.r, g: frame.background.g, b: frame.background.b, a: frame.background.a },
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
      const transparent = draw.transparency > 0;
      const uploaded = this.mesh_for(draw.mesh);
      fill_draw(DRAW_SCRATCH, draw.transform, draw.normal_matrix, material, draw.transparency, uploaded.has_tangents);
      const draw_buffer = this.draw_uniform(slot);
      this.device.queue.writeBuffer(draw_buffer, 0, DRAW_SCRATCH);
      const group = this.draw_bind_group(slot, material);
      if (material instanceof ShaderMaterial) {
        this.device.queue.writeBuffer(this.params_buffer(material), 0, this.param_scratch(material));
      }
      pass.setPipeline(this.pipeline_for(material, transparent));
      pass.setBindGroup(0, this.camera_group);
      pass.setBindGroup(1, group);
      pass.setVertexBuffer(0, uploaded.vertex);
      pass.setIndexBuffer(uploaded.indices, "uint32");
      pass.drawIndexed(uploaded.count);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** The depth-only pipeline: same vertex stage, empty fragment, back-face cull off for bias safety. */
  private shadow_pipeline(): GPURenderPipeline {
    let pipeline = this.shadow_pipelines.get("shadow");
    if (pipeline === undefined) {
      const shadow_module = this.device.createShaderModule({ code: SHADOW_MODULE });
      pipeline = this.device.createRenderPipeline({
        layout: this.depth_pipeline,
        vertex: { module: shadow_module, entryPoint: "vs_shadow", buffers: [VERTEX_LAYOUT] },
        fragment: { module: shadow_module, entryPoint: "fs_shadow", targets: [] },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
      });
      this.shadow_pipelines.set("shadow", pipeline);
    }
    return pipeline;
  }

  private pipeline_for(material: Material, transparent: boolean): GPURenderPipeline {
    const shader = material instanceof ShaderMaterial ? material.shader : LIT_SHADER;
    const key = transparent ? `${id_of(material)}:blend` : `${id_of(material)}:opaque`;
    let pipeline = this.pipelines.get(key);
    if (pipeline === undefined) {
      const module = this.device.createShaderModule({ code: shader.webgpu });
      pipeline = this.device.createRenderPipeline({
        layout: this.pipeline_layout,
        vertex: { module, entryPoint: "vs", buffers: [VERTEX_LAYOUT] },
        fragment: {
          module,
          entryPoint: "fs",
          // The preferred surface format, read at configure time.
          targets: [{
            format: navigator.gpu.getPreferredCanvasFormat(),
            // Transparent draws blend; opaque target keeps a solid alpha.
            blend: transparent ? BLEND_ALPHA : undefined,
          }],
        },
        primitive: { topology: "triangle-list", cullMode: "back" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: !transparent, depthCompare: "less" },
      });
      this.pipelines.set(key, pipeline);
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
    const pair = map_pair_of(material);
    const albedo = this.texture_pair(pair.albedo);
    const normal = this.texture_pair(pair.normal);
    const roughness = this.texture_pair(pair.roughness);
    const metallic = this.texture_pair(pair.metallic);
    const emission = this.texture_pair(pair.emission);
    // The Shader's texture params: the material's set_shader_parameter values,
    // dummy-filled to the full four the layout carries.
    const shader_textures = (material instanceof ShaderMaterial
      ? material.shader.texture_params
      : []
    ).map((name) => {
      const value = material instanceof ShaderMaterial ? material.get_shader_parameter(name) : null;
      return this.texture_pair(value instanceof Texture2D ? value : null);
    });
    while (shader_textures.length < 4) {
      shader_textures.push(this.texture_pair(null));
    }
    const key = `${slot}:${id_of(material)}:${albedo.id}:${normal.id}:${roughness.id}:${metallic.id}:${emission.id}:${shader_textures.map((pair_id) => pair_id.id).join("·")}`;
    let group = this.bind_groups.get(key);
    if (group === undefined) {
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: this.draw_uniform(slot) } },
        { binding: 1, resource: { buffer: params } },
        { binding: 2, resource: albedo.view },
        { binding: 3, resource: albedo.sampler },
        { binding: 4, resource: normal.view },
        { binding: 5, resource: normal.sampler },
        { binding: 6, resource: roughness.view },
        { binding: 7, resource: roughness.sampler },
        { binding: 8, resource: metallic.view },
        { binding: 9, resource: metallic.sampler },
        { binding: 10, resource: emission.view },
        { binding: 11, resource: emission.sampler },
      ];
      shader_textures.forEach((tex, i) => {
        entries.push({ binding: 12 + i * 2, resource: tex.view }, { binding: 13 + i * 2, resource: tex.sampler });
      });
      group = this.device.createBindGroup({ layout: this.draw_layout, entries });
      this.bind_groups.set(key, group);
    }
    return group;
  }

  /** Uploads (once) any texture map; no texture means the white 1x1 dummy. */
  private texture_pair(texture: Texture2D | null): { view: GPUTextureView; sampler: GPUSampler; id: number } {
    if (texture === null) {
      return { view: this.dummy_texture.createView(), sampler: this.dummy_sampler, id: 0 };
    }
    let pair = this.textures.get(texture);
    if (pair === undefined) {
      const gpu_texture = this.device.createTexture({
        size: [texture.width, texture.height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: texture.image as unknown as HTMLVideoElement },
        { texture: gpu_texture },
        [texture.width, texture.height],
      );
      const sampler = this.device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "repeat", addressModeV: "repeat" });
      pair = { texture: gpu_texture, sampler };
      this.textures.set(texture, pair);
    }
    return { view: pair.texture.createView(), sampler: pair.sampler, id: this.texture_id(texture) };
  }

  private readonly texture_ids = new Map<Texture2D, number>();
  private texture_id(texture: Texture2D): number {
    let id = this.texture_ids.get(texture);
    if (id === undefined) {
      id = this.texture_ids.size + 1;
      this.texture_ids.set(texture, id);
    }
    return id;
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
    this.shadow_camera_buffer.destroy();
    this.shadow_texture.destroy();
    this.dummy_params.destroy();
  }

  private mesh_for(mesh: Mesh): UploadedMesh {
    const cached = this.meshes.get(mesh);
    if (cached) {
      return cached;
    }
    const surface = mesh.surface_get_arrays(0);
    const { count, normals, colors, uvs, tangents, has_tangents } = surface_attribs(surface);
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
          uvs[i * 2],
          uvs[i * 2 + 1],
          tangents[i * 4],
          tangents[i * 4 + 1],
          tangents[i * 4 + 2],
          tangents[i * 4 + 3],
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

    const uploaded = { vertex, indices, count: surface.indices.length, has_tangents };
    this.meshes.set(mesh, uploaded);
    return uploaded;
  }
}
