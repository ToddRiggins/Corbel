import type { SceneTree } from "../scene/scene_tree.js";
import { WebGL2RenderBackend } from "./webgl_backend.js";
import { build_render_frame, type RenderBackend } from "./frame.js";
import { WebGPURenderBackend } from "./webgpu_backend.js";

export type BackendPreference = "webgpu" | "webgl2";

/**
 * Picks a backend once and renders the tree into the canvas each frame.
 * WebGPU first, WebGL2 when the device has no WebGPU or the adapter fails.
 */
export class Renderer {
  private constructor(
    private readonly backend: RenderBackend,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  static async create(
    canvas: HTMLCanvasElement,
    preference: BackendPreference = "webgpu",
  ): Promise<Renderer> {
    if (preference === "webgpu") {
      try {
        return new Renderer(await WebGPURenderBackend.create(canvas), canvas);
      } catch (error) {
        console.warn("Corbel: WebGPU unavailable, falling back to WebGL2.", error);
      }
    }
    return new Renderer(WebGL2RenderBackend.create(canvas), canvas);
  }

  get name(): "webgpu" | "webgl2" {
    return this.backend.name;
  }

  render_tree(tree: SceneTree): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.backend.render(build_render_frame(tree, this.canvas.width, this.canvas.height));
  }

  dispose(): void {
    this.backend.dispose();
  }
}
