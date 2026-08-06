// src/hooks/useGanttGeometry.ts
import { useState, useEffect, RefObject } from 'react';

export interface UseGanttGeometryOptions {
  containerRef: RefObject<HTMLElement | null>;
  leftPanelWidth: number;
  dateCount: number;
  minDayWidthPx?: number;
}

export interface GanttGeometryResult {
  leftPanelWidth: number;
  timelineViewportWidth: number;
  minimumTimelineWidth: number;
  timelineWidth: number;
  dayWidth: number;
  dateGridTemplate: string;
}

export function useGanttGeometry({
  containerRef,
  leftPanelWidth,
  dateCount,
  minDayWidthPx = 36,
}: UseGanttGeometryOptions): GanttGeometryResult {
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();

    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  const safeDateCount = Math.max(1, dateCount);
  const timelineViewportWidth = Math.max(0, containerWidth - leftPanelWidth);
  const minimumTimelineWidth = safeDateCount * minDayWidthPx;
  const timelineWidth = Math.max(timelineViewportWidth, minimumTimelineWidth);
  const dayWidth = timelineWidth / safeDateCount;
  const dateGridTemplate = `repeat(${safeDateCount}, minmax(0, 1fr))`;

  return {
    leftPanelWidth,
    timelineViewportWidth,
    minimumTimelineWidth,
    timelineWidth,
    dayWidth,
    dateGridTemplate,
  };
}
