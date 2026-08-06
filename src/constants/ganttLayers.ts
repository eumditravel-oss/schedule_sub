// src/constants/ganttLayers.ts

/**
 * Unified Gantt Chart Stacking Context Z-Index Tokens
 * Prevents horizontal scrolling timeline layers from overlapping sticky left panels
 */
export const GANTT_Z = {
  BASE: 0,
  TODAY: 5,
  BAR: 10,
  HATCH: 20,
  STATUS: 30,
  TIMELINE_HEADER: 60,
  STICKY_LEFT_BODY: 100,
  STICKY_LEFT_GROUP: 110,
  STICKY_TOP_HEADER: 120,
  STICKY_CORNER: 200,
} as const;
