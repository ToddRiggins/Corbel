import { Color } from "../math/color.js";
import { Node } from "./node.js";

/**
 * Godot 4 `Environment.FogMode`: exponential falls off with the density
 * squared times the view distance squared; depth fades in over the near/far
 * band, shaped by `curve`.
 */
export const FogMode = {
  EXPONENTIAL: 0,
  DEPTH: 1,
} as const;

export type FogMode = number;

/** Godot 4 Environment, foundation subset: background, ambient, and fog. */
export class Environment {
  /** Godot 4 `BackgroundMode`, foundation subset: a plain color. */
  static BG_COLOR = 0;

  /** Godot 4 `background_mode` BG_COLOR / `background_color`: the canvas clear color. */
  background_color: Color = new Color(0.16, 0.16, 0.18, 1.0);
  /** Godot 4 `ambient_light_color`: the floor light every surface gets. */
  ambient: Color = new Color(0.3, 0.3, 0.3, 1.0);

  /** Godot 4 `fog_enabled`. */
  fog_enabled = false;
  /** Godot 4 `fog_mode`, exponential by default like Godot. */
  fog_mode: FogMode = FogMode.EXPONENTIAL;
  /** Godot 4 `fog_light_color`. */
  fog_light_color: Color = new Color(1, 1, 1, 1);
  /** Godot 4 `fog_density`: exponential mode thickness. */
  fog_density = 0.01;
  /** Godot 4 `fog_depth_begin`: depth mode fade-in start, world units. */
  fog_depth_begin = 0;
  /** Godot 4 `fog_depth_end`: full fog at this distance. */
  fog_depth_end = 100;
  /** Godot 4 `fog_depth_curve`: exponent on the depth-mode fade. */
  fog_depth_curve = 1;
  /** Godot 4 `fog_height`: world height the height fog centers on. */
  fog_height = 0;
  /** Godot 4 `fog_height_density`: how fast fog thins above `fog_height`. */
  fog_height_density = 1;

  static from_data(data: {
    background_color?: string;
    ambient?: string;
    fog_enabled?: boolean;
    fog_mode?: number;
    fog_light_color?: string;
    fog_density?: number;
    fog_depth_begin?: number;
    fog_depth_end?: number;
    fog_depth_curve?: number;
    fog_height?: number;
    fog_height_density?: number;
  }): Environment {
    const env = new Environment();
    if (typeof data.background_color === "string") {
      env.background_color = Color.html(data.background_color);
    }
    if (typeof data.ambient === "string") {
      env.ambient = Color.html(data.ambient);
    }
    if (data.fog_enabled !== undefined) {
      env.fog_enabled = data.fog_enabled;
    }
    if (data.fog_mode !== undefined) {
      env.fog_mode = data.fog_mode;
    }
    if (typeof data.fog_light_color === "string") {
      env.fog_light_color = Color.html(data.fog_light_color);
    }
    if (data.fog_density !== undefined) {
      env.fog_density = data.fog_density;
    }
    if (data.fog_depth_begin !== undefined) {
      env.fog_depth_begin = data.fog_depth_begin;
    }
    if (data.fog_depth_end !== undefined) {
      env.fog_depth_end = data.fog_depth_end;
    }
    if (data.fog_depth_curve !== undefined) {
      env.fog_depth_curve = data.fog_depth_curve;
    }
    if (data.fog_height !== undefined) {
      env.fog_height = data.fog_height;
    }
    if (data.fog_height_density !== undefined) {
      env.fog_height_density = data.fog_height_density;
    }
    return env;
  }
}

/**
 * Godot 4 WorldEnvironment: overrides the tree's default background, ambient,
 * and fog with its Environment. The renderer picks the first WorldEnvironment
 * in the tree.
 */
export class WorldEnvironment extends Node {
  environment: Environment = new Environment();
}
