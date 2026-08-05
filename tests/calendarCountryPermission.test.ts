import { describe, test, expect } from 'vitest';

const BASE_URL = process.env.TEST_API_URL || 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

describe('Calendar Country Permission Integrity Suite (No country flag restriction)', () => {
  // Active Korean EDITOR with flag=1 (박용진 수석)
  const krEditorFlag1Headers = {
    'Content-Type': 'application/json',
    'x-editor-id': 'wrk_02',
    'x-editor-name': encodeURIComponent('박용진 수석'),
  };

  // Active Korean EDITOR with flag=1 (이동헌 수석)
  const krEditorFlag1Headers2 = {
    'Content-Type': 'application/json',
    'x-editor-id': 'wrk_01',
    'x-editor-name': encodeURIComponent('이동헌 수석'),
  };

  // Active Vietnamese EDITOR with flag=0 (Thanh Phuong)
  const vnEditorFlag0Headers1 = {
    'Content-Type': 'application/json',
    'x-editor-id': 'wrk_03',
    'x-editor-name': encodeURIComponent('Thanh Phuong(강 수석)'),
  };

  // Active Vietnamese EDITOR with flag=0 (Manh Cuong)
  const vnEditorFlag0Headers2 = {
    'Content-Type': 'application/json',
    'x-editor-id': 'wrk_04',
    'x-editor-name': encodeURIComponent('Manh Cuong(팀장)'),
  };

  // Executive VIEWER CEO (CEO)
  const ceoHeaders = {
    'Content-Type': 'application/json',
    'x-editor-id': 'wrk_00_ceo',
    'x-editor-name': encodeURIComponent('CEO'),
  };

  // Executive VIEWER COO (COO)
  const cooHeaders = {
    'Content-Type': 'application/json',
    'x-editor-id': 'wrk_00_coo',
    'x-editor-name': encodeURIComponent('COO'),
  };

  test('1. Korean EDITOR flag=1 can save Korea manual holidays', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '테스트 공휴일', name_vi: 'Ngay le test' }],
        editor_id: 'wrk_02',
        editor_name: '박용진 수석',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.success || json.success).toBe(true);
  });

  test('2. Korean EDITOR flag=1 can save Korea manual holidays (2nd worker)', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers2,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '테스트 공휴일', name_vi: 'Ngay le test' }],
        editor_id: 'wrk_01',
        editor_name: '이동헌 수석',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.success || json.success).toBe(true);
  });

  test('3. Vietnamese EDITOR flag=0 can save Vietnam manual holidays', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: vnEditorFlag0Headers1,
      body: JSON.stringify({
        country_code: 'VN',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '베트남 공휴일', name_vi: 'Ngay le VN' }],
        editor_id: 'wrk_03',
        editor_name: 'Thanh Phuong(강 수석)',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.success || json.success).toBe(true);
  });

  test('4. Vietnamese EDITOR flag=0 can save Vietnam manual holidays (2nd worker)', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: vnEditorFlag0Headers2,
      body: JSON.stringify({
        country_code: 'VN',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '베트남 공휴일', name_vi: 'Ngay le VN' }],
        editor_id: 'wrk_04',
        editor_name: 'Manh Cuong(팀장)',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.success || json.success).toBe(true);
  });

  test('5. Vietnamese EDITOR flag=0 can save Vietnam saturday schedule', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/vietnam-saturdays`, {
      method: 'PUT',
      headers: vnEditorFlag0Headers2,
      body: JSON.stringify({
        year: 2026,
        month: 11,
        target_scope: 'ALL_VN',
        saturdays: [{ date: '2026-11-07', status: 'WORK' }],
        editor_name: 'Manh Cuong(팀장)',
      }),
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.success || json.success).toBe(true);
  });

  test('6. Korean EDITOR can save Vietnam manual holidays', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers2,
      body: JSON.stringify({
        country_code: 'VN',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '베트남 공휴일', name_vi: 'Ngay le VN' }],
        editor_id: 'wrk_01',
        editor_name: '이동헌 수석',
      }),
    });
    expect(res.status).toBe(200);
  });

  test('7. Vietnamese EDITOR can save Korea manual holidays', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: vnEditorFlag0Headers2,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '한국 공휴일', name_vi: 'Ngay le KR' }],
        editor_id: 'wrk_04',
        editor_name: 'Manh Cuong(팀장)',
      }),
    });
    expect(res.status).toBe(200);
  });

  test('8. CEO is blocked from saving Korea manual holidays with HTTP 403 EXECUTIVE_READ_ONLY', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: ceoHeaders,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_00_ceo',
        editor_name: 'CEO',
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe('EXECUTIVE_READ_ONLY');
  });

  test('9. COO is blocked from saving Vietnam manual holidays with HTTP 403 EXECUTIVE_READ_ONLY', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: cooHeaders,
      body: JSON.stringify({
        country_code: 'VN',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_00_coo',
        editor_name: 'COO',
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe('EXECUTIVE_READ_ONLY');
  });

  test('10. CEO is blocked from saving Vietnam saturday schedule with HTTP 403 EXECUTIVE_READ_ONLY', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/vietnam-saturdays`, {
      method: 'PUT',
      headers: ceoHeaders,
      body: JSON.stringify({
        year: 2026,
        month: 11,
        target_scope: 'ALL_VN',
        saturdays: [],
        editor_name: 'CEO',
      }),
    });
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe('EXECUTIVE_READ_ONLY');
  });

  test('11. Inactive worker is blocked with HTTP 403 INACTIVE_WORKER or 400 ACTIVE_WORKER_REQUIRED', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-id': 'wrk_inactive_99',
        'x-editor-name': encodeURIComponent('비활성 작업자'),
      },
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_inactive_99',
      }),
    });
    expect([400, 403]).toContain(res.status);
    const json: any = await res.json();
    expect(['INACTIVE_WORKER', 'ACTIVE_WORKER_REQUIRED']).toContain(json.error?.code);
  });

  test('12. Unregistered worker is blocked with HTTP 400 ACTIVE_WORKER_REQUIRED', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-id': 'wrk_ghost_9999',
        'x-editor-name': encodeURIComponent('Ghost Worker'),
      },
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_ghost_9999',
      }),
    });
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error?.code).toBe('ACTIVE_WORKER_REQUIRED');
  });

  test('13. Cleanup test holidays in month 2026-11', async () => {
    const krRes = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_02',
      }),
    });
    expect(krRes.status).toBe(200);

    const vnRes = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: vnEditorFlag0Headers1,
      body: JSON.stringify({
        country_code: 'VN',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_03',
      }),
    });
    expect(vnRes.status).toBe(200);
  });

  test('14. Verify saving existing/duplicate holiday date does NOT cause D1 UNIQUE constraint error', async () => {
    const res1 = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '중복 테스트 1차', name_vi: 'Test 1' }],
        editor_id: 'wrk_02',
        editor_name: '박용진 수석',
      }),
    });
    expect(res1.status).toBe(200);

    const res2 = await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [{ date: '2026-11-25', name_ko: '중복 테스트 2차 갱신', name_vi: 'Test 2' }],
        editor_id: 'wrk_02',
        editor_name: '박용진 수석',
      }),
    });
    expect(res2.status).toBe(200);
    const json2: any = await res2.json();
    expect(json2.data?.success || json2.success).toBe(true);

    await fetch(`${BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: krEditorFlag1Headers,
      body: JSON.stringify({
        country_code: 'KR',
        year: 2026,
        month: 11,
        holidays: [],
        editor_id: 'wrk_02',
      }),
    });
  });
});
