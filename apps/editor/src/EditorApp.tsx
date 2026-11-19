import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ScriptEditor, type ScriptEditorHandle } from "./script/ScriptEditor";
import { scriptRoles } from "./script/roles";
import { Player } from "./play";
import {
  Node,
  Node3D,
  SceneTree,
  Vector3,
  create_node,
  node_label,
  pack_scene,
  unpack_scene,
} from "@corbel/core";

interface ProjectFile {
  path: string;
  name: string;
  depth: number;
  dir: boolean;
}

interface Diagnostic {
  line: number;
  column: number;
  message: string;
}

const NODE_TYPES = ["Node", "Node3D", "Camera3D", "MeshInstance3D"];

export function EditorApp() {
  const treeRef = useRef<SceneTree | null>(null);
  if (!treeRef.current) {
    treeRef.current = new SceneTree();
  }
  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) {
    playerRef.current = new Player();
  }
  const runCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const player = playerRef.current;
  const sceneRef = useRef<Node | null>(null);
  const scriptRef = useRef<ScriptEditorHandle | null>(null);

  const [project, setProject] = useState("demo");
  const [projects, setProjects] = useState<string[]>(["demo"]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [scenePath, setScenePath] = useState<string | null>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [tick, setTick] = useState(0);
  const [workspace, setWorkspace] = useState<"3d" | "script">("3d");
  const [playState, setPlayState] = useState<"off" | "starting" | "on" | "paused">("off");
  const [pendingPlay, setPendingPlay] = useState(false);
  const [runRenderer, setRunRenderer] = useState<string | null>(null);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState("");
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [output, setOutput] = useState<string[]>([]);
  const [modal, setModal] = useState<null | "add" | "save" | "script">(null);
  const [savePath, setSavePath] = useState("res://main.cscene");
  const [scriptFile, setScriptFile] = useState("res://Script.ts");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [context, setContext] = useState<{ x: number; y: number; path: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "scene" | "project" | "help">(null);
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem("corbel.scriptFont"));
    return saved >= 12 && saved <= 32 ? saved : 15;
  });
  const [left, setLeft] = useState(280);
  const [right, setRight] = useState(280);
  const [bottom, setBottom] = useState(140);
  const [sceneHeight, setSceneHeight] = useState(280);
  const [dropPath, setDropPath] = useState<string | null>(null);

  const scene = sceneRef.current;
  void tick;

  function log(line: string, kind: "info" | "error" = "info"): void {
    setOutput((prev) => [...prev, kind === "error" ? `ERROR: ${line}` : line].slice(-200));
  }

  function bump(): void {
    setTick((value) => value + 1);
  }

  function replaceScene(next: Node, path: string | null): void {
    const tree = treeRef.current!;
    const previous = sceneRef.current;
    if (previous) {
      tree.get_root().remove_child(previous);
    }
    tree.get_root().add_child(next);
    sceneRef.current = next;
    setScenePath(path);
    setSelected(next);
    setWorkspace("3d");
    bump();
  }

  async function refreshFiles(name = project): Promise<void> {
    const response = await fetch(`/__project/files?project=${encodeURIComponent(name)}`);
    const body = await response.json() as { files?: ProjectFile[]; error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Could not list files.");
    }
    setFiles(body.files ?? []);
  }

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const listed = await fetch("/__project/projects").then(async (response) => {
          const body = await response.json() as { projects?: string[]; error?: string };
          if (!response.ok) {
            throw new Error(body.error ?? "Could not list projects.");
          }
          return body.projects ?? ["demo"];
        });
        if (cancel) {
          return;
        }
        setProjects(listed);
        const name = listed.includes("demo") ? "demo" : listed[0] ?? "demo";
        setProject(name);
        await refreshFiles(name);
        await openMain(name);
      } catch (error) {
        log(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancel = true;
    };
    // Open the demo scene once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!scriptPath?.endsWith(".ts")) {
      setDiags([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetch("/__project/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, path: scriptPath, text: scriptText }),
      })
        .then(async (response) => {
          const body = await response.json() as { diagnostics?: Diagnostic[]; error?: string };
          if (!response.ok) {
            throw new Error(body.error ?? "Check failed.");
          }
          setDiags(body.diagnostics ?? []);
        })
        .catch((error: unknown) => {
          log(error instanceof Error ? error.message : String(error));
        });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [project, scriptPath, scriptText]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (workspace === "script") {
          void saveScript();
        } else {
          void saveSceneDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function openMain(name: string): Promise<void> {
    try {
      const settings = JSON.parse(await readFile(name, "res://project.corbel.json")) as { main_scene?: string };
      if (settings.main_scene) {
        const text = await readFile(name, settings.main_scene);
        if (settings.main_scene.endsWith(".cscene")) {
          replaceScene(unpack_scene(JSON.parse(text)), settings.main_scene);
          log(`Opened ${settings.main_scene}.`);
          return;
        }
      }
    } catch {
      // No project file yet. The file list is enough.
    }
    log(`Opened project ${name}. Choose a .cscene or a .ts file.`);
  }

  async function switchProject(name: string): Promise<void> {
    setProject(name);
    if (sceneRef.current) {
      treeRef.current!.get_root().remove_child(sceneRef.current);
      sceneRef.current = null;
      setSelected(null);
      setScenePath(null);
      bump();
    }
    await refreshFiles(name);
    await openMain(name);
  }

  async function openPath(path: string): Promise<void> {
    const text = await readFile(project, path);
    if (path.endsWith(".cscene")) {
      replaceScene(unpack_scene(JSON.parse(text)), path);
      log(`Opened ${path}.`);
      return;
    }
    if (path.endsWith(".ts")) {
      setScriptPath(path);
      setScriptText(text);
      setWorkspace("script");
      return;
    }
    log(`${path} stays in the project folder. Scenes are .cscene files. Scripts are .ts files.`);
  }

  function newScene(): void {
    const tree = treeRef.current!;
    if (sceneRef.current) {
      tree.get_root().remove_child(sceneRef.current);
    }
    const root = create_node("Node3D");
    root.set_name("Main");
    tree.get_root().add_child(root);
    sceneRef.current = root;
    setScenePath(null);
    setSelected(root);
    setWorkspace("3d");
    bump();
    log("New scene Main. Save writes a .cscene file.");
  }

  function addNode(type: string): void {
    const tree = treeRef.current!;
    if (!sceneRef.current) {
      const root = create_node(type === "Node" ? "Node3D" : type);
      root.set_name("Main");
      tree.get_root().add_child(root);
      sceneRef.current = root;
      setScenePath(null);
      setSelected(root);
      setWorkspace("3d");
      bump();
      log("New scene Main. Save writes a .cscene file.");
      return;
    }
    const parent = selected && contains(sceneRef.current, selected) ? selected : sceneRef.current;
    const node = create_node(type);
    node.set_name(type);
    parent.add_child(node);
    node.owner = sceneRef.current;
    setSelected(node);
    bump();
  }

  function deleteSelected(): void {
    if (selected) {
      removeNode(selected);
    }
  }

  function removeNode(node: Node): void {
    const current = sceneRef.current;
    if (!current) {
      return;
    }
    if (node === current) {
      treeRef.current!.get_root().remove_child(current);
      sceneRef.current = null;
      setScenePath(null);
      setSelected(null);
      bump();
      log("Closed the scene.");
      return;
    }
    node.get_parent()?.remove_child(node);
    setSelected(current);
    bump();
  }

  function reparent(path: string, target: Node): void {
    const current = sceneRef.current;
    if (!current) {
      return;
    }
    const node = path === "." ? current : current.get_node_or_null(path);
    if (!node || node === current || node === target) {
      return;
    }
    try {
      node.reparent(target);
      node.owner = current;
      setSelected(node);
      bump();
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
    }
  }

  async function writeScene(path: string): Promise<void> {
    const current = sceneRef.current;
    if (!current) {
      return;
    }
    const file = { format: 1 as const, ...pack_scene(current) };
    await writeFile(project, path, `${JSON.stringify(file, null, 2)}\n`);
    setScenePath(path);
    await refreshFiles();
    log(`Saved ${path}.`);
  }

  async function saveSceneDefault(): Promise<void> {
    if (!sceneRef.current) {
      return;
    }
    if (scenePath?.endsWith(".cscene")) {
      await writeScene(scenePath);
      return;
    }
    setSavePath("res://main.cscene");
    setModal("save");
  }

  async function saveScript(): Promise<void> {
    if (!scriptPath) {
      return;
    }
    await writeFile(project, scriptPath, scriptText);
    log(`Saved ${scriptPath}.`);
  }

  function jump(line: number): void {
    scriptRef.current?.jump(line);
  }

  /** Play runs the open scene on the canvas. Pressing Play again restarts. */
  function playClicked(): void {
    if (!sceneRef.current) {
      log("Open a .cscene to play.");
      return;
    }
    if (player.running) {
      player.stop();
    }
    setRunRenderer(null);
    setWorkspace("3d");
    setPendingPlay(true);
  }

  function pauseClicked(): void {
    if (!player.running) {
      return;
    }
    player.toggle_pause();
    setPlayState(player.paused ? "paused" : "on");
  }

  function stopClicked(): void {
    player.stop();
    setPlayState("off");
  }

  // Starts the run once the canvas is really on the page.
  useEffect(() => {
    if (!pendingPlay || workspace !== "3d") {
      return;
    }
    const canvas = runCanvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) {
      return;
    }
    setPendingPlay(false);
    setPlayState("starting");
    void (async () => {
      try {
        await player.start(scene, project, canvas, log);
        setRunRenderer(player.renderer_name);
        setPlayState("on");
      } catch (error) {
        log(error instanceof Error ? error.message : String(error), "error");
        setPlayState("off");
      }
    })();
    // The run holds the tree that start built; nothing else joins it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlay, workspace, project]);

  // The canvas only lives in the 3D workspace; leaving it stops the run.
  useEffect(() => {
    if (workspace !== "3d" && player.running) {
      player.stop();
      setPlayState("off");
      log("Stopped: the 3D view closed.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  useEffect(() => {
    localStorage.setItem("corbel.scriptFont", String(fontSize));
  }, [fontSize]);

  const contextNode = context && scene
    ? (context.path === "." ? scene : scene.get_node_or_null(context.path))
    : null;

  function openContext(event: ReactMouseEvent, node: Node): void {
    event.preventDefault();
    event.stopPropagation();
    setSelected(node);
    setContext({ x: event.clientX, y: event.clientY, path: nodePath(sceneRef.current, node) });
  }

  function toggleBranch(node: Node, shut: boolean): void {
    const paths: string[] = [];
    const walk = (current: Node): void => {
      paths.push(nodePath(sceneRef.current, current));
      for (const child of current.get_children()) {
        walk(child);
      }
    };
    walk(node);
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const path of paths) {
        if (shut) {
          next.add(path);
        } else {
          next.delete(path);
        }
      }
      return [...next];
    });
  }

  function commitRename(node: Node, name: string): void {
    setRenaming(null);
    try {
      if (name.trim() && name.trim() !== node.name) {
        node.set_name(name.trim());
      }
      bump();
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
    }
  }

  function detachScript(node: Node): void {
    node.set_meta("script_path", "");
    bump();
    log(`Detached the script from ${node.name}.`);
  }

  async function attachScript(): Promise<void> {
    const node = selected;
    if (!node) {
      return;
    }
    const path = scriptFile.endsWith(".ts") ? scriptFile : `${scriptFile}.ts`;
    if (!path.startsWith("res://")) {
      throw new Error("A script path starts with res://.");
    }
    const type = ["Node", "Node3D", "Camera3D", "MeshInstance3D"].includes(node.get_class())
      ? node.get_class()
      : "Node";
    let text: string;
    try {
      text = await readFile(project, path);
      log(`Attached ${path}.`);
    } catch {
      text = scriptTemplate(classNameFromPath(path), type);
      await writeFile(project, path, text);
      await refreshFiles();
      log(`Created ${path} and attached it.`);
    }
    node.set_meta("script_path", path);
    setScriptPath(path);
    setScriptText(text);
    setWorkspace("script");
    setModal(null);
    bump();
  }

  async function copyNodePath(node: Node): Promise<void> {
    const path = nodePath(sceneRef.current, node);
    const label = path === "." ? node.name : path;
    try {
      await navigator.clipboard.writeText(label);
      log(`Copied ${label}.`);
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
    }
  }

  const scriptNote = !scriptPath?.endsWith(".ts")
    ? ""
    : diags.length === 0
      ? "No errors"
      : `${diags.length} error${diags.length === 1 ? "" : "s"}`;

  return (
    <div className="app" onClick={() => { setMenu(null); setContext(null); }}>
      <header onClick={(event) => event.stopPropagation()}>
        <div className="brand">Corbel</div>
        <div className="menus">
          <Menu
            label="Scene"
            open={menu === "scene"}
            onToggle={() => setMenu(menu === "scene" ? null : "scene")}
            items={[
              ["New 3D Scene", () => { setMenu(null); newScene(); }],
              ["Save", () => { setMenu(null); void saveSceneDefault(); }],
              ["Save As", () => { setMenu(null); setSavePath(scenePath ?? "res://scene.cscene"); setModal("save"); }],
            ]}
          />
          <Menu
            label="Project"
            open={menu === "project"}
            onToggle={() => setMenu(menu === "project" ? null : "project")}
            items={projects.map((name) => [name, () => {
              setMenu(null);
              void switchProject(name);
            }])}
          />
          <Menu
            label="Help"
            open={menu === "help"}
            onToggle={() => setMenu(menu === "help" ? null : "help")}
            items={[
              ["Documentation", () => { setMenu(null); openPage("/documentation.html"); }],
              ["How to use", () => { setMenu(null); openPage("/tutorial.html"); }],
              ["History", () => { setMenu(null); openPage("/history.html"); }],
            ]}
          />
        </div>
        <div className="spaces">
          <button className={workspace === "3d" ? "on" : ""} onClick={() => setWorkspace("3d")}>3D</button>
          <button className={workspace === "script" ? "on" : ""} onClick={() => setWorkspace("script")}>Script</button>
        </div>
        <div className="play-group">
          <button
            className="play"
            disabled={playState === "starting"}
            title={playState === "off" ? "Play runs the open scene on the 3D canvas." : "Play restarts the scene."}
            onClick={playClicked}
          >Play</button>
          <button
            disabled={playState === "off" || playState === "starting"}
            title="Pause skips _process but keeps the last frame on the canvas."
            onClick={pauseClicked}
          >{playState === "paused" ? "Resume" : "Pause"}</button>
          <button className="stop" disabled={playState === "off"} title="Stop ends the run." onClick={stopClicked}>Stop</button>
        </div>
      </header>

      <div
        className="work"
        style={{ ["--left" as string]: `${left}px`, ["--right" as string]: `${right}px`, ["--bottom" as string]: `${bottom}px` }}
      >
        <div className="left">
          <section
            className="dock scene-dock"
            style={{ height: sceneHeight, flex: "none" }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <h2>Scene</h2>
            <div className="tools">
              <button onClick={() => setModal("add")}>Add</button>
              <button onClick={deleteSelected} disabled={!selected}>Delete</button>
            </div>
            <div className="body">
              {scene ? (
                <SceneRows
                  node={scene}
                  depth={0}
                  scene={scene}
                  selected={selected}
                  dropPath={dropPath}
                  collapsed={collapsed}
                  renaming={renaming}
                  onSelect={setSelected}
                  onDrop={reparent}
                  onDragHover={setDropPath}
                  onToggle={(path) => {
                    setCollapsed((prev) => prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]);
                  }}
                  onContext={openContext}
                  onToggleVisible={(node) => {
                    if (node instanceof Node3D) {
                      node.visible = !node.visible;
                      bump();
                    }
                  }}
                  onRename={commitRename}
                  onCancelRename={() => setRenaming(null)}
                />
              ) : (
                <div className="empty">No scene open</div>
              )}
            </div>
            <div className="hint">Right-click a node to attach a script or delete it.</div>
          </section>
          <div
            className="split y"
            onPointerDown={(event) => dragSize(event, sceneHeight, (next) => setSceneHeight(Math.min(640, Math.max(120, next))), false)}
          />
          <section className="dock" style={{ flex: 1 }}>
            <h2>FileSystem</h2>
            <div className="hint">{project}</div>
            <div className="body">
              {files.map((file) => (
                <button
                  key={file.path}
                  className={file.dir ? "file dir" : "file"}
                  style={{ paddingLeft: 8 + file.depth * 14 }}
                  onClick={() => {
                    if (!file.dir) {
                      void openPath(file.path).catch((error: unknown) => {
                        log(error instanceof Error ? error.message : String(error));
                      });
                    }
                  }}
                >
                  <i className={`kind ${kindOf(file)}`} />
                  <span>{file.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <div
          className="split x"
          onPointerDown={(event) => dragSize(event, left, (next) => setLeft(Math.min(520, Math.max(200, next))), false)}
        />
        <div className="center">
          {workspace === "3d" ? (
            <div className="viewport">
              <canvas
                ref={runCanvasRef}
                className={playState === "off" ? "run-canvas idle" : "run-canvas"}
              />
              <div className="run-bar">
                {scene ? (
                  playState === "off" ? (
                    <>
                      <h3>{scene.name}</h3>
                      <p>{countNodes(scene)} nodes. Press Play to run this scene here. Script errors print in Output.</p>
                    </>
                  ) : (
                    <p>
                      {playState === "starting"
                        ? "Building the run..."
                        : `Playing ${scene.name}${playState === "paused" ? " · paused" : ""} · ${runRenderer ?? "starting renderer"}`}
                    </p>
                  )
                ) : (
                  <>
                    <h3>No scene open</h3>
                    <button onClick={newScene}>3D Scene</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="script-view">
              <ScriptEditor
                ref={scriptRef}
                text={scriptText}
                fontSize={fontSize}
                diagnostics={diags}
                onChange={setScriptText}
              />
              <div className="script-bar">
                <span>{scriptPath ?? "No script"}</span>
                <span className="legend">
                  <Legend role="keyword" label="keyword" />
                  <Legend role="control" label="flow" />
                  <Legend role="type" label="type" />
                  <Legend role="functionDef" label="function" />
                  <Legend role="functionCall" label="call" />
                  <Legend role="member" label="member" />
                  <Legend role="variable" label="variable" />
                  <Legend role="string" label="string" />
                  <Legend role="number" label="number" />
                  <Legend role="comment" label="comment" />
                </span>
                <span className="font-size">
                  <button title="Smaller code" onClick={() => setFontSize((size) => Math.max(12, size - 1))}>A−</button>
                  <span>{fontSize}</span>
                  <button title="Larger code" onClick={() => setFontSize((size) => Math.min(32, size + 1))}>A+</button>
                </span>
                <span>{scriptNote}</span>
              </div>
              {diags.length > 0 ? (
                <div className="diags">
                  {diags.map((diagnostic) => (
                    <div
                      key={`${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`}
                      className="diag"
                      onClick={() => jump(diagnostic.line)}
                    >
                      {scriptPath}({diagnostic.line},{diagnostic.column}): {diagnostic.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div
          className="split x"
          onPointerDown={(event) => dragSize(event, right, (next) => setRight(Math.min(520, Math.max(200, next))), true)}
        />
        <div className="right">
          <section className="dock" style={{ flex: 1 }}>
            <h2>Inspector</h2>
            <div className="body">
              {selected ? (
                <Inspector
                  key={`${nodePath(scene, selected)}:${tick}`}
                  node={selected}
                  onChange={bump}
                  onError={log}
                />
              ) : (
                <div className="empty">Select a node</div>
              )}
            </div>
          </section>
        </div>
        <div
          className="split bottom"
          onPointerDown={(event) => dragSize(event, bottom, (next) => setBottom(Math.min(360, Math.max(72, next))), true)}
        />
        <section className="dock output">
          <h2>Output</h2>
          <div className="body">
            {output.length === 0 ? <div className="empty">No output yet</div> : <pre className="log">{output.join("\n")}</pre>}
          </div>
        </section>
      </div>

      {modal ? (
        <div className="modal" onClick={() => setModal(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            {modal === "script" ? (
              <>
                <h3>Attach script</h3>
                <p className="note">A .ts file is the script that will run on this node.</p>
                <input value={scriptFile} onChange={(event) => setScriptFile(event.target.value)} />
                <button onClick={() => {
                  void attachScript().catch((error: unknown) => {
                    log(error instanceof Error ? error.message : String(error));
                  });
                }}>Attach</button>
                <button onClick={() => setModal(null)}>Cancel</button>
              </>
            ) : modal === "add" ? (
              <>
                <h3>Add node</h3>
                {NODE_TYPES.map((type) => (
                  <button key={type} onClick={() => { addNode(type); setModal(null); }}>{type}</button>
                ))}
                <button onClick={() => setModal(null)}>Cancel</button>
              </>
            ) : (
              <>
                <h3>Save scene</h3>
                <input value={savePath} onChange={(event) => setSavePath(event.target.value)} />
                <button onClick={() => {
                  const path = savePath.endsWith(".cscene") ? savePath : `${savePath}.cscene`;
                  void writeScene(path).then(() => setModal(null)).catch((error: unknown) => {
                    log(error instanceof Error ? error.message : String(error));
                  });
                }}>Save</button>
                <button onClick={() => setModal(null)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {context && contextNode ? (
        <div
          className="context"
          style={{ left: Math.min(context.x, window.innerWidth - 220), top: Math.min(context.y, window.innerHeight - 280) }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {/* Later: Sub-Resources, Instantiate Child Scene, Cut, Copy, Duplicate,
              Extend Script, Change Type, Move Up, Move Down, Reparent, Make Scene Root,
              Save Branch as Scene, Access as Unique Name, Open Documentation. */}
          <button onClick={() => { setContext(null); setModal("add"); }}>Add Child Node</button>
          <button onClick={() => {
            setScriptFile(defaultScriptPath(contextNode));
            setContext(null);
            setModal("script");
          }}>Attach Script</button>
          {scriptOf(contextNode) ? (
            <button onClick={() => { detachScript(contextNode); setContext(null); }}>Detach Script</button>
          ) : null}
          {contextNode.get_child_count() > 0 ? (
            <button onClick={() => { toggleBranch(contextNode, !collapsed.includes(context.path)); setContext(null); }}>
              {collapsed.includes(context.path) ? "Expand Branch" : "Collapse Branch"}
            </button>
          ) : null}
          <button onClick={() => { setRenaming(context.path); setContext(null); }}>Rename</button>
          <button onClick={() => { void copyNodePath(contextNode); setContext(null); }}>Copy Node Path</button>
          <button className="danger" onClick={() => { const node = contextNode; setContext(null); removeNode(node); }}>Delete</button>
        </div>
      ) : null}
    </div>
  );
}

function openPage(path: string): void {
  const name = path.startsWith("/documentation") ? "corbel-docs" : "_blank";
  window.open(path, name, "width=1200,height=860");
}

function Legend(props: { role: keyof typeof scriptRoles; label: string }) {
  return <i style={{ color: scriptRoles[props.role] }}>{props.label}</i>;
}

function Menu(props: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: Array<[string, () => void]>;
}) {
  return (
    <div className="menu">
      <button onClick={props.onToggle}>{props.label}</button>
      {props.open ? (
        <div className="menu-pop">
          {props.items.map(([label, run]) => (
            <button key={label} onClick={run}>{label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SceneRows(props: {
  node: Node;
  depth: number;
  scene: Node;
  selected: Node | null;
  dropPath: string | null;
  collapsed: string[];
  renaming: string | null;
  onSelect: (node: Node) => void;
  onDrop: (path: string, target: Node) => void;
  onDragHover: (path: string | null) => void;
  onToggle: (path: string) => void;
  onContext: (event: ReactMouseEvent, node: Node) => void;
  onToggleVisible: (node: Node) => void;
  onRename: (node: Node, name: string) => void;
  onCancelRename: () => void;
}) {
  const path = nodePath(props.scene, props.node);
  const shut = props.collapsed.includes(path);
  const hasChildren = props.node.get_child_count() > 0;
  const script = scriptOf(props.node);
  return (
    <>
      <div
        className={`row${props.selected === props.node ? " on" : ""}${props.dropPath === path ? " drop" : ""}`}
        style={{ paddingLeft: 4 + props.depth * 14 }}
        draggable={props.node !== props.scene}
        onClick={() => props.onSelect(props.node)}
        onContextMenu={(event) => props.onContext(event, props.node)}
        onDragStart={(event) => event.dataTransfer.setData("text/plain", path)}
        onDragOver={(event) => {
          event.preventDefault();
          props.onDragHover(path);
        }}
        onDragLeave={() => props.onDragHover(null)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onDragHover(null);
          props.onDrop(event.dataTransfer.getData("text/plain"), props.node);
        }}
      >
        <button
          className={`twist${hasChildren ? "" : " empty"}${shut ? " shut" : ""}`}
          aria-label={shut ? "Expand" : "Collapse"}
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) {
              props.onToggle(path);
            }
          }}
        />
        {props.renaming === path ? (
          <input
            className="rename"
            autoFocus
            defaultValue={props.node.name}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                props.onRename(props.node, event.currentTarget.value);
              }
              if (event.key === "Escape") {
                props.onCancelRename();
              }
            }}
            onBlur={(event) => props.onRename(props.node, event.target.value)}
          />
        ) : (
          <span className="name">{props.node.name}</span>
        )}
        {script ? <span className="ts" title={script}>TS</span> : null}
        {props.node instanceof Node3D ? (
          <button
            className={`eye${props.node.visible ? "" : " off"}`}
            aria-label={props.node.visible ? "Hide" : "Show"}
            title={props.node.visible ? "Hide" : "Show"}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleVisible(props.node);
            }}
          >
            <Eye open={props.node.visible} />
          </button>
        ) : null}
      </div>
      {shut ? null : props.node.get_children().map((child) => (
        <SceneRows key={nodePath(props.scene, child)} {...props} node={child} depth={props.depth + 1} />
      ))}
    </>
  );
}

function Eye(props: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 8c1.6-2.4 3.6-3.6 6-3.6S12.4 5.6 14 8c-1.6 2.4-3.6 3.6-6 3.6S3.6 10.4 2 8z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {props.open
        ? <circle cx="8" cy="8" r="1.7" fill="currentColor" />
        : <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.4" />}
    </svg>
  );
}

function Inspector(props: { node: Node; onChange: () => void; onError: (message: string) => void }) {
  const node = props.node;
  const spatial = node instanceof Node3D ? node : null;
  const script = typeof node.get_meta("script_path") === "string" ? String(node.get_meta("script_path")) : "";
  return (
    <div className="fields">
      <label>
        Type
        <input readOnly value={node_label(node)} />
      </label>
      <label>
        Name
        <input
          defaultValue={node.name}
          onBlur={(event) => {
            try {
              node.set_name(event.target.value);
              props.onChange();
            } catch (error) {
              props.onError(error instanceof Error ? error.message : String(error));
              event.target.value = node.name;
            }
          }}
        />
      </label>
      {spatial ? (
        <>
          <label>
            Position
            <span className="xyz">
              <Num value={spatial.position.x} onCommit={(value) => { spatial.position.x = value; props.onChange(); }} />
              <Num value={spatial.position.y} onCommit={(value) => { spatial.position.y = value; props.onChange(); }} />
              <Num value={spatial.position.z} onCommit={(value) => { spatial.position.z = value; props.onChange(); }} />
            </span>
          </label>
          <label>
            Rotation
            <span className="xyz">
              <Num value={spatial.rotation_degrees.x} onCommit={(value) => setAxis(spatial, 0, value, props.onChange)} />
              <Num value={spatial.rotation_degrees.y} onCommit={(value) => setAxis(spatial, 1, value, props.onChange)} />
              <Num value={spatial.rotation_degrees.z} onCommit={(value) => setAxis(spatial, 2, value, props.onChange)} />
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={spatial.visible}
              onChange={(event) => {
                spatial.visible = event.target.checked;
                props.onChange();
              }}
            />
            Visible
          </label>
        </>
      ) : null}
      <label>
        Script
        <input
          defaultValue={script}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value) {
              node.set_meta("script_path", value);
            }
            props.onChange();
          }}
        />
      </label>
    </div>
  );
}

function Num(props: { value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(formatNum(props.value));
  return (
    <input
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const value = Number(text);
        if (Number.isFinite(value)) {
          props.onCommit(value);
        } else {
          setText(formatNum(props.value));
        }
      }}
    />
  );
}

function setAxis(node: Node3D, axis: 0 | 1 | 2, value: number, onChange: () => void): void {
  const rotation = node.rotation_degrees;
  const next = new Vector3(rotation.x, rotation.y, rotation.z);
  if (axis === 0) next.x = value;
  if (axis === 1) next.y = value;
  if (axis === 2) next.z = value;
  node.rotation_degrees = next;
  onChange();
}

function dragSize(
  event: ReactPointerEvent<HTMLDivElement>,
  start: number,
  apply: (next: number) => void,
  invert: boolean,
): void {
  event.preventDefault();
  const horizontal = event.currentTarget.classList.contains("x");
  const origin = horizontal ? event.clientX : event.clientY;
  const target = event.currentTarget;
  target.setPointerCapture(event.pointerId);
  const move = (ev: PointerEvent) => {
    const current = horizontal ? ev.clientX : ev.clientY;
    const delta = current - origin;
    apply(start + (invert ? -delta : delta));
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
}

async function readFile(project: string, path: string): Promise<string> {
  const response = await fetch(`/__project/file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`);
  const body = await response.json() as { text?: string; error?: string };
  if (!response.ok || typeof body.text !== "string") {
    throw new Error(body.error ?? `Could not read ${path}.`);
  }
  return body.text;
}

async function writeFile(project: string, path: string, text: string): Promise<void> {
  const response = await fetch("/__project/file", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, path, text }),
  });
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error ?? `Could not write ${path}.`);
  }
}

function nodePath(scene: Node | null, node: Node): string {
  if (!scene || node === scene) {
    return ".";
  }
  const parts: string[] = [];
  let walk: Node | null = node;
  while (walk && walk !== scene) {
    parts.push(walk.name);
    walk = walk.get_parent();
  }
  return parts.reverse().join("/");
}

function contains(root: Node, node: Node): boolean {
  let walk: Node | null = node;
  while (walk) {
    if (walk === root) {
      return true;
    }
    walk = walk.get_parent();
  }
  return false;
}

function countNodes(node: Node): number {
  return 1 + node.get_children().reduce((total, child) => total + countNodes(child), 0);
}

function scriptOf(node: Node): string {
  const value = node.get_meta("script_path");
  return typeof value === "string" ? value : "";
}

function defaultScriptPath(node: Node): string {
  const current = scriptOf(node);
  if (current.endsWith(".ts")) {
    return current;
  }
  const base = node.name.replace(/[^A-Za-z0-9_]/g, "") || "Script";
  return `res://${base}.ts`;
}

function classNameFromPath(path: string): string {
  const base = path.split("/").pop()?.replace(/\.ts$/, "") ?? "Script";
  const clean = base.replace(/[^A-Za-z0-9_]/g, "");
  if (!clean) {
    return "Script";
  }
  return /^[A-Za-z_]/.test(clean) ? clean : `Script${clean}`;
}

function scriptTemplate(className: string, type: string): string {
  return `import { ${type} } from "@corbel/core";

export default class ${className} extends ${type} {
  override _ready(): void {
  }

  override _process(_delta: number): void {
  }
}
`;
}

function kindOf(file: ProjectFile): string {
  if (file.dir) return "other";
  if (file.name.endsWith(".cscene")) return "scene";
  if (file.name.endsWith(".ts")) return "script";
  return "other";
}

function formatNum(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
