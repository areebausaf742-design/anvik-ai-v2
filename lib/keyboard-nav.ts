/**
 * Shared roving-index maths for the command palette and the model selector.
 *
 * Both widgets previously derived the next item from the *selected value*
 * rather than the currently focused item, so holding ArrowDown bounced between
 * two options. `wrapIndex` always moves relative to the focused index.
 */
export function wrapIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : length - 1;
  const start = Math.min(current, length - 1);
  return (start + delta + length) % length;
}
