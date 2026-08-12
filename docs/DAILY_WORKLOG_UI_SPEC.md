# Developer Scheduler V3 — Daily Worklog UI Specification

## 1. Experience goals

- Extend the current scheduler; do not create a visually separate worklog app.
- Reuse current header height, border/radius, typography, button, badge, table spacing, calendar hatch, and KR/VN localization patterns.
- Keep the main project/Gantt workflow visible while worklog actions occur in a drawer or responsive panel.
- Separate authenticated actor from selected employee view context in every write surface.
- Show schedule impact before submission when enough data exists; never imply that missing data has already changed the schedule.

## 2. Entry points and role visibility

| UI action | Worker | Team Manager | Executive | System Admin |
|---|---:|---:|---:|---:|
| View projects/Gantt/print | yes | yes | yes | yes |
| Change viewed employee | yes, permitted scope | yes, team scope | yes, read scope | yes |
| Morning start | own worklog | own or delegated | hidden | policy-based |
| EOD close | own worklog | own or delegated | hidden | policy-based |
| Approve adjustment | no | yes | hidden | only with business role |
| Edit forecast/assignment | assigned scope | yes | hidden | policy-based |
| Revert worklog impact | no | yes | hidden | policy-based |

Executive screens show no disabled mutation buttons; the controls are omitted.

## 3. Header integration

### Desktop

```text
┌ Existing brand/project navigation ─────────────────────────────────────────────┐
│ ... [업무 시작] [업무 마감] [오늘: 시작 작성 / 마감 대기] [view: Thanh Phuong] │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- `업무 시작`: primary blue action before Morning submit; becomes neutral `시작 수정` afterward.
- `업무 마감`: green action after Morning submit; disabled only when validation truly prevents EOD.
- status badge examples: `미작성`, `시작 작성`, `마감 대기`, `제출 완료`, `승인 대기`, `수정됨`.
- view-context chip must say `조회: <employee>` when different from the actor.
- delegated action header must say `박용진 수석이 Thanh Phuong 대신 작성` before submit.

### Mobile

Keep the existing compact header. Add one `업무일지` button opening a bottom sheet; status appears as a small badge. Do not add three separate header buttons.

## 4. Daily Worklog drawer/panel

Recommended desktop width: 520–640 px right drawer. Recommended mobile: full-height bottom sheet.

```text
┌ 오늘 업무일지 · 2026-08-12 (Asia/Ho_Chi_Minh) ┐
│ [업무 시작] [업무 마감] [변경 예상] [최근 기록] │
├─────────────────────────────────────────────────┤
│ Actor: Thanh Phuong                              │
│ 대상: 본인                                       │
│ 상태: 마감 대기                                  │
│                                                 │
│ <active tab content>                            │
├─────────────────────────────────────────────────┤
│ [임시저장]                         [검토/제출]    │
└─────────────────────────────────────────────────┘
```

Tabs reuse current segmented-control styling. The drawer must preserve unsaved entries when moving between tabs.

## 5. Morning workflow

### 5.1 Auto-loaded schedule

Load tasks where the viewed employee has forecast capacity/planned work on the employee-local date. Each task card contains:

- project and WBS/task name;
- role: `PIC` or `Support`;
- current confirmed forecast period;
- planned minutes for today;
- baseline planned progress and current actual progress;
- target progress input (Primary only);
- expected deliverable;
- known blocker;
- outside-schedule indicator.

### 5.2 Additional work

`+ 추가 업무` opens a compact selector:

1. same project task;
2. another project task;
3. unplanned same-project task request;
4. meeting/outside work/company duty/training/leave/blocker category.

The user can add multiple projects/tasks. The same Task cannot be added twice; the UI focuses the existing row and explains the duplicate.

### 5.3 Morning layout

```text
[GROUPWARE] 1.2A 클레임 업무 관리 · 백엔드      [PIC]
현재 예상 08/14–08/19    오늘 계획 240분
목표 공정률 [ 30 ]%      예상 산출물 [________________]
알려진 방해요인 [없음 ▾] [____________________________]
```

Morning submission does not itself create actual progress. It reserves/declares intent and supports later variance analysis.

## 6. EOD workflow

Each Morning task is preloaded; additional actual work may be added.

```text
[GROUPWARE] 1.2A 클레임 업무 관리 · 백엔드      [PIC]
계획 240분   실제 [ 210 ]분
시작 공정률 20%  → 종료 공정률 [ 35 ]%
잔여 예상시간 [ 420 ]분       [ ] 작업 완료 보고
수행내용 [____________________________________________]
산출물   [링크/설명___________________________________]
방해요인 [없음 ▾] [__________________________________]
```

Rules:

- Primary sees progress/complete fields.
- Support sees actual minutes, result, deliverable, blocker; progress is read-only.
- `remaining_estimated_minutes` is emphasized more than progress because it drives forecast effort.
- Project-related meeting/outside work requires meeting/business evidence, not artificial task progress.
- Leave never shows meeting-minute validation.
- Retroactive date shows a prominent `소급 작성 · 관리자 승인 필요` badge.

## 7. Work category UX

Use one category select plus conditional fields, not separate forms.

| Category group | Conditional fields |
|---|---|
| Task work | project, task, minutes, result, remaining estimate |
| Same-project meeting/outside | project, optional task, minutes, meeting/business record |
| Other-project work | actual project/task, minutes, exception reason from original plan |
| Company duty/training | minutes, description, manager confirmation marker |
| Leave | leave record selector, minutes/full day; no meeting evidence |
| Blocked/no work | task, blocker type/detail, dependency/reference |

Partial-day entries use minutes and show `남은 배정 가능 120분` for the local date.

## 8. Schedule Impact Preview

Before final EOD submission, calculate a read-only preview. If required inputs are missing, show `일정 영향 계산 보류` and the missing reasons rather than a guessed date.

```text
┌ 일정 변경 예상 ─────────────────────────────────────────────┐
│ 변경 원인: 타 프로젝트 업무 480분                           │
│                                                           │
│ Task                         현재 예상       변경 예상       │
│ GROUPWARE / 1.2A Backend     08/14–08/19  →  08/14–08/20 +1 │
│ GROUPWARE / Test Gate 2      08/20         →  08/21      +1 │
│                                                           │
│ 프로젝트 예상 종료일: 11/10 → 11/10 (변경 없음)            │
│ 정책 결과: 자동 적용 가능                                  │
└────────────────────────────────────────────────────────────┘
```

Approval-required example:

```text
[승인 필요] 프로젝트 예상 종료일 11/10 → 11/12 (+2근무일)
확정 전에는 현재 간트가 변경되지 않습니다.
```

## 9. Project overview KPI placement

Retain the current project name/date/status layout. Add two compact lines under the period/progress line:

```text
기준 12% / 실제 14%  +2%p
기준 종료 11/10 / 예상 11/09  -1근무일
```

Vietnamese:

```text
Kế hoạch gốc 12% / Thực tế 14%  +2đ%
Kết thúc gốc 10/11 / Dự báo 09/11  -1 ngày làm việc
```

Use existing emerald/rose/amber badge colors. Positive progress variance is not always green if schedule risk worsened; progress and schedule variance are displayed independently.

## 10. Project detail Gantt layers

```text
Task row
Baseline  ─ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ─  gray dashed outline
Forecast       ━━━━━━━━━━━━━━━━━━━         current status solid track
Actual         ███████                     filled accepted progress
                                              [+2일]
```

Layer rules:

- Baseline: thin gray outline/dashed, always immutable.
- Confirmed forecast: current solid bar using existing status colors.
- Actual: current progress fill within the forecast bar.
- Tentative forecast: optional thin violet dashed comparison only while preview/approval panel is open.
- Variance badge: signed workdays (`-1일`, `+2일`), not raw calendar days.
- Clicking the badge opens Adjustment History filtered to the Task.
- Holiday/leave hatch remains behind all schedule layers with existing z-index conventions.

## 11. Adjustment History panel

Reuse the visual language of `ScheduleShiftHistoryModal`.

Show:

- reason and worklog link;
- actor and subject employee;
- created/applied/approved timestamps in viewer timezone with source employee local date;
- before/after task dates and project end;
- affected tasks count;
- approval status;
- revert relationship;
- engine/policy version.

Do not show raw JSON as the primary view. JSON snapshots are diagnostic details behind an expandable section.

## 12. Manager workspace

Add a manager-only page or drawer accessible from the existing header:

```text
팀 업무일지  08/12
[제출 4] [마감 대기 2] [미작성 1] [승인 대기 3]

직원              상태        일정 영향              조치
Thanh Phuong      제출        Project end +2일       [검토]
Manh Cuong        미작성      계산 안 함              [알림]
Quoc Nhut         마감 대기   -                       [보기]
```

Subsections:

- submission status by employee local date;
- grouped schedule adjustment notifications;
- pending approvals;
- per-employee adjustment history;
- delegated worklog action with mandatory `on_behalf_of` display.

## 13. Executive view

CEO/COO retain project list, detail, history, KPI, and print. Hide:

- Morning/EOD buttons;
- edit/delete/assignment/calendar mutations;
- approval/reject/revert actions;
- integration key management unless separately authorized.

The employee selector is labeled `조회 대상` and only filters content.

## 14. Notification UI

### In-app notification center

One adjustment correlation produces one summary item, not unbounded task alerts.

```text
[승인 필요] Thanh Phuong · GROUPWARE
타 프로젝트 업무로 3개 Task 변경, 프로젝트 종료 +2근무일
08/12 업무일지 · 변경 이력 보기 · 승인 검토
```

Expanding the item shows Task impacts. Daily digest groups by employee and project.

Initial subscription recipients are created through supervisor/subscription data, not names in code. The desired operating relationship for the pilot is that Viet QS schedule changes notify 유종욱 실장 and 박용진 수석.

## 15. KR/VN terminology

| Key | Korean | Vietnamese |
|---|---|---|
| Worklog | 업무일지 | Nhật ký công việc |
| Morning | 업무 시작 | Bắt đầu công việc |
| EOD | 업무 마감 | Kết thúc ngày làm việc |
| Planned minutes | 계획시간 | Thời gian dự kiến |
| Actual minutes | 실제시간 | Thời gian thực tế |
| Remaining estimate | 잔여 예상시간 | Thời gian còn lại ước tính |
| Expected deliverable | 예상 산출물 | Sản phẩm dự kiến |
| Work result | 수행내용 | Kết quả công việc |
| Blocker | 방해요인 | Trở ngại |
| Completion report | 완료 보고 | Báo cáo hoàn thành |
| Impact preview | 일정 변경 예상 | Dự kiến ảnh hưởng lịch trình |
| Approval required | 승인 필요 | Cần phê duyệt |
| Confirmed forecast | 확정 예상 일정 | Lịch dự báo đã xác nhận |
| Tentative forecast | 검토 중 예상 일정 | Lịch dự báo đang xem xét |
| Baseline | 기준 계획 | Kế hoạch gốc |
| Actual | 실제 수행 | Thực tế thực hiện |
| Missing EOD | 마감 미작성 | Chưa nộp cuối ngày |

Translation keys belong in the existing `src/i18n` dictionaries; business statuses sent by the API remain stable language-neutral codes.

## 16. Validation and empty/error states

- Duplicate task: focus existing entry, `이미 오늘 업무일지에 추가된 작업입니다.`
- Missing remaining estimate: allow submit only according to fallback policy; show source/confidence.
- Missing Primary: block authoritative progress, allow Support minutes/evidence.
- Offline/retry: preserve draft locally, submit with same idempotency key.
- Version conflict: keep entered worklog, refresh preview, explain changed forecast.
- Missing EOD: show status/notification only; no inferred actual or forecast mutation.
- Engine cannot calculate: facts may be saved, adjustment remains `CALCULATION_FAILED` for manager resolution.

## 17. Accessibility and responsive rules

- Minimum touch target 44 px on mobile.
- Do not encode baseline/forecast/actual only by color; use line style and labels.
- Badges include signed text and screen-reader labels.
- Drawer traps focus and restores it to the opening button.
- Tables have compact card equivalents on mobile.
- Date/time labels state timezone when actor and employee differ.
- Print reports display confirmed forecast only by default; a separately labeled variance report may include baseline comparisons.

## 18. Checkpoint 2 QA Harness binding

The non-menu route `/qa/daily-worklog` is the temporary verification surface, not the final employee drawer. It exposes the authenticated TEST ACTOR, employee-local date, office timezone/hours/lunch, effective capacity, assigned Task role, Morning/EOD API controls, gap/overtime state, Revision/Audit, and Task Actual aggregate. It displays `CHECKPOINT2_ACTUAL_CAPACITY_ONLY_FORECAST_UNCHANGED` and never claims forecast recalculation.

- TEST ACTOR and selected-view employee remain separate headers; changing view context does not grant writes.
- Primary sees progress/remaining/completion inputs. Support has those controls disabled and the server also returns `SUPPORT_PROGRESS_FORBIDDEN`.
- CEO/COO see the harness in read-only verification mode; server write APIs return `WORKLOG_READ_ONLY_ACTOR` with HTTP 403.
- KR and VN labels are selected from the actor's `ui_language`; stable API codes remain language-independent.
