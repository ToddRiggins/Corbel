import { unpack_scene, type CSceneNode } from "@corbel/core";
import { Player, type PlayLog } from "@corbel/runtime";

/** The game window: load the saved scene, weave scripts, run. Nothing else. */

const params = new URLSearchParams(window.location.search);
const project = params.get("project") ?? "demo";
const scene_path = params.get("scene") ?? "res://main.cscene";

const loadEl = document.getElementById("load")!;
const errEl = document.getElementById("err")!;
const errCopyEl = document.getElementById("err-copy")!;
if (errCopyEl instanceof HTMLButtonElement) {
  errCopyEl.addEventListener("click", () => {
    try {
      navigator.clipboard?.writeText(errEl.textContent ?? "");
    } catch (error) {
      void error;
    }
  });
}
const log: PlayLog = (line, kind) => {
  if (kind === "error") {
    console.error(line);
    errEl.textContent += line + "\n";
    errCopyEl.classList.add("show");
    // Relay to the editor's Output panel, where the line is copyable.
    try {
      window.opener?.postMessage({ type: "corbel-game-log", line, kind }, window.location.origin);
    } catch (error) {
      void error;
    }
  } else {
    console.log(line);
  }
};

void (async () => {
  try {
    const payload = await fetch(`/__project/file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(scene_path)}`)
      .then(async (response) => (response.ok ? (await response.json() as { text?: string }) : null));
    if (!payload?.text) {
      throw new Error(`Could not read ${scene_path} from project "${project}".`);
    }
    const root = unpack_scene(JSON.parse(payload.text) as CSceneNode);
    const canvas = document.createElement("canvas");
    document.body.insertBefore(canvas, errEl);
    loadEl.remove();

    await new Player().start(root, project, canvas, log);
    document.title = `Corbel Game — ${root.name} (${project})`;
  } catch (error) {
    loadEl.textContent = "Corbel: the game did not start.";
    log(String(error instanceof Error ? error.message : error), "error");
  }
})();
