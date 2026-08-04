# 개발팀 프로젝트 스케쥴러 최종 릴리스 QA 및 휴일·휴가 캘린더 검수 보고서

## 릴리스 판정

- 결과: **RELEASE PASS**
- 로컬 경로: `F:\Schedule`
- Repository: `https://github.com/eumditravel-oss/schedule_sub`
- Branch: `main`
- 배포 주소: `https://concost-dev-scheduler.eumditravel.workers.dev`
- D1 Database: `concost-db` (ID: `feb39a05-c98e-455f-a2b1-ff75e1c0b94f`)
- P0 Bug: 0건
- P1 Bug: 0건
- P2 Bug: 0건
- P3 Bug: 0건

## 종합 테스트 수행 결과 (100% PASS)

- **Vitest (단위, 8단계 우선순위 로직, API 통합 테스트)**: 61 / 61 Passed (10개 테스트 파일, 8.15s)
- **Playwright (Chromium 실제 브라우저 E2E 테스트)**: 8 / 8 Passed (12.0s)
- **총 실행 테스트 수**: 69개 테스트 전원 성공 PASS

## 신규 구현 및 검수 완료 기능 (작업자별 휴일·휴가 캘린더 및 모바일 로고 개선)

1. **작업자별 기본 근무제 프로필 분리**:
   - `CEO`, `COO`, `유종욱 실장`, `박용진 수석` (KR): `MON_FRI` (토요일·일요일 자동 정기 휴일)
   - `Thanh Phuong(탄 프엉)`, `Manh Cuong(끄엉)`, `Quoc Nhut(꾸옥 느엿)` (VN): `MON_SAT` (일요일 자동 정기 휴일, 토요일 정기 근무일)

2. **국가별 공휴일 동기화 (KR & VN)**:
   - 한국 공휴일: `KASI_HOLIDAY_API_KEY` 설정 시 천문연구원 OpenAPI 동기화 (`is_verified = 1`, `source = 'KASI'`), 미설정/오류 시 Nager.Date fallback (`is_verified = 0`, `source = 'NAGER'`)
   - 베트남 공휴일: Nager.Date API 동기화 (`source = 'NAGER'`)
   - D1 `country_holidays` 캐시 테이블 저장 및 API 오류 시 캐시 100% 활용

3. **8단계 우선순위 일별 상태 해결 서비스 (`resolveWorkDayStatus`)**:
   - 우선순위 1: 작업자 개인 `WORK` 근무일 지정 override
   - 우선순위 2: 작업자 개인 `LEAVE` 휴가 지정 override
   - 우선순위 3: 작업자 개인 `OFF` 휴무 지정 override
   - 우선순위 4: 국가 단위 `WORK` 지정 override
   - 우선순위 5: 국가 단위 `OFF` 지정 override
   - 우선순위 6: `PUBLIC_HOLIDAY` 국가 공휴일 (휴무)
   - 우선순위 7: `WEEKLY_OFF` 작업자 프로필 기반 주말 정기 휴일
   - 우선순위 8: `WORKDAY` 일반 근무일

4. **휴일·휴가 관리 UI 모달 (`CalendarManagerModal`)**:
   - 접속자 권한 기반 모달 오픈 (`data-testid="manage-holidays-btn"`)
   - 개인 휴가 (`LEAVE`), 수동 휴무 (`OFF`), 근무일 지정 (`WORK`) 입력 및 동기화 버튼 제공
   - 기존 등록 휴가 목록 확인 및 즉시 삭제 기능 제공

5. **데스크톱 & 모바일 간트표 휴일 렌더링**:
   - 데스크톱 간트 헤더: KR / VN 공휴일 배지 표시
   - 작업자별 행 데스크톱 셀 배경색 분리:
     - 정기 휴일 (`bg-slate-100 text-slate-500`)
     - 공휴일 (`bg-rose-50 border-rose-200 text-rose-700`)
     - 개인 휴가 (`bg-violet-100 border-violet-300 text-violet-700`)
     - 수동 휴무 (`bg-amber-100 border-amber-300 text-amber-700`)
     - 근무 지정 (`bg-cyan-100 border-cyan-300 text-cyan-700`)
   - 셀 마우스 호버 툴팁: 날짜 | 작업자명 | 상태명 (근무일/휴무일 구분) | 작성/수정자 표기
   - 모바일 7일 주간 스트립: '휴'/'공'/'가'/'근' (KO) 및 'N'/'L'/'P'/'W' (VI) 미니 배지 표시
   - 모바일 바텀시트: 선택 날짜의 휴일명, 휴가 종류, 근무/휴무 여부 상세 표시

6. **모바일 헤더 로고 크롭 및 선명도 최적화**:
   - 상·하단여백 52px 투명 여백 제거 (`public/logo3-mobile-cropped.png`)
   - 모바일 헤더 `h-8 w-auto object-contain` 적용으로 글자 광학 크기 극대화
   - boundingBox 높이 검증: `28px ~ 34px` 규격 충족 확인

7. **D1 데이터 및 QA Cleanup 검증**:
   - Remote D1 SQL 백업: `backups/concost-db-before-calendar-migration.sql`
   - D1 마이그레이션 `0006_worker_calendar_holidays_and_leave.sql` 적용 완료
   - QA 테스트 오버라이드 cleanup 수: `0건` (`SELECT COUNT(*) FROM calendar_overrides WHERE label_ko LIKE '[QA-CALENDAR]%'` -> 0건 확인)

## 뷰포트 정밀 검수 (10개 뷰포트)

| 뷰포트 | 규격 | 가로 Overflow | 검수 결과 |
|---|---|---|---|
| Desktop Full HD | 1920 × 1080 | false | **PASS** |
| Desktop Standard | 1536 × 864 | false | **PASS** |
| Desktop Compact | 1366 × 768 | false | **PASS** |
| iPhone 12 Pro | 390 × 844 | false | **PASS** |
| Galaxy S24 | 360 × 780 | false | **PASS** |
| Galaxy Z Flip | 360 × 880 | false | **PASS** |
| Galaxy Fold Outer | 344 × 882 | false | **PASS** |
| Galaxy Fold Inner | 768 × 1024 | false | **PASS** |
| Tablet Landscape | 1024 × 768 | false | **PASS** |
| Compact 320px | 320 × 700 | false | **PASS** |

## 스크린샷 증거 목록 (`qa/screenshots/`)

1. `qa/screenshots/mobile-logo-320.png` (10.0 KB)
2. `qa/screenshots/mobile-logo-344.png` (15.6 KB)
3. `qa/screenshots/mobile-logo-360.png` (16.1 KB)
4. `qa/screenshots/mobile-logo-390.png` (17.0 KB)
5. `qa/screenshots/desktop-worker-holidays.png` (33.9 KB)
6. `qa/screenshots/desktop-kr-vn-saturday-difference.png` (33.9 KB)
7. `qa/screenshots/mobile-worker-leave.png` (7.8 KB)
8. `qa/screenshots/mobile-vietnam-working-saturday.png` (8.3 KB)
9. `qa/screenshots/mobile-public-holiday.png` (8.3 KB)
