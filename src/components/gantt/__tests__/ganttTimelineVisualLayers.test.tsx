import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GanttMonthBoundaryOverlay } from '../GanttMonthBoundaryOverlay';
import { ProjectCalendarHatchOverlay } from '../ProjectCalendarHatchOverlay';

describe('Gantt timeline visual layers', () => {
  it('draws a full-height separator only where the month changes', () => {
    const html = renderToStaticMarkup(
      <GanttMonthBoundaryOverlay
        dateColumns={[
          { dateStr: '2026-08-30' },
          { dateStr: '2026-08-31' },
          { dateStr: '2026-09-01' },
          { dateStr: '2026-09-02' },
        ]}
        dayWidthPx={36}
        leftOffsetPx={360}
        timelineWidthPx={144}
        surface="overview"
      />
    );

    expect(html).toContain('data-testid="gantt-month-boundary-grid-overview"');
    expect(html).toContain('data-testid="gantt-month-boundary-line-overview-2026-09-01"');
    expect(html).toContain('left:72px');
    expect(html).toContain('class="absolute top-0 bottom-0 pointer-events-none"');
    expect(html).not.toContain('gantt-month-boundary-line-overview-2026-08-30');
    expect(html).not.toContain('gantt-month-boundary-line-overview-2026-09-02');
  });

  it('keeps the project holiday hatch below the schedule bar layer', () => {
    const html = renderToStaticMarkup(
      <ProjectCalendarHatchOverlay
        projectId="prj_visual"
        startDate="2026-08-01"
        endDate="2026-08-31"
        dateColumns={[{ dateStr: '2026-08-30' }]}
        dayWidthPx={36}
      />
    );

    expect(html).toContain('data-testid="project-calendar-hatch-grid-prj_visual"');
    expect(html).toContain('z-index:5');
    expect(html).not.toContain('z-10');
  });
});
