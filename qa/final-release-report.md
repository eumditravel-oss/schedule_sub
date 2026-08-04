# 접속자 역할·자동 언어·대상별 휴일 적용 최종 QA 보고서

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

## 1. 작업자 프로필

- **CEO**: EXECUTIVE 그룹 | RED 색상 | `access_role = 'VIEWER'` | `ui_language = 'ko'` | `country_code = 'KR'` | `workweek_profile = 'MON_FRI'`
- **COO**: EXECUTIVE 그룹 | RED 색상 | `access_role = 'VIEWER'` | `ui_language = 'ko'` | `country_code = 'KR'` | `workweek_profile = 'MON_FRI'`
- **유종욱 실장**: KOREAN_STAFF 그룹 | GREEN 색상 | `access_role = 'EDITOR'` | `ui_language = 'ko'` | `country_code = 'KR'` | `workweek_profile = 'MON_FRI'`
- **박용진 수석**: KOREAN_STAFF 그룹 | GREEN 색상 | `access_role = 'EDITOR'` | `ui_language = 'ko'` | `country_code = 'KR'` | `workweek_profile = 'MON_FRI'`
- **Thanh Phuong(탄 프엉)**: VIETNAMESE_STAFF 그룹 | YELLOW 색상 | `access_role = 'EDITOR'` | `ui_language = 'vi'` | `country_code = 'VN'` | `workweek_profile = 'MON_SAT'`
- **Manh Cuong(끄엉)**: VIETNAMESE_STAFF 그룹 | YELLOW 색상 | `access_role = 'EDITOR'` | `ui_language = 'vi'` | `country_code = 'VN'` | `workweek_profile = 'MON_SAT'`
- **Quoc Nhut(꾸옥 느엿)**: VIETNAMESE_STAFF 그룹 | YELLOW 색상 | `access_role = 'EDITOR'` | `ui_language = 'vi'` | `country_code = 'VN'` | `workweek_profile = 'MON_SAT'`

## 2. 경영진 보기 전용 (EXECUTIVE_READ_ONLY)

- UI 쓰기 버튼: CEO/COO 접속 시 프로젝트 추가/수정/완료/삭제, 작업 추가/수정/삭제, 셀 클릭 상태 변경, 모바일 FAB, 휴일 관리 버튼 100% 숨김 처리 완료
- 프로젝트 쓰기 API: HTTP 403 `EXECUTIVE_READ_ONLY` ("경영진 계정은 일정을 조회할 수만 있습니다.") 검증 완료
- 작업 쓰기 API: HTTP 403 `EXECUTIVE_READ_ONLY` 검증 완료
- 상태 쓰기 API: HTTP 403 `EXECUTIVE_READ_ONLY` 검증 완료
- 휴일 쓰기 API: HTTP 403 `EXECUTIVE_READ_ONLY` 검증 완료
- 오류 코드: `EXECUTIVE_READ_ONLY` (KO: "경영진 계정은 일정을 조회할 수만 있습니다." / VI: "Tài khoản quản lý chỉ có quyền xem lịch trình.")

## 3. 접속자 기반 자동 언어

- CEO: 선택 시 한국어 UI (`setLanguage('ko')`) 자동 적용
- COO: 선택 시 한국어 UI (`setLanguage('ko')`) 자동 적용
- 한국 직원: 선택 시 한국어 UI (`setLanguage('ko')`) 자동 적용
- 베트남 직원: 선택 시 베트남어 UI (`setLanguage('vi')`) 자동 적용
- KO/VI 헤더 탭 제거: 데스크톱 `LanguageSelector` 및 모바일 `mobile-lang-btn` 완전 제거 완료
- 모달 언어 탭 제거: ProjectModal 및 TaskModal의 수동 언어 선택 탭 제거, 읽기 전용 배지 (`입력 언어: 한국어` / `Ngôn ngữ nhập: Tiếng Việt`) 표시
- 새로고침 유지: `schedule_current_worker_id` 기준 API 프로필 조회 후 언어 복원

## 4. 휴일 정책

- 한국 대상: `country_code = 'KR'` (KR 공휴일, 토·일 주말 휴무)
- 베트남 대상: `country_code = 'VN'` (VN 공휴일, 일요일 휴무)
- 한국 토요일: 정기 휴무 (`WEEKLY_OFF`)
- 베트남 토요일: 정기 근무일 (`WORKDAY`)
- 전 직원 일요일: 정기 휴무 (`WEEKLY_OFF`)
- 프로젝트 전체 KR/VN 배지: 날짜 헤더에 KR, VN 공휴일 배지 독립 표시
- 작업자별 행 판정: 접속자가 아닌 각 작업 행의 담당자 프로필 기준으로 토요일 근무/휴무 및 공휴일 판정
- 본인 휴가 입력: EDITOR는 본인 worker ID로 휴가 입력 고정
- 다른 직원 휴가 차단: 서버에서 `scope_key` 불일치 시 HTTP 403 `CALENDAR_SELF_ONLY` ("본인의 휴일·휴가 일정만 변경할 수 있습니다.") 반환

## 5. 모바일 UI

- 경영진 보기 전용: 자물쇠 아이콘과 '보기 전용' (KO) / 'Chỉ xem' (VI) 빨간색 배지 표시
- 한국 직원 한국어: 초록색 뱃지 ('한국' / 'Hàn Quốc') 및 한국어 표기
- 베트남 직원 베트남어: 노란색/호박색 뱃지 ('Việt Nam') 및 베트남어 표기
- 로고 높이: `28px ~ 34px` 규격 완벽 유지
- 320px Overflow: `0건` (Overflow 없음)
- 344px Overflow: `0건`
- 360px Overflow: `0건`
- 390px Overflow: `0건`

## 6. 테스트 수행 결과

- TypeScript `tsc --noEmit`: 0 errors (PASS)
- Vitest 단위 & API 테스트: 61 / 61 Passed (10개 테스트 파일, 8.67s)
- Playwright Chromium E2E: 8 / 8 Passed (24.1s)
- CEO·COO 403: API 직접 호출 시 `EXECUTIVE_READ_ONLY` 403 검증 통과
- 한국어 자동 적용: CEO, COO, 유종욱, 박용진 선택 시 KO 즉시 반영 통과
- 베트남어 자동 적용: Thanh Phuong, Manh Cuong, Quoc Nhut 선택 시 VI 즉시 반영 통과
- 휴일 대상별 판정: 한국 토요일 휴무 / 베트남 토요일 근무 독립 판정 통과

## 7. 배포 정보

- 배포 URL: `https://concost-dev-scheduler.eumditravel.workers.dev`
- Version ID: `6bbe6f0a-b2f6-4422-b21d-9d07d675d994`
- GitHub Commit: `main` 브랜치 자동 commit 및 push 수행
