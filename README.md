# Corbel

Corbel is an HTML5 creation engine. Games run on it. VoxiTect will run on it.

The API follows Godot 4 names. The code is TypeScript. Rendering will prefer WebGPU and fall back to WebGL2. React is for UI, not for the scene tree.

Open [tutorial.html](tutorial.html) for how to use what exists today. Open [history.html](history.html) for what has been done. The build order is in [FOUNDATION.md](FOUNDATION.md).

Open the folder in Visual Studio Code. Code files are `.ts`. The file to edit is `packages/try/src/main.ts`.

```bash
npm run check
npm test
npm run try
npm run sandbox
npm run editor
```

`check` lists typos with a file and a line. `test` checks the math and the scene tree. `try` runs `main.ts`. `sandbox` opens the browser sandbox at `http://127.0.0.1:5178/`, where a box turns and the sidebar names the renderer. `editor` opens the browser editor at `http://127.0.0.1:5177/`. `start_editor.bat` does that and opens the page.

Slice 1 is the math in `@corbel/core`. Slice 2 is the scene tree. Slice 3 draws: `npm run sandbox` turns a cube on WebGPU or WebGL2 and names the backend. Voxel picking is not in yet.

This project is not affiliated with the Godot Foundation. Godot is a trademark of the Godot Foundation.

## License

MIT. See [LICENSE](LICENSE).
