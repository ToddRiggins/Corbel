import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { Node, SceneTree } from "@corbel/core";

export interface EngineViewProps {
  /** WebGPU first; WebGL2 fallback when missing, like the engine default. */
  preference?: "webgpu" | "webgl2";
  /** Called once the backend is live. The tree is closed when the component unmounts. */
  onReady?: (tree: SceneTree) => void;
  /** The canvas receives keyboard focus by default so `Input` events can reach the tree. */
  focusable?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const EngineContext = createContext<SceneTree | null>(null);

/**
 * Creates a canvas and owns one `SceneTree`. Panel code inside the children
 * reads the same tree through `useSceneTree`. React renders the page; the
 * tree renders the canvas.
 */
export function EngineView(props: EngineViewProps): React.JSX.Element {
  const treeRef = useRef<SceneTree | null>(null);
  if (treeRef.current === null) {
    treeRef.current = new SceneTree();
  }
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const tree = treeRef.current!;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let live = true;
    void tree.init({ canvas, preference: props.preference ?? "webgpu" }).then(() => {
      if (live) {
        props.onReady?.(tree);
      }
    });
    return () => {
      live = false;
      tree.close();
    };
    // One engine per mount; a preference change needs a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EngineContext.Provider value={treeRef.current}>
      <canvas
        ref={canvasRef}
        className={props.className}
        tabIndex={props.focusable === false ? undefined : 0}
      />
      {props.children}
    </EngineContext.Provider>
  );
}

/** The tree `EngineView` created. Throws outside an `EngineView`. */
export function useSceneTree(): SceneTree {
  const tree = useContext(EngineContext);
  if (tree === null) {
    throw new Error("useSceneTree is only valid inside an EngineView.");
  }
  return tree;
}

let selected: Node | null = null;
const selection_listeners = new Set<() => void>();

/** Marks a node selected for `useSelection` panels. Pass null to clear. */
export function select(node: Node | null): void {
  selected = node;
  for (const listener of selection_listeners) {
    listener();
  }
}

/** The node a panel selected. Godot's editor selection, React state side. */
export function useSelection(): Node | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      selection_listeners.add(onStoreChange);
      return () => selection_listeners.delete(onStoreChange);
    },
    () => selected,
    () => selected,
  );
}
