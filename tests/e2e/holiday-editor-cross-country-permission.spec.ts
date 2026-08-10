// tests/e2e/holiday-editor-cross-country-permission.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Cross-Country Holiday Permission Integration Suite', () => {
  const testYear = 2031;
  const testMonth = 9;
  const krDate = '2031-09-28';
  const vnDate = '2031-09-29';

  test.afterEach(async () => {
    // Clean up temporary QA test holidays
    await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({ country_code: 'KR', year: testYear, month: testMonth, holidays: [], restore_shifted_tasks: false }),
    }).catch(() => {});

    await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'),
      },
      body: JSON.stringify({ country_code: 'VN', year: testYear, month: testMonth, holidays: [], restore_shifted_tasks: false }),
    }).catch(() => {});
  });

  test('CASE C: Korean Editor (wrk_02) can POST Direct Vietnam Manual Holiday -> HTTP 200 OK', async () => {
    const res = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('박용진 수석'), // wrk_02 (KR Editor)
      },
      body: JSON.stringify({
        country_code: 'VN',
        holiday_date: vnDate,
        name_vi: 'Ngày lễ thử nghiệm',
        name_ko: '베트남 테스트 공휴일',
      }),
    });

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.holiday_date || json.holiday_date).toBe(vnDate);
    expect(json.data?.country_code || json.country_code).toBe('VN');
  });

  test('CASE D: Vietnam Editor (wrk_03) can POST Direct Korea Manual Holiday -> HTTP 200 OK', async () => {
    const res = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('Thanh Phuong(탄 프엉)'), // wrk_03 (VN Editor)
      },
      body: JSON.stringify({
        country_code: 'KR',
        holiday_date: krDate,
        name_ko: '한국 테스트 공휴일',
        name_vi: 'Ngày lễ Hàn Quốc',
      }),
    });

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data?.holiday_date || json.holiday_date).toBe(krDate);
    expect(json.data?.country_code || json.country_code).toBe('KR');
  });

  test('CASE E: Executive Viewer (CEO/COO wrk_01) POST/PUT Manual Holiday -> HTTP 403 Forbidden', async () => {
    // 1. Direct POST check
    const postRes = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('김대표(CEO)'), // wrk_01 (CEO Viewer)
      },
      body: JSON.stringify({
        country_code: 'VN',
        holiday_date: vnDate,
        name_vi: 'Blocked Holiday',
      }),
    });

    expect(postRes.status).toBe(403);
    const postJson: any = await postRes.json();
    expect(postJson.error?.code || postJson.errCode).toBe('EXECUTIVE_READ_ONLY');

    // 2. Bulk PUT check
    const putRes = await fetch(`${QA_BASE_URL}/api/calendar/manual-holidays/month`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-name': encodeURIComponent('김대표(CEO)'),
      },
      body: JSON.stringify({
        country_code: 'KR',
        year: testYear,
        month: testMonth,
        holidays: [{ date: krDate, name_ko: 'Blocked' }],
        restore_shifted_tasks: false,
      }),
    });

    expect(putRes.status).toBe(403);
    const putJson: any = await putRes.json();
    expect(putJson.error?.code || putJson.errCode).toBe('EXECUTIVE_READ_ONLY');
  });
});
