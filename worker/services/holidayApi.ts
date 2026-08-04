// worker/services/holidayApi.ts

export interface SyncedHoliday {
  holiday_date: string;
  name_local: string;
  name_ko?: string;
  name_vi?: string;
  source: 'KASI' | 'NAGER' | 'MANUAL';
  is_verified: number;
}

export async function fetchKrHolidaysKasi(solYear: number, apiKey: string): Promise<SyncedHoliday[]> {
  const holidays: SyncedHoliday[] = [];

  for (let m = 1; m <= 12; m++) {
    const solMonth = m < 10 ? `0${m}` : `${m}`;
    const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo?serviceKey=${apiKey}&solYear=${solYear}&solMonth=${solMonth}&_type=json`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;

      const data: any = await res.json();
      const items = data?.response?.body?.items?.item;
      if (!items) continue;

      const itemList = Array.isArray(items) ? items : [items];
      for (const item of itemList) {
        if (item.isHoliday === 'Y' && item.locdate) {
          const locStr = String(item.locdate);
          const formattedDate = `${locStr.slice(0, 4)}-${locStr.slice(4, 6)}-${locStr.slice(6, 8)}`;
          holidays.push({
            holiday_date: formattedDate,
            name_local: item.dateName || '공휴일',
            name_ko: item.dateName || '공휴일',
            name_vi: item.dateName || 'Ngày lễ',
            source: 'KASI',
            is_verified: 1,
          });
        }
      }
    } catch (e) {
      console.error(`KASI API fetch error for month ${m}:`, e);
    }
  }

  return holidays;
}

export async function fetchHolidaysNager(year: number, countryCode: 'KR' | 'VN'): Promise<SyncedHoliday[]> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Nager.Date API HTTP ${res.status}`);
  }

  const list: any = await res.json();
  if (!Array.isArray(list)) return [];

  return list.map((h: any) => {
    const dateStr = h.date;
    const localName = h.localName || h.name || 'Public Holiday';
    return {
      holiday_date: dateStr,
      name_local: localName,
      name_ko: h.name || localName,
      name_vi: localName,
      source: 'NAGER',
      is_verified: 0,
    };
  });
}
