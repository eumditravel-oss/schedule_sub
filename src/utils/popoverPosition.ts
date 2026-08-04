// src/utils/popoverPosition.ts

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  isAbove: boolean;
}

/**
 * Calculates smart fixed popover coordinates clamped within viewport bounds.
 */
export function calculatePopoverPosition(
  triggerRect: Rect,
  popoverDimensions: { width: number; height: number },
  viewport: Viewport = { width: typeof window !== 'undefined' ? window.innerWidth : 1920, height: typeof window !== 'undefined' ? window.innerHeight : 1080 },
  margin: number = 8
): PopoverPosition {
  const { width: pWidth, height: pHeight } = popoverDimensions;

  // 1. Horizontal center clamping
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  let left = triggerCenterX - pWidth / 2;
  const maxLeft = Math.max(margin, viewport.width - pWidth - margin);
  left = Math.max(margin, Math.min(left, maxLeft));

  // 2. Vertical position & Flip
  const spaceBelow = viewport.height - triggerRect.bottom;
  const isAbove = spaceBelow < pHeight + margin && triggerRect.top > pHeight + margin;

  let top: number;
  if (isAbove) {
    top = triggerRect.top - pHeight - 6;
  } else {
    top = triggerRect.bottom + 6;
  }

  // Vertical clamping
  const maxTop = Math.max(margin, viewport.height - pHeight - margin);
  top = Math.max(margin, Math.min(top, maxTop));

  return { top, left, isAbove };
}
