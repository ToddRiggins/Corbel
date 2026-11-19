# Corbel

Corbel is an HTML5 creation engine. Games run on it. VoxiTect will run on it.

The API follows Godot 4 names. The code is TypeScript. Rendering will prefer WebGPU and fall back to WebGL2. React is for UI, not for the scene tree.

Open [tutorial.html](tutorial.html) for how to use what exists today. Open [history.html](history.html) for what has been done. The build order is in [FOUNDATION.md](FOUNDATION.md).

```bash
npm test
```

Slice 1 is the math in `@corbel/core`. Nodes, drawing, and voxels are not in yet.

This project is not affiliated with the Godot Foundation. Godot is a trademark of the Godot Foundation.

## License

MIT. See [LICENSE](LICENSE).
