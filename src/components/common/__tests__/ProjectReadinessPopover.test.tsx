import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectReadinessPopover } from '../ProjectReadinessPopover';
import { ProjectReadiness } from '../../../utils/projectReadiness';

const createReadiness = (status: ProjectReadiness['status']): ProjectReadiness => ({
  status,
  badge_text_ko: status === 'READY' ? '정상' : '확인 필요',
  badge_text_vi: status === 'READY' ? 'Bình thường' : 'Cần kiểm tra',
  badge_color_class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  total_issue_count: status === 'READY' ? 0 : 1,
  category_count: status === 'READY' ? 0 : 1,
  setup_count: 0,
  risk_count: status === 'READY' ? 0 : 1,
  issues: [],
  issue_groups: {},
});

describe('ProjectReadinessPopover', () => {
  it('hides a READY badge when hideIfReady is enabled', () => {
    const html = renderToStaticMarkup(
      <ProjectReadinessPopover readiness={createReadiness('READY')} hideIfReady />
    );

    expect(html).toBe('');
  });

  it('renders a non-ready badge with the same hook path', () => {
    const html = renderToStaticMarkup(
      <ProjectReadinessPopover readiness={createReadiness('RISK')} hideIfReady />
    );

    expect(html).toContain('data-testid="project-readiness-badge"');
  });
});
