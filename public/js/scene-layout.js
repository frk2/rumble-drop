import { ROWS, VISIBLE_ROWS } from './logic.js';

export const PHONE_BOARD_TOP = VISIBLE_ROWS;
export const PHONE_PREVIEW_HEIGHT = 1.56;
export const PHONE_PREVIEW_Y = PHONE_BOARD_TOP + 1.34;

// Fit the entire scene with one scale, including previews and neon trim.
export function fitScene(width, height, phoneLayout = false) {
  const top = phoneLayout ? PHONE_PREVIEW_Y + PHONE_PREVIEW_HEIGHT / 2 : ROWS + 1.2 + 1.15;
  const bottom = phoneLayout ? -0.42 : -0.7;
  const viewWidth = phoneLayout ? 11.1 : 11.6;
  const gutter = phoneLayout ? 10 : 0; // CSS pixels across both edges, reserved for shake.
  return {
    cellSize: Math.min(Math.max(1, width - gutter) / viewWidth, Math.max(1, height - gutter) / (top - bottom)),
    centerY: (top + bottom) / 2,
  };
}
