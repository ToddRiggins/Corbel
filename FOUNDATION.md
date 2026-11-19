# Corbel foundation

Corbel is an HTML5 creation engine for games and for a future VoxiTect. The name is the stone that sticks out of a wall and carries what gets built on top of it. VoxiTect runs on Corbel. Games run on Corbel. The public API follows Godot 4 names so a script can move between GDScript and TypeScript with small edits. The first version is a scene tree, a WebGPU renderer with a WebGL2 fallback, and voxel picking. React draws the UI. React does not own the scene.

The public name is Corbel. It does not say Godot, and it does not end in JS. GodotJS is already a different project, TypeScript inside Godot 4, at https://godotjs.github.io/. Packages are `@corbel/core` and `@corbel/react`.

This is our engine. It is not the Godot editor running in the browser, and it is not a PixiJS project. Godot and PixiJS are MIT, so their docs and source are the guides for names and for techniques. We reimplement. We do not start by pasting either codebase in. If a later file is taken from either project, that file keeps its copyright header and the MIT license. The Godot name is also a trademark. The site copy should say this project is not affiliated with the Godot Foundation.

The live editor we are matching for language and, later, for behavior is `C:\Users\exode\Desktop\ExoDev Website\apps\voxitect`: TypeScript 5.8, React 19, Vite 6. The retired copy on the Desktop is not the source of truth.

## What the first version is

A package you mount on a page. Code creates nodes, adds them to a tree, and the tree draws into a canvas. A voxel node stores cells, builds a mesh, and returns the cell under the cursor the same way the editor does today.

In scope for the foundation:

- Godot 4 math types and the scene-tree lifecycle.
- `Camera3D`, one lit mesh, one light.
- WebGPU when the browser has it, WebGL2 otherwise.
- `VoxelInstance3D` with face-culled meshes and a ray hit that names the solid cell and the empty cell in front of that face.
- A React canvas host and a React panel that can read the running tree.
- Tests for math, tree order, and voxel hits.

Out of scope until the foundation is running:

- A second editor, physics, particles, navigation, GDScript, the Godot inspector, glTF, 2D sprites, animation curves, and multiplayer.
- Replacing `apps/voxitect` on exodev.com. That happens only after this engine can place and erase a voxel.

## Languages

| Layer | Language | Same as the editor |
| --- | --- | --- |
| Engine, math, scene tree, voxels, renderer | TypeScript | Yes |
| UI panels, site page, HUD | TSX, React 19 | Yes |
| Page and styling | HTML, CSS | Yes |
| Bundler and dev server | Vite | Yes |
| GPU programs | WGSL, plus a GLSL twin for WebGL2 | New, and only inside the renderer |

TypeScript is what we edit. The browser runs the JavaScript Vite emits. That is the same split PixiJS uses: TypeScript source, JavaScript in the package, `.d.ts` for the editor. The PixiJS docs look like JavaScript because the examples omit types. Those lines are valid in both languages.

Public names stay on Godot's snake_case. `add_child`, `queue_free`, `global_position`, `_ready`, `_process`. A `Vector3` has `.x`, `.y`, `.z`, `length()`, `normalized()`, `dot()`, `cross()`, and `lerp()`. Constants match Godot 4: `Vector3.FORWARD` is `(0, -0, -1)`, `Vector3.UP` is `(0, 1, 0)`, `Vector3.RIGHT` is `(1, 0, 0)`. The world is Y-up and right-handed. A camera looks down -Z. A character authored to face the camera looks toward +Z. This matches VoxStructa.

CamelCase wrappers are a later convenience. They are not the API we port against.

## How a script lines up with Godot

```gdscript
extends Node3D

@export var speed := 2.0
signal cell_changed(cell: Vector3i)

func _ready() -> void:
    var mesh := $Body as MeshInstance3D
    cell_changed.connect(_on_cell_changed)

func _process(delta: float) -> void:
    position.x += speed * delta
```

```ts
export class Player extends Node3D {
  @export speed = 2.0;
  readonly cell_changed = signal<[Vector3i]>();

  override _ready(): void {
    const mesh = this.get_node("Body") as MeshInstance3D;
    this.cell_changed.connect(this._on_cell_changed);
  }

  override _process(delta: number): void {
    this.position.x += this.speed * delta;
  }
}
```

`extends` becomes a class. `@export` and `signal` are decorators and helpers we write, with those names. `$Body` becomes `get_node("Body")`. `delta` stays in seconds. Node paths, groups, and `queue_free()` keep their Godot meaning.

Intentional differences, written down so ports do not guess:

- No GDScript VM, no `class_name` registry, no typed arrays. A script is a TypeScript class.
- Signals are typed tuples, not strings looked up at runtime.
- The first UI is React, not `Control`, `Button`, or `Label`. Those nodes can exist later for games that want Godot-style UI in the same tree.
- Resources are classes you `new`. There is no `.tres` loader in the foundation.
- `Callable`, `Variant`, and `Dictionary` are not universal containers. Methods take real TypeScript types.

## Scene tree

The tree is the source of truth. A node has a name, a parent, children, an owner, and groups. The tree calls lifecycle methods in Godot's order.

| Callback | When |
| --- | --- |
| `_enter_tree()` | The node just became parented inside the live tree |
| `_ready()` | The node and its children have entered the tree. Parents run after children |
| `_process(delta)` | Once per frame, in tree order, when processing is on |
| `_physics_process(delta)` | Reserved. The foundation calls it on a fixed step only after a game needs it |
| `_exit_tree()` | The node is leaving the live tree |
| `_input(event)` | A pointer or key event, before the viewport uses it for picking |

Core types for the first package:

- `Object`, `Node`, `Node3D`
- `Viewport`, `Camera3D`
- `Mesh`, `ArrayMesh`, `MeshInstance3D`, `GeometryInstance3D`
- `Material`, `StandardMaterial3D` with albedo, roughness, and metallic only
- `DirectionalLight3D`, `WorldEnvironment` as a clear color and one ambient color
- `Resource`, `PackedScene` as an in-memory scene you can `instantiate()`
- `InputEvent`, `InputEventMouseButton`, `InputEventMouseMotion`, `InputEventKey`

`add_child`, `remove_child`, `get_child`, `get_node`, `get_node_or_null`, `find_child`, `add_to_group`, `is_in_group`, `queue_free`, `is_inside_tree`, `to_local`, `to_global`, and `look_at` behave like Godot 4. `rotation` is radians. `rotation_degrees` is the degree view of the same value.

`PackedScene` in the foundation is a function that builds nodes. Saving that scene to a file comes after the tree is stable. A later `.tscn` reader is how a Godot scene would enter this engine. We do not block the first voxel on a scene-file parser.

## Renderer

One scene tree, two backends. Startup follows the PixiJS rule: ask for WebGPU, and use WebGL2 when WebGPU is missing or the device cannot run the shaders.

```ts
const tree = new SceneTree();
await tree.init({
  canvas,
  preference: "webgpu", // "webgpu" | "webgl2"
});
```

`SceneTree.init` picks the backend. Game and editor code never import WebGPU or WebGL types. They set `Camera3D.current`, add a `MeshInstance3D`, and set `material_override`.

The backend interface stays small:

- Create a buffer, a texture, and a pipeline.
- Upload a mesh (`positions`, `normals`, `colors`, `indices`).
- Draw that mesh with a transform, a material, and the current camera.
- Resize with the canvas.

The first shaders are written twice, once in WGSL and once in GLSL. Two materials are enough: vertex-color unlit for voxels, and one directional lit material for a normal mesh. A shader compiler is a later project. Each new material adds both programs in the same change so a machine on WebGL2 does not silently drop the effect.

What this buys us, given the editor we already measured: WebGPU is the default for new games, where many objects and later effects can use it. The voxel editor's heavy work is still on the CPU (rebuild the exposed faces, then pick a cell). The fallback exists so a game and the future editor still open on a browser that has WebGL2 only. Three.js stays inside the current VoxiTect app until this canvas can replace it. Wrapping Three.js as the permanent backend would make this a scene-tree costume on someone else's engine.

`RenderingServer` is the Godot name for the low-level draw list. We can use that name for the backend boundary when the interface settles. We do not clone Godot's server in the foundation.

## Voxels

This is the feature PixiJS does not have, and the one the next editor needs. Godot's `GridMap` is a tile map of meshes. Our node is a solid grid of cells, closer to the VoxiTect volume than to `GridMap`.

`VoxelData extends Resource` stores the volume. `get_voxel(Vector3i)` and `set_voxel(Vector3i, value)` are the whole API. A cell value is a palette index. `0` is empty. The storage can start as a map keyed by packed `x,y,z`, which is what `apps/voxitect` uses, and change to a denser buffer later without changing callers.

`VoxelInstance3D extends GeometryInstance3D` watches that resource, builds one mesh of the faces that touch air, and draws it with vertex colors. Hidden-face culling matches `apps/voxitect/utils/geometry.ts`. Greedy meshing, materials per cell, and chunking wait until a volume is too slow as one mesh.

Picking does not stop at "which object." A voxel edit needs the face.

```ts
class VoxelHit {
  position: Vector3;    // point on the face
  normal: Vector3;      // face direction, unit axis
  cell: Vector3i;       // solid cell that was hit
  place_cell: Vector3i; // empty cell on the outside of that face
}
```

`intersect_ray(from, dir)` walks the grid, or raycasts the built mesh and snaps, and fills a `VoxelHit`. Both implementations must pass the same tests. The walk is the one we keep once the volume is large, because a bounding box is too coarse and a triangle test gets slower as the mesh grows.

The editor rule, preserved as tests:

- Draw and box use `place_cell`, the empty cell half a step along the normal.
- Erase, paint, and extrude use `cell`, the solid cell half a step against the normal.
- A miss on the volume is not a failed tool. The viewport can still hit a `Plane` (ground or a construction plane) and build a cell from that point and normal.

`Camera3D.project_ray_origin` and `project_ray_normal` produce `from` and `dir`. That is the Godot camera API, and it is the input to voxel picking.

Later voxel ideas plug into `VoxelData` and `VoxelInstance3D`. They should not grow a second volume type. Chunks, LOD, ambient occlusion, and extra channels (material, bone id) are new fields and new meshers behind the same `get_voxel` and `intersect_ray`.

## What React is for

React 19 renders HTML. The engine renders the canvas. A ref holds the `SceneTree`. Panels read it and call Godot-style methods. They do not keep a second copy of the tree in `useState`.

Use React for:

- The site page that hosts the canvas, including the future exodev.com route, login gate, and layout. The current editor already lives in a React app.
- Editor chrome: toolbars, palette, layers, the manual, dialogs, and the status bar.
- A scene dock that lists `get_child()` results and selects a node.
- An inspector that edits `@export` fields and known properties (`position`, `rotation_degrees`, `visible`) and calls the setter on the live node.
- Game menus and HUDs when the content is text, buttons, and layout. HTML is a good fit there. A health bar does not need a `Control` node.
- Devtools: the node under the pointer, the renderer name (`webgpu` or `webgl2`), and the hit cell.

Use React once, at mount, if a JSX helper makes a scene easier to read. The helper calls `add_child` and then gets out of the way. The next frame is the tree's `_process`, not a React render.

Leave these out of React:

- Per-frame motion, skinning, and voxel mesh uploads.
- Treating nodes as React children that reconcile every edit. That is the model of React Three Fiber, and it fights `add_child`, `queue_free`, and `_ready`.
- CSS as the styling system for the 3D view. The canvas is the view.

`@corbel/react` exports three things in the foundation:

- `<EngineView preference="webgpu" onReady={tree => ...} />` creates the canvas and the tree.
- `useSceneTree()` returns that tree to a panel.
- `useSelection()` returns the node the dock selected.

A game can ignore the package and talk to `SceneTree` from `main.ts`. The editor uses both.

## Repository

```
Corbel/
  FOUNDATION.md
  package.json              workspace root
  packages/
    core/                   @corbel/core
      src/math/
      src/scene/            Node, Node3D, Viewport, Camera3D
      src/render/           backend interface, webgpu, webgl2
      src/voxel/            VoxelData, VoxelInstance3D, intersect_ray
      test/
    react/                  @corbel/react
      src/EngineView.tsx
  apps/
    sandbox/                Vite app, one canvas, one React panel
```

`packages/core` has no React dependency. `apps/sandbox` depends on React, Vite, and both packages. TypeScript is strict. Decorators are on, matching the editor's `experimentalDecorators` setting. Tests run in Vitest with no GPU: math, signal order, `_ready` order, and voxel hits.

License file for the repo is MIT, same as Godot and PixiJS.

## Build order

Each slice ends with something we can run or test. We do not start the next slice in the same change.

1. **Math and names.** Done. `@corbel/core` has `Vector2`, `Vector3`, `Vector3i`, `Quaternion`, `Basis`, `Transform3D`, `Plane`, `AABB`, and `Color`. Tests cover `FORWARD` and a `looking_at` that faces +Z toward the camera. How to call it is in `tutorial.html`.
2. **Tree.** `Node`, `Node3D`, signals, groups, `_enter_tree`, `_ready`, `_process`, `queue_free`. A headless test builds a parent and a child and checks that the child is ready first.
3. **Canvas.** `SceneTree.init` with `preference: "webgpu"`. A `MeshInstance3D` cube and a `Camera3D` draw on both backends. The sandbox shows which backend started.
4. **Picking.** `project_ray_origin` and `project_ray_normal`. `VoxelData` plus `intersect_ray`. Tests cover a single cube, a stack, a miss, draw's `place_cell`, and erase's `cell`. The sandbox panel prints the cell under the pointer.
5. **Edit.** `set_voxel` rebuilds the exposed faces and the next pick sees the new cell. This is the smallest loop the future editor needs.
6. **React shell.** `EngineView`, a scene dock, and an inspector for `position` and `visible`. The dock lists real nodes from the tree.

After slice 6, the foundation is done. Growth from there, in order, when we ask for it:

- More than one voxel object, a palette resource, and a ground plane node.
- `StandardMaterial3D` lighting and a shadow map.
- `AnimationPlayer` with rotation keys, because the editor's clips are bone rotations.
- `PackedScene` saved as JSON that mirrors a small `.tscn`.
- A game sandbox that is only `core`: move, place, erase.
- Port the VoxiTect tools onto these nodes, then deploy that app the way `apps/voxitect` deploys today.

## Rules that keep the port easy

- New public methods use Godot 4 names or they do not land.
- A behavior we claim is Godot-compatible gets one test with the Godot result.
- Renderer code stays behind the backend. Voxel code stays in `src/voxel`. React stays in `@corbel/react`.
- One volume API. Later voxel ideas extend `VoxelData` and `VoxelHit`.
- The current VoxiTect app keeps shipping from `ExoDev Website` until slice 5 is real and we choose to switch it.
