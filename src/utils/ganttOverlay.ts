// src/utils/ganttOverlay.ts
export interface GanttSpanInfo {
  startIndex: number;
  spanCount: number;
}

export function getGanttSpanColumns(
  startDate?: string | null,
  endDate?: string | null,
  dateColumns: Array<{ dateStr: string }> = []
): GanttSpanInfo | null {
  if (!startDate || !endDate || dateColumns.length === 0) return null;

  const firstVisibleDate = dateColumns[0].dateStr;
  const lastVisibleDate = dateColumns[dateColumns.length - 1].dateStr;

  // Out of visible date range
  if (endDate < firstVisibleDate || startDate > lastVisibleDate) {
    return null;
  }

  let startIndex = dateColumns.findIndex((c) => c.dateStr === startDate);
  if (startIndex === -1) {
    startIndex = 0; // Starts before first visible column
  }

  let endIndex = dateColumns.findIndex((c) => c.dateStr === endDate);
  if (endIndex === -1) {
    endIndex = dateColumns.length - 1; // Ends after last visible column
  }

  const spanCount = Math.max(1, endIndex - startIndex + 1);

  return {
    startIndex,
    spanCount,
  };
}
