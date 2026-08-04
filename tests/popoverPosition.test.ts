// tests/popoverPosition.test.ts
import { describe, it, expect } from 'vitest';
import { calculatePopoverPosition, Rect, Viewport } from '../src/utils/popoverPosition';

describe('Popover Smart Position Clamping & Flip', () => {
  const viewport: Viewport = { width: 1366, height: 768 };
  const popoverDim = { width: 192, height: 220 }; // 192px x 220px

  it('1. Places popover below when vertical space below trigger is sufficient', () => {
    const triggerRect: Rect = {
      top: 100,
      bottom: 136,
      left: 500,
      right: 532,
      width: 32,
      height: 36,
    };

    const pos = calculatePopoverPosition(triggerRect, popoverDim, viewport);
    expect(pos.isAbove).toBe(false);
    expect(pos.top).toBe(142); // 136 + 6
  });

  it('2. Flips popover above when vertical space below trigger is insufficient', () => {
    const triggerRect: Rect = {
      top: 700,
      bottom: 736,
      left: 500,
      right: 532,
      width: 32,
      height: 36,
    };

    const pos = calculatePopoverPosition(triggerRect, popoverDim, viewport);
    expect(pos.isAbove).toBe(true);
    expect(pos.top).toBe(700 - 220 - 6); // 474
  });

  it('3. Clamps popover to right boundary when trigger is near right edge of screen', () => {
    const triggerRect: Rect = {
      top: 200,
      bottom: 236,
      left: 1350,
      right: 1366,
      width: 16,
      height: 36,
    };

    const pos = calculatePopoverPosition(triggerRect, popoverDim, viewport, 8);
    // Max allowed left = 1366 - 192 - 8 = 1166
    expect(pos.left).toBeLessThanOrEqual(1166);
  });

  it('4. Clamps popover to left boundary when trigger is near left edge of screen', () => {
    const triggerRect: Rect = {
      top: 200,
      bottom: 236,
      left: 0,
      right: 16,
      width: 16,
      height: 36,
    };

    const pos = calculatePopoverPosition(triggerRect, popoverDim, viewport, 8);
    // Min allowed left = 8
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});
