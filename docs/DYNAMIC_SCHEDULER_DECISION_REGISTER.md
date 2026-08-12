# Developer Scheduler V3 — Decision Register

This register records both resolved policy and intentionally deferred future decisions. A `RESOLVED` row is authoritative for implementation; historical options remain only as decision context.

## Decision summary

| ID | Decision | Recommendation | Status |
|---|---|---|---|
| D-01 | End-user authentication | Keep selector-based test actor; separate actor/view context in code | RESOLVED |
| D-02 | Base daily capacity | VN 480 min, KR 420 min; 60-minute break is provisional config | RESOLVED |
| D-03 | Planned effort source | Auto-propose baseline valid workdays × office daily task minutes | RESOLVED |
| D-04 | Existing FTE/allocation weights | Keep non-authoritative while deferred | Deferred |
| D-05 | Progress authority | Primary only; audited manager correction/override | RESOLVED |
| D-06 | Completion acceptance | Explicit completion event only; never from date passage | RESOLVED |
| D-07 | Approval mode | `HYBRID_APPROVAL` | RESOLVED |
| D-08 | Retroactive worklogs | Self-edit until next working day 09:00 employee local | RESOLVED |
| D-09 | Missing worklog | No inference; status and manager notification only | RESOLVED |
| D-10 | Meetings/outside/company duty | Minute Actual plus category-specific evidence; no schedule extension in Checkpoint 2 | RESOLVED |
| D-11 | Dependency migration | Candidate-only, manager-reviewed; only CONFIRMED enters Shadow engine | RESOLVED |
| D-12 | Cross-project priority | Manager-defined project priority with stable tie-breakers | RESOLVED |
| D-13 | Primary absence | Manager assigns effective-dated temporary Primary | RESOLVED |
| D-14 | Notification recipients/channels | In-app immediate + daily manager digest; messenger later | RESOLVED |
| D-15 | Baseline governance | Immutable V1; relationship-authorized rebaseline approval | RESOLVED |
| D-16 | Project lifecycle completion | Explicit manager/inspection action after task facts | RESOLVED |
| D-17 | Attachments | Reference metadata first; object storage later | Future checkpoint |
| D-18 | Forecast retention | Retain all headers/events; compact old task snapshots by policy only | Future checkpoint |
| D-19 | Office/timezone model | VN 08:00–17:00; KR 09:00–17:00 with IANA zones | RESOLVED |
| D-20 | Pilot scope | Shadow foundation broadly; GROUPWARE is Checkpoint 1 target | RESOLVED |
| D-21 | Date-based auto completion | Abolished; overdue preserves stored actual and no completion time | RESOLVED |
| D-22 | Corrections | Append Correction Event; never overwrite accepted actual facts | RESOLVED |
| D-23 | Test actor and executives | `TEST_SELECTOR`; CEO/COO view and print only | RESOLVED |
| D-24 | Checkpoint 3A schedule effect | Shadow compute/preview only; official Forecast/Baseline immutable | RESOLVED |

## D-01 — Authenticated actor

**Resolution:** Keep the current selector-based `TEST_SELECTOR` actor for this temporary scheduler. Real account authentication is outside this checkpoint. Code and write events separate `test_actor` from `selected_view_context` and retain `actor_mode`, `actor_user_id`, `subject_employee_id`, and `test_session_id`. Selecting a person is not an authentication claim.

**Question:** What trusted identity provider will establish the actor for worklog writes?

Options:

1. Organization SSO/OIDC.
2. Cloudflare Access identity headers validated by Worker.
3. Application-managed email/password or magic-link login.
4. Continue selected-worker headers.

**Future option:** Cloudflare Access or organization OIDC can replace `TEST_SELECTOR` later without changing the actor contract.

**Impact:** Does not block this temporary scheduler foundation. Every write remains explicitly labeled as test-actor mode.

## D-02 — Daily base capacity

**Resolution:** Office policy is authoritative. Vietnam uses 480 schedulable minutes/day, 08:00–17:00 `Asia/Ho_Chi_Minh`; Korea uses 420, 09:00–17:00 `Asia/Seoul`. `provisional_break_minutes = 60` is stored once with status `PROVISIONAL_CONFIG`, not duplicated in code.

**Question:** What is each office/employee's standard schedulable capacity?

Options:

1. Fixed 480 minutes for everyone.
2. Office-level default with employee override.
3. Shift template by weekday.

**Recommendation:** Option 2 initially, schema-compatible with option 3. Use exact minutes for partial leave, meetings, and duty.

**Impact:** Changes forecast dates and capacity deficit alerts. Must be decided before engine acceptance tests.

## D-03 — Planned effort capture

**Resolution:** Initial effort is auto-proposed as Baseline valid workdays × office daily task minutes. It is `PROPOSED` until a manager confirms it as `CONFIRMED`. Assignment distribution remains separate. Deferred workforce weighting percentages are not used.

**Question:** Is `planned_effort_minutes` mandatory for all new/active Tasks?

Options:

1. Mandatory before engine scheduling.
2. Optional with duration/capacity fallback.
3. Derive only from progress/dates.

**Recommendation:** Mandatory for new Tasks; migrated Tasks may temporarily use a visible low-confidence fallback. Option 3 cannot produce reliable remaining effort.

**Impact:** Determines project progress weights and forecast accuracy.

## D-04 — Existing allocation/FTE percentages

**Question:** When should project/task allocation percentages influence forecast capacity and KPI weights?

Options:

1. Use immediately.
2. Continue deferral; capture minutes first.
3. Remove percentages entirely.

**Recommendation:** Option 2. Existing project allocation percentages remain informational until the weighting policy is approved. Task planned minutes/effort are canonical.

**Impact:** Avoids turning currently provisional percentages into schedule facts. This decision can be revisited without blocking worklog fact capture.

## D-05 — Progress authority

**Resolution:** Primary supplies authoritative task progress. Managers may append audited corrections. Support input never sums into an overall percentage.

**Question:** Who can set Task actual progress?

Options:

1. Sum all assignee percentages.
2. Primary only; manager override.
3. Any assignee's latest value.

**Recommendation:** Option 2. Support workers record minutes/results/blockers only. Option 1 is prohibited.

**Impact:** Requires one effective Primary or an explicit `NEEDS_PRIMARY` state.

## D-06 — Task completion acceptance

**Resolution:** Date passage is never a completion source. Completion requires an explicit Primary report, manager action, configured inspection acceptance, preserved explicit legacy completion, or `LEGACY_BOOTSTRAP` migration fact. Every accepted path creates a completion event.

**Question:** Does Primary 100% report immediately complete a Task?

Options:

1. Immediate explicit completion.
2. Always manager/inspector acceptance.
3. Per-project/per-task inspection policy.

**Recommendation:** Option 3, defaulting to immediate acceptance when inspection is not configured. Every path still creates an explicit completion event.

**Impact:** Determines `COMPLETION_REPORTED` duration and approval workload.

## D-07 — Forecast approval mode

**Resolution:** `HYBRID_APPROVAL`.

**Question:** Which approval mode applies initially?

Options: `AUTO_APPLY`, `HYBRID_APPROVAL`, `ALWAYS_APPROVAL`.

**Recommendation:** HYBRID with conservative defaults: at most one-workday task movement, unchanged project end, no hard constraint/milestone/cross-project effect, non-retroactive, no completion reversal.

**Impact:** Controls manager workload and operational risk. Project-specific override should be supported.

## D-08 — Retroactive worklogs

**Resolution:** An employee may self-edit through 09:00 on the next working day in the employee's local timezone. After that cutoff, manager approval is required. Managers correct by append-only Correction Event.

**Question:** How far back can an employee submit or edit a worklog?

Options:

1. Same local date only.
2. Up to N calendar/workdays; manager approval.
3. Unlimited manager-delegated correction.

**Recommendation:** Employee window of 2 local workdays with mandatory approval; managers may create older audited corrections.

**Impact:** Affects payroll-like audit expectations, version churn, and notification timing.

## D-09 — Missing worklog

**Resolution:** Preserve unknown facts. Do not infer zero, completion, attendance, or delay solely from a missing worklog. Notify through configured manager channels.

**Question:** What happens when EOD is missing?

Options:

1. Infer 0 minutes and delay.
2. Infer planned work completed.
3. Preserve unknown facts; mark missing and notify.

**Recommendation:** Option 3. No actual or forecast mutation until facts or manager action exist.

**Impact:** Forecast may temporarily remain optimistic, but avoids false facts.

## D-10 — Meeting/outside/company duty policy

**Question:** Which categories require approval and which count as project contribution?

Options vary by category.

**Recommendation:**

- same-project meeting/outside work: project contribution, evidence required, no automatic task progress;
- other-project work: record on actual project/task and consume capacity;
- company duty/training: consume capacity and require manager approval when schedule impact exists;
- leave: link leave record, never require meeting minutes.

**Impact:** Determines capacity events and adjustment reason codes.

## D-11 — Existing dependency inference

**Question:** Should WBS/date order automatically become dependencies?

Options:

1. Automatic confirmed chain.
2. Proposed candidates for manager review.
3. No inference; manual entry only.

**Recommendation:** Option 2. Engine ignores candidates until confirmed.

**Impact:** Provides migration assistance without introducing false chains.

## D-12 — Cross-project priority

**Resolution:** Use manager-defined project priority. Missing/equal priority falls to stable documented tie-breakers and manager approval when a project end would move.

**Question:** How are two projects competing for one employee ordered?

Options:

1. Explicit numeric project priority.
2. Earliest deadline.
3. Manager decision for each conflict.
4. Weighted policy combining priority, fixed milestones, and deadlines.

**Recommendation:** Option 4 with stable tie-breakers; use manager approval whenever priority data is missing or a lower-priority project end changes.

**Impact:** Affects every cross-project forecast and must be explainable.

## D-13 — Primary absence and replacement

**Resolution:** A manager assigns an effective-dated temporary Primary. Support is never promoted implicitly.

**Question:** Who owns progress when Primary is absent?

Options:

1. First Support automatically becomes Primary.
2. Effective-dated acting Primary assigned by manager.
3. Manager enters progress until return.

**Recommendation:** Option 2, with option 3 fallback. Never promote Support implicitly.

**Impact:** Requires assignment effective dates/history and acknowledgment of remaining effort.

## D-14 — Notification routing

**Resolution:** In-app immediate notification plus one daily manager digest. Schedule changes are grouped per worklog as an Adjustment Summary, not emitted as task-by-task noise. Messenger is an extension point only. Recipients derive from data-defined supervisor/subscription relationships; names are not hardcoded.

**Question:** How are supervisors and channels configured?

Options:

1. Hardcode names.
2. Supervisor relationship plus subscriptions.
3. Project-level manual recipient list only.

**Recommendation context:** Option 2 with optional project subscription overrides.

Channels: in-app immediate first, daily digest second, groupware messenger later through outbox adapters.

**Impact:** Requires authenticated user mapping and durable notification delivery.

## D-15 — Baseline governance

**Resolution:** Baseline V1 is immutable. A later rebaseline retains every version and requires approval by one person whose role/supervisor relationship is configured as an authorized manager equivalent. Names are never authorization logic.

**Question:** Can a new approved baseline be created after Version 1?

Options:

1. Never.
2. Formal re-baseline with reason/approval while retaining prior versions.
3. Any manager can save the current schedule as baseline.

**Recommendation:** Option 2. Worklogs never re-baseline. Current unrestricted baseline-save behavior must not govern V3.

**Impact:** Determines audit/report comparison and scope change governance.

## D-16 — Project lifecycle completion

**Resolution:** Only an explicit manager/inspection action changes project lifecycle to `COMPLETED`. Date passage and calculated progress never change lifecycle status.

**Question:** When does an active project become `COMPLETED`?

Options:

1. All tasks completed automatically.
2. Explicit manager action after task completion/readiness checks.
3. Inspection acceptance workflow.

**Recommendation:** Option 2 by default, option 3 per project. Time passage and calculated 100% never change lifecycle status.

**Impact:** Preserves current explicit project archive behavior while preventing `COMPLETE_ALL` misuse.

## D-17 — Attachments

**Question:** Where are deliverables/meeting records stored?

Options:

1. External URL/reference only.
2. Cloudflare R2 upload.
3. Future groupware document integration.

**Recommendation:** Option 1 for V1 with an extensible attachment-reference table; R2/integration later.

**Impact:** Reduces first-release scope and security burden.

## D-18 — Forecast version retention

**Question:** How long are per-task forecast snapshots retained?

Options:

1. Forever in D1.
2. Keep all headers/events; archive old task snapshots after a retention period.
3. Keep only current and previous.

**Recommendation:** Option 2 after usage measurement. Never delete Baseline, actual, adjustment, approval, or revert evidence.

**Impact:** Controls D1 growth without breaking auditability.

## D-19 — Office and timezone source

**Resolution:** Vietnam is `Asia/Ho_Chi_Minh`, 08:00–17:00, 480 schedulable minutes. Korea is `Asia/Seoul`, 09:00–17:00, 420 schedulable minutes. The 60-minute break remains `PROVISIONAL_CONFIG`.

**Question:** Is timezone derived from country or stored explicitly?

Options:

1. Country-derived KR/VN only.
2. Explicit office IANA timezone with employee override.

**Recommendation:** Option 2 (`Asia/Seoul`, `Asia/Ho_Chi_Minh` initial data).

**Impact:** Prevents future multi-office and daylight/time-boundary errors.

## D-20 — Pilot scope and activation date

**Resolution:** Checkpoint 1 creates shadow foundation for current projects and uses GROUPWARE (29 Tasks, 2026-08-05–2026-11-10) as the exact baseline/forecast/bootstrap verification target. Daily Worklog writes remain outside this checkpoint.

**Question:** Which project/employees first use worklogs and from what local date?

Options:

1. All active projects at once.
2. GROUPWARE and Viet QS employees first.
3. Shadow-only across all projects.

**Recommendation:** Shadow engine broadly, but enable writes and approvals for GROUPWARE/Viet QS first. Record a future activation local date; prohibit generated worklogs before it.

**Impact:** Defines migration snapshot window, training, and live verification scope.

## D-21 — Date-based auto completion

**Resolution:** Abolished immediately. An expired incomplete Task keeps its stored actual value, has no generated completion time, and is `DELAYED`/overdue. Existing explicit 100%/completed facts are preserved.

## D-22 — Correction semantics

**Resolution:** Never overwrite an accepted worklog/actual fact. Append a Correction Event that links the superseded fact and records actor, subject, reason, test session, and timestamps.

## D-23 — Test actor, selected view, and executives

**Resolution:** The header selector runs in `TEST ACTOR MODE`; interfaces separate actor and viewed employee. CEO/COO can view and print all permitted data but cannot start/end work, enter progress, complete, approve, correct, move schedules, or assign Primary. Write APIs return 403 for these roles.

## Remaining future decisions

D-04 remains intentionally deferred and workforce weighting percentages stay non-authoritative. D-11, D-17, and D-18 belong to later checkpoints. Checkpoint 2 implements the worklog API and temporary QA Harness; the final employee worklog UI and schedule recalculation remain deferred.

## D-24 — Checkpoint 2 worklog fact boundary

**Resolution:** Morning is planning metadata only. EOD is the Actual source. An EOD can be submitted without Morning and records `morning_missing`. Completion is `COMPLETION_REPORTED`, not a schedule-date or Project status mutation.

## D-25 — Capacity and correction granularity

**Resolution:** Regular employees submit 30-minute increments. Managers correct in 15-minute increments. Capacity uses the centralized office/work-calendar source and deduplicated events. Corrections are append-only replacements in effective contribution calculations.
