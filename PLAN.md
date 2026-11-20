# Corbel plan — full engine foundation, Godot-4 style

> **Continuation state (keep updated):** P1 DONE; P2 DONE (slice 1 textures; slice 2 `.cmaterial` files + Environment/WorldEnvironment; slice 3 normal/roughness/metallic maps, normal mapping, transparency, Environment fog, Godot-shaped Mesh/ArrayMesh/MeshInstance3D APIs; slice 4 emission, texture alpha, SurfaceTool trio, script-editor globals; tails — ShaderMaterial textures via set_shader_parameter, full `.cmaterial` field set in load(), `.cmaterial` editing in the Inspector). P3: slice 1 DONE — OmniLight3D and SpotLight3D (range/energy/attenuation, spot angle/edge), the frame's light list (directional + omni/spot, cap 8, tree order), both backends summing the list with Godot's quadratic falloff and cosine cone; slice 2 DONE — directional shadow maps (DirectionalLight3D.shadow_enabled/shadow_range/shadow_bias, depth pass + PCF in WGSL and WebGL2, ortho view_proj about the camera). Slice 3 DONE — the mesh family (PlaneMesh, SphereMesh, CylinderMesh with a top_radius-0 cone, CapsuleMesh, TorusMesh, PrismMesh — all PrimitiveMesh subclasses with Godot-style constructors) and Camera3D.projection (Projection.ORTHOGONAL, size = the ortho view height). Next in P3: **omni/spot shadows if cost enables them, or P4 UI** — then P5 audio, P6 animation, P7 debug/deploy. Example scenes for lights, shadows, materials, and the ortho camera live in the demo project (projects/demo/examples — open the .cscene in the editor Filesystem, Play runs them). Docs live in docs/ with per-class "Not yet built" lists. Voxel picking parked until P7 is done.

Corbel grows past the foundation slices toward feature parity with Godot 4 (3D scope only, no 2D). Names, semantics, and scripts keep Godot 4 meanings so code ports between GDScript and TypeScript with small edits. 2D (sprites, TileMap, CanvasItem 2D rendering, 2D physics) is out of scope until a later decision. Voxel picking (`VoxelData`, `intersect_ray`) is parked until this plan is done.

## Where we are (done)

| Area | Status |
| --- | --- |
| Math, scene tree, lifecycle, signals, groups, node paths | Done |
| Renderer: WebGPU + WebGL2, Shader.lit twin programs, StandardMaterial3D, ShaderMaterial | Done |
| SurfaceTool, BoxMesh/ArrayMesh, DirectionalLight3D, Camera3D | Done |
| Input: Key events, InputMap, actions, physical/layout, modifier binds, input lock | Done |
| ProjectSettings, Dictionary, key binds dialog | Done |
| Runtime runner + game window, Play/Stop | Done |
| Editor: docks, inspector, script editor, Output, documentation | Done |

## The gap, Godot term by term

- **Scripting:** no Globals/Autoload, no `class_name` registry, no Timer, no `change_scene`, no PackedScene runtime loading, no Tween, no AnimationPlayer.
- **Resources:** scripts load through Vite only; no `load("res://…")` for meshes, textures, materials, audio, or scenes.
- **Rendering:** no textures, no omni/spot lights or shadows, no sky/environment, no post processing.
- **Audio:** nothing at all.
- **UI:** nothing at all (Control nodes, anchoring, Theme/StyleBox).
- **Node API:** no `look_at`, `rotate_x/y/z`, `translate`, `global_position`, `process_mode` pause semantics, `get_tree()` conveniences.
- **Editor:** no autoload/globals view, no resource browser, no remote debugger of the running game window.

## Phases

### P1 — Scripting backbone (autoload, class registry, timers, scenes)
1. **Done.** **class_name registry.** Every project script's default export class registers in a shared registry (`node_registry.ts`, pinned on `globalThis` across page realms); `create_node("Custom")` builds custom node types, the editor Add menu lists them, and scenes keep the type on save. Verified: the game window's tree holds registered classes.
2. **Done.** **Globals / Autoload.** `project.corbel.json` gains `autoload: { "Score": "res://score.ts" }`; the runner instantiates each under `/root/<Name>` before the main scene, access via `get_node("/root/Score")`; the editor manages the list under Project → Globals — Autoload….
3. **Done.** **Timer + SceneTree conveniences.** `Timer` node (`wait_time`, `one_shot`, `autostart`, `start`/`stop`/`get_time_left`, `timeout` signal, pause-aware), `process_mode` with the full pause matrix resolved by the tree walk, `Node.get_tree()`, awaitable Signals (`await timer.timeout`), `SceneTree.create_timer(sec, process_always)` + `SceneTreeTimer`, and `current_scene` / `change_scene_to_node` / `change_scene_to_file` (the runtime installs a `.cscene` loader).
4. **Done.** **PackedScene runtime.** `PackedScene.pack/instantiate` (`from_node`/`from_data`/`instantiate`), a shared `ResourceLoader` with `load("res://…")` over the project API (`.cscene` → PackedScene, `.ts` → script class, custom extension handlers, path cache, `globalThis`-pinned across realms), and `change_scene_to_packed`. The runner registers itself as `current_scene` at boot, so a `change_scene` frees the old level and weaves its scripts; autoloads persist through the swap. Verified in the game window: L (the `next_scene` bind) swaps `Main` → `Level2` with Score surviving.

**Exit:** a demo project with an autoload music manager, a UI-lite HUD (see P4), change_scene between two levels, instanced sub-scenes.

### P2 — Resources and assets
1. **Resource loading** (`ResourceLoader`): `load("res://…")` resolves what the project offers by extension: `.cscene` → PackedScene, `.png/.jpg` → texture, `.wav` → AudioStream, `.ts` → script class. Loading is async under the hood, awaited in scripts (`await load(...)`).
2. **Textures.** `Texture2D` from project image files (browser decode), sampler objects in WebGPU/WebGL2, `StandardMaterial3D.albedo_texture`, `normal_texture`, `roughness/metallic` textures; `ShaderMaterial` gets a `set_texture_parameter`.
3. **Materials as data.** `.cmaterial` JSON files (like `.tres`): load materials by path, edit in the Inspector.
4. **Environment.** `WorldEnvironment` with background color/sky color, ambient colors, fog color+density — small wins, big look.

**Exit:** demo loads textures, a material file, and instances scenes purely through `load("res://…")`.

### P3 — Lights, shadows, more meshes
1. `OmniLight3D`, `SpotLight3D` (range, attenuation, cone), light lists in the frame (not just the first light).
2. **Shadow mapping** for directional first (depth texture, PCF bias), then omni/spot cube shadows if cost allows.
3. Built-in meshes Godot has: `CylinderMesh`, `SphereMesh`, `PlaneMesh`, `PrismMesh`, `CapsuleMesh`, `TorusMesh` via the same arrays code as BoxMesh.
4. Camera projection modes: orthographic support.

**Exit:** demo with several lit + shadowed meshes, a spotlight sweeping.

### P4 — UI (Control nodes) + Theme
**Decided:** Control node classes are mirrored into a **React DOM overlay** (`@corbel/ui`), kept behind a thin Control backend interface so a 2D overlay canvas can be added later. React gives professional-looking GUI: real text layout, fonts, accessible buttons/inputs, and it works identically in the editor preview and the game window. Same Godot API either way:
1. `Control` base: position/size, anchors + `set_anchors_preset` (Godot's LayoutPreset names), offsets, `visible`, z-index, `mouse_filter`, `theme`, focus.
2. First widgets: `Label`, `Button`, `ColorRect`, `ProgressBar`, `TextureRect`, `Panel`, `LineEdit`; containers `VBoxContainer`, `HBoxContainer`, `MarginContainer`, `CenterContainer`.
3. **Theme** resource: font colors/sizes, styleboxes per state (normal/hover/pressed), theme inheritance (`add_theme_color_override`, `add_theme_stylebox_override`), a default theme file in the project, editor preview panel for the UI tree.

**Exit:** demo HUD (score label, buttons, progress bar) themed, running identically in the editor preview and the game window.

### P5 — Audio
Godot's shape, WebAudio under the hood:
1. **AudioServer**: named buses (Master first), routing to a parent bus, per-bus volume (dB, Godot scale), mute/solo; persisted as the project's bus layout section.
2. **AudioStreamPlayer** node: `stream`, `bus`, `volume_db`, `pitch_scale`, `play(from_position)`, `stop()`, `finished` signal, `autoplay`; later `AudioStreamPlayer3D` with listener position when physics/picking lands.
3. **AudioStream**: `load("res://…")` for **WAV, OGG, and MP3** (WebAudio decode for WAV; small wasm decoder packages for OGG and MP3), `AudioStreamGenerator` for procedural sound.
4. Editor: bus layout view + a simple play/preview on `.wav` files.

**Exit:** demo with a music bus, SFX bus, and a click sound on Button press.

### P6 — Animation and easing
1. `Tween` (create_tween, parallel/sequence, easing types) — small, unlocks most game juice.
2. `AnimationPlayer` with a `.canim` clip format: transform tracks (position/rotation/scale), property tracks, call tracks; editor pane to edit keys with a timeline.
3. Optional later: AnimationTree state machine.

**Exit:** demo with animated doors/camera via AnimationPlayer.

### P7 — Debug channel and deploy
1. **Remote debugger**: the game window posts runtime logs, per-frame stats, and a live scene dump to the editor (Output + a remote scene dock), like Godot's remote inspector read-only first.
2. **Deploy**: `npm run export` builds `apps/game` + runner + core into a static bundle plus project files (VoxiTect-style publish).

### Parked until needed
- Physics (when a voxel app needs collision: `CharacterBody3D`-style AABB/heightmap vs a full engine — decide then).
- glTF/mesh import, particles, navigation, multiplayer, translation, VR.

## Rules kept
- Godot 4 names for new public API or nothing lands; every Godot-compatible claim gets a test with Godot's documented result.
- Renderer code stays behind the backend; UI stays with React unless P4 decides otherwise; audio is browser-native under the API.
- Each phase ends runnable, with the editor able to author it.
