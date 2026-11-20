/** Godot 4 `Node.ProcessMode`, minus 2D-only notes. */
export const ProcessMode = {
  INHERIT: 0,
  PAUSABLE: 1,
  WHEN_PAUSED: 2,
  ALWAYS: 3,
  DISABLED: 4,
} as const;
export type ProcessMode = number;
