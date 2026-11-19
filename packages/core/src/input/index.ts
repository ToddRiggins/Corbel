export {
  InputEvent,
  InputEventKey,
  InputEventMouseButton,
  InputEventMouseMotion,
  InputEventAction,
  key_event,
  key_from_name,
  key_name_from_dom,
  key_name_from_layout,
  mouse_event_from_dom,
} from "./events.js";
export { Key, MouseButton } from "./events.js";
export { InputMap, event_from_spec } from "./input_map.js";
export type { ProjectActionSpec, ProjectEventSpec } from "./input_map.js";
export { Input } from "./input.js";
