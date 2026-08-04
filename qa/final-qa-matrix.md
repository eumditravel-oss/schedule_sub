# CON-COST × VIETQS Dev Scheduler - Final QA Matrix

| ID | 화면 | 요소 | 조작 | 기대 결과 | 실제 결과 | Console | Network | D1 | 결과 |
|---|---|---|---|---|---|---|---|---|---|
| BTN-001 | 공통 헤더 | 로고 (`logo3.png`) | 클릭 | 메인 `/projects` 이동 | 메인 화면 이동 | 0 Error | GET 200 | N/A | PASS |
| BTN-002 | 공통 헤더 | 언어 선택 (KO) | 클릭 | UI 한국어 설정, `lang='ko'`, title 변경 | 한국어 즉시 적용 | 0 Error | N/A | N/A | PASS |
| BTN-003 | 공통 헤더 | 언어 선택 (VI) | 클릭 | UI 베트남어 설정, `lang='vi'`, title 변경 | 베트남어 즉시 적용 | 0 Error | N/A | N/A | PASS |
| BTN-004 | 공통 헤더 | 접속자 선택 드롭다운 | 클릭 | 7명 인원 목록 팝업 | 7명 순서대로 팝업 | 0 Error | GET /api/workers 200 | 7 Members | PASS |
| BTN-005 | 공통 헤더 | 접속자 CEO 선택 | 선택 | 현재 접속자 CEO 지정, localStorage 저장 | CEO 지정 완료 | 0 Error | N/A | N/A | PASS |
| BTN-006 | 공통 헤더 | 접속자 COO 선택 | 선택 | 현재 접속자 COO 지정, localStorage 저장 | COO 지정 완료 | 0 Error | N/A | N/A | PASS |
| BTN-007 | 공통 헤더 | 프로젝트 추가 | 클릭 | 프로젝트 작성 모달 팝업 | 모달 정상 팝업 | 0 Error | N/A | N/A | PASS |
| TAB-001 | 프로젝트 목록 | 진행 프로젝트 탭 | 클릭 | 진행 중 프로젝트 목록 조회 | 진행 프로젝트 렌더링 | 0 Error | GET /api/projects 200 | ACTIVE | PASS |
| TAB-002 | 프로젝트 목록 | 완료 프로젝트 탭 | 클릭 | 연도별 완료 프로젝트 조회 | 완료 프로젝트 렌더링 | 0 Error | GET /api/projects?status=COMPLETED 200 | COMPLETED | PASS |
| TAB-003 | 프로젝트 목록 | 연도 선택 드롭다운 | 선택 | 선택 연도 완료 프로젝트 조회 | 해당 연도 프로젝트 조회 | 0 Error | GET /api/projects?status=COMPLETED&year=2026 | COMPLETED | PASS |
| BTN-008 | 프로젝트 목록 | 요약 보기 (모바일) | 클릭 | 모바일 요약 카드 뷰 전환 | 요약 카드 뷰 전환 | 0 Error | N/A | N/A | PASS |
| BTN-009 | 프로젝트 목록 | 7일 보기 (모바일) | 클릭 | 7일 주간 상태 스트립 뷰 전환 | 7일 스트립 뷰 전환 | 0 Error | N/A | N/A | PASS |
| BTN-010 | 프로젝트 목록 | 30일 보기 | 클릭 | 30일 간트 차트 뷰 전환 | 30일 간트 렌더링 | 0 Error | N/A | N/A | PASS |
| BTN-011 | 프로젝트 목록 | 월별 보기 | 클릭 | 월별 간트 차트 뷰 전환 | 월별 간트 렌더링 | 0 Error | N/A | N/A | PASS |
| BTN-012 | 프로젝트 목록 | 이전 (‹) 버튼 | 클릭 | 지정 범위 이전 기간으로 이동 | 이전 기간 이동 | 0 Error | N/A | N/A | PASS |
| BTN-013 | 프로젝트 목록 | 오늘 버튼 | 클릭 | 오늘 날짜 기준 범위로 복귀 | 오늘 범위 복귀 | 0 Error | N/A | N/A | PASS |
| BTN-014 | 프로젝트 목록 | 다음 (›) 버튼 | 클릭 | 지정 범위 다음 기간으로 이동 | 다음 기간 이동 | 0 Error | N/A | N/A | PASS |
| BTN-015 | 프로젝트 목록 | 프로젝트 행/카드 | 클릭 | 상세 화면 `/projects/:id` 이동 | 상세 화면 이동 | 0 Error | GET /api/projects/:id/detail 200 | N/A | PASS |
| BTN-016 | 프로젝트 목록 | 카드 더보기 (`⋮`) | 클릭 | 수동 메뉴 (수정/완료/삭제) | 메뉴 팝업 | 0 Error | N/A | N/A | PASS |
| BTN-017 | 프로젝트 목록 | 프로젝트 수정 | 클릭 | 프로젝트 수정 모달 팝업 | 수정 모달 팝업 | 0 Error | N/A | N/A | PASS |
| BTN-018 | 프로젝트 목록 | 프로젝트 완료 처리 | 클릭 | 완료 처리 확인 후 완료 탭 이동 (100%) | 완료 처리 완료 | 0 Error | POST /api/projects/:id/complete 200 | status=COMPLETED | PASS |
| BTN-019 | 프로젝트 목록 | 프로젝트 삭제 | 클릭 | 삭제 확인 후 DB deletion | 프로젝트 삭제 완료 | 0 Error | DELETE /api/projects/:id 200 | DELETED | PASS |
| BTN-020 | 프로젝트 모달 | 닫기 X / 취소 | 클릭 | 모달 닫힘 | 모달 닫힘 | 0 Error | N/A | N/A | PASS |
| BTN-021 | 프로젝트 모달 | 언어 선택 (KO/VI) | 클릭 | 원문 언어 전환 | 원문 언어 전환 | 0 Error | N/A | N/A | PASS |
| BTN-022 | 프로젝트 모달 | 번역 재시도 | 클릭 | Workers AI 번역 재호출 | AI 번역 완료 | 0 Error | POST /api/translate 200 | COMPLETED | PASS |
| BTN-023 | 프로젝트 모달 | 저장 | 클릭 | 프로젝트 저장 및 실시간 자동 번역 | DB 저장 완료 | 0 Error | POST/PATCH /api/projects 201/200 | Inserted/Updated | PASS |
| BTN-024 | 프로젝트 상세 | 목록으로 (←) | 클릭 | 프로젝트 목록으로 이동 | 목록 이동 완료 | 0 Error | N/A | N/A | PASS |
| BTN-025 | 프로젝트 상세 | 작업 추가 | 클릭 | 작업 생성 모달 팝업 | 모달 정상 팝업 | 0 Error | N/A | N/A | PASS |
| BTN-026 | 프로젝트 상세 | 작업 수정 | 클릭 | 작업 수정 모달 팝업 | 수정 모달 팝업 | 0 Error | N/A | N/A | PASS |
| BTN-027 | 프로젝트 상세 | 작업 삭제 | 클릭 | 삭제 확인 후 작업 삭제 | 작업 삭제 완료 | 0 Error | DELETE /api/tasks/:id 200 | DELETED | PASS |
| BTN-028 | 프로젝트 상세 | 진행 프로젝트로 복귀 | 클릭 | 복귀 확인 후 ACTIVE 변경 | ACTIVE 변경 완료 | 0 Error | POST /api/projects/:id/reopen 200 | status=ACTIVE | PASS |
| CELL-001 | 간트 차트 | 날짜 셀 클릭 (데스크톱) | 클릭 | StatusPopover 팝업 | Popover 정상 팝업 | 0 Error | N/A | N/A | PASS |
| CELL-002 | 간트 차트 | 날짜 셀 클릭 (모바일) | 클릭 | MobileStatusSheet 하단 시트 팝업 | 하단 시트 팝업 | 0 Error | N/A | N/A | PASS |
| POP-001 | 상태 선택 | 미작업 | 클릭 | 일별 상태 NONE 업데이트 | 상태 업데이트 완료 | 0 Error | PUT /api/tasks/:id/daily-status/:date 200 | NONE | PASS |
| POP-002 | 상태 선택 | 작업 중 | 클릭 | 일별 상태 IN_PROGRESS 업데이트 | 상태 업데이트 완료 | 0 Error | PUT /api/tasks/:id/daily-status/:date 200 | IN_PROGRESS | PASS |
| POP-003 | 상태 선택 | 완료 | 클릭 | 일별 상태 COMPLETED 업데이트 | 상태 업데이트 완료 | 0 Error | PUT /api/tasks/:id/daily-status/:date 200 | COMPLETED | PASS |
| POP-004 | 상태 선택 | 문제 발생 | 클릭 | 일별 상태 ISSUE 업데이트 | 상태 업데이트 완료 | 0 Error | PUT /api/tasks/:id/daily-status/:date 200 | ISSUE | PASS |
| SHEET-001| 모바일 | 접속자 선택 시트 | 클릭 | 7명 하단 시트 팝업 | 7명 팝업 완료 | 0 Error | GET /api/workers 200 | 7 Members | PASS |
| FAB-001  | 모바일 | FAB 플러스 (`+`) | 클릭 | 신규 프로젝트/작업 모달 팝업 | 모달 정상 팝업 | 0 Error | N/A | N/A | PASS |
