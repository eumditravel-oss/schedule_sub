# Migration Ledger Reconciliation: 0015–0025

- 점검일: 2026-08-12 KST
- 대상: QA `concost-db-qa`, Production/Test-Live `concost-db`
- 저장소 기준: `c77a8f5f7f7ba76fa37b00f30e7aa54197f358bf`
- 점검 모드: 읽기 전용 (`rows_written = 0`, `changed_db = false`)
- 결론: `MIGRATION_LEDGER_RECONCILIATION_READY`

이 문서는 원장에 파일명을 임의로 추가해 상태를 맞추기 위한 문서가 아니다. 저장소 migration의 의도, 실제 D1 구조, backfill 결과를 항목별로 대조해 재실행 금지 대상을 확정하고, 검증된 조건에서만 원장을 복구하기 위한 근거다.

## 1. 수집 범위와 방법

양쪽 D1에서 다음을 읽기 전용으로 수집했다.

- `sqlite_master`: table, index, trigger, view와 원문 DDL
- 공식 `wrangler d1 export --remote --no-data`: 전체 schema export
- 관련 객체의 `PRAGMA table_info`, `PRAGMA index_list`, `PRAGMA foreign_key_list`
- `d1_migrations`: id, name, applied_at
- 0015·0025 backfill 검증용 aggregate와 allocation history
- 저장소 `migrations/0015*`–`0025*` SHA-256

D1은 동적 `pragma_table_info(m.name)` 조인을 `SQLITE_AUTH`로 거부하므로, PRAGMA는 대상 테이블별 고정 식별자로 실행했다. 모든 성공한 D1 조회는 `rows_written = 0`이었다.

## 2. Schema Fingerprint

| 항목 | QA | Production | 판정 |
|---|---|---|---|
| Raw schema export SHA-256 | `6d0c5a9825afc41f9a428b80d57018e2e82c5cd0c97fafe0bb0d8d59466299bc` | `cc3bd3083e062ca7c17e682e9d822b8ad69dd4e50b42f2c0501822168f1c3c43` | `task_groups` DDL 줄바꿈만 다름 |
| Semantic schema SHA-256 | `e3f4e50e61a773910de265e3e2a30a97c58b9963f2da301272ccd04cb4666d17` | `e3f4e50e61a773910de265e3e2a30a97c58b9963f2da301272ccd04cb4666d17` | 동일 |
| Tables | 32 | 32 | 동일 |
| Indexes | 31 | 31 | 동일 |
| Foreign keys | 13 | 13 | 동일 |
| Triggers | 0 | 0 | 동일 |
| Views | 0 | 0 | 동일 |

Semantic fingerprint는 공백과 `IF NOT EXISTS` 표기 차이를 제거한 DDL 토큰으로 계산했다. Raw export diff는 QA의 여러 줄 `task_groups` 정의와 Production의 한 줄 정의뿐이며 컬럼, 제약, FK는 같다.

관련 18개 테이블의 PRAGMA 결과도 양쪽이 완전히 같다.

| PRAGMA 묶음 | 대상 | 공통 결과 SHA-256 |
|---|---|---|
| 1 | `tasks`, `task_groups`, `task_structure_change_logs`, `conflict_acknowledgements`, `workers`, `task_assignees` | `c63aca2be7733f58efb30accdd7c96aada8ec8a36f5dd565e62d6d2ee294881d` |
| 2 | integration 4종, `project_worker_allocations`, `projects` | `d85ddba547ef45b84514da08f3baccbbbc2b7c07177b6927b725728cd23486bb` |
| 3 | baseline 2종, sync/completion/allocation history, progress mode log | `4b782753c27709e60fd6f4d79420095b47d16c857df23da0ddff2b090245d536` |

## 3. Ledger Fingerprint

양쪽 원장은 이름 기준으로 동일하며 `0001`–`0014` 14행만 기록한다.

| 항목 | QA | Production |
|---|---|---|
| 마지막 기록 | `0014_task_multi_assignees_and_progress_mode.sql` | 동일 |
| 행 수 | 14 | 14 |
| `id + name` SHA-256 | `d7b66e6bb882b76bd3824d65e2a86924ad5e3590a0b8acf63598a14877374227` | 동일 |
| 전체 행 SHA-256 | `2d0c0cb3668891d1d86caf918813268a82586614160d93207c913bfb3f0a0661` | `73370280ec9e3d58864fecfbf5a9f32a7b24b258111286284ec8b7505fa669e8` |

전체 행 지문 차이는 정상적인 `applied_at` 시각 차이다. D1 기본 원장은 checksum 컬럼을 제공하지 않으므로 파일 checksum은 아래 저장소 근거와 별도로 고정한다.

## 4. Migration별 분류

| Migration | SHA-256 | 실제 효과와 증거 | 분류 | 재실행 |
|---|---|---|---|---|
| `0015_add_schedule_revision_to_tasks.sql` | `6667b8bb284f8f77c5a9afecce66e72df91386715fa1fd988da1eb6c95831a77` | `tasks.schedule_revision INTEGER NOT NULL DEFAULT 0` 존재. 동일 컬럼은 이미 기록된 0009에도 정의됨. | `APPLIED_NOT_RECORDED` (중복 효과) | 금지: duplicate column |
| `0015_task_groups_hierarchy.sql` | `61a5080d32a778b16286b885b4dfc5759f69b5329248c2280f0c88cc505b8091` | `task_groups`, task hierarchy 컬럼, group index 2개 존재. 모든 project에 group이 있고 모든 task가 group/Primary를 가짐. | `APPLIED_NOT_RECORDED` | 금지: DDL/backfill 중복 |
| `0016_task_structure_change_logs.sql` | `e2b8bfd2a98ef4f94f7c63eec71f7798a69ff387b9d20ded2c4d1a5e7252da91` | table, project/task index 존재. | `APPLIED_NOT_RECORDED` | 금지 |
| `0017_unscheduled_tasks_support.sql` | `703b42ed41c6be8ee9166c87d47bbaf289c0a124c6f07641a4cd670cd87d74fc` | `tasks.schedule_status NOT NULL DEFAULT 'SCHEDULED'` 존재. | `APPLIED_NOT_RECORDED` | 금지: duplicate column |
| `0018_rebuild_tasks_table_nullable_dates.sql` | `cc6146d664b368f03f3db8016bb59fa875485abbd0a9c042aaab83fc4c72bf93` | `tasks.start_date/end_date` nullable, 재구축 후 컬럼 순서와 FK가 일치. 이후 `schedule_revision`과 0022 컬럼이 추가된 누적 구조. | `APPLIED_NOT_RECORDED` | 절대 금지: DROP/재구축 |
| `0019_cross_project_conflict_acknowledgements.sql` | `502a3013700157c5a93850418fbca94e4aeebdf0c9d86305c0209526815de658` | table, unique, fingerprint/worker index 존재. | `APPLIED_NOT_RECORDED` | 금지 |
| `0020_integration_tables_and_worker_permission.sql` | `5503ac80ded87c1dae6457ead9efd0c5cc4d56de772c3e8467394a44b81449e4` | integration 4 tables, 4 indexes, `workers.can_manage_integrations` 존재. | `APPLIED_NOT_RECORDED` | 금지 |
| `0021_project_worker_allocations.sql` | `7304bbc0f27475d1cf68a90472b3e45512d57324f9804e6868c049300eaba2bc` | table, unique(project,worker), 2 FK, 2 indexes 존재. | `APPLIED_NOT_RECORDED` | 금지 |
| `0022_baseline_and_blocker.sql` | `1dc6071428cf477b4d2529781f5805049ebec33c25c7e562d33053bfe0c4f8c0` | project/task baseline 컬럼, blocker 컬럼, baseline 2 tables와 FK 존재. | `APPLIED_NOT_RECORDED` | 금지: duplicate column/table |
| `0023_integration_sync_runs.sql` | `950cd03afdc3ae141fbab55674e0f6f1fcf71af6df2872082128844c28fa31b1` | table과 모든 컬럼/default 존재. | `APPLIED_NOT_RECORDED` | 금지 |
| `0024_project_completion_audit_logs.sql` | `d9af29a8fdd87c920e118771cad9f33d9be027b9ed7e7a131e8bdf9f2383b15e` | table 존재. Production 6행, QA 310행으로 실제 사용 중. | `APPLIED_NOT_RECORDED` | 금지 |
| `0025_allocation_history.sql` | `6a76e7613e01019d67d54bd67e32d5aeb3a694ca8265ecc16607146baab1099e` | table 존재. Production 초기 snapshot 8건과 이후 CREATE allocation 3건 모두 이력으로 설명됨. | `APPLIED_NOT_RECORDED` | 금지: 초기 snapshot 중복 |

### 4.1 설명된 누적 차이

- `idx_tasks_group`은 `0015_task_groups_hierarchy.sql`에서 생성되지만 `0018`이 `tasks`를 DROP/RENAME하면서 사라진다. 이는 미적용이 아니라 저장소 내 후속 migration의 직접 결과다. 다음 additive migration에서 다시 생성한다.
- `0018`의 새 테이블 정의에는 `schedule_revision`이 없지만 현재 양쪽 D1에는 있다. 0009/중복 0015 효과를 재구축 뒤 복원한 누적 최종 구조이며 두 환경이 동일하다.
- Production allocation 11건 중 `hist_init_*`는 8건이다. 나머지 3건은 0025 이후 생성되어 각각 `CREATE` 이력이 있으며 누락이 아니다.
- 두 개의 `0015` 파일은 이름이 다르므로 D1 ledger에서 별도 migration entry가 된다. 파일명 변경이나 합치기를 하지 않는다.

## 5. 누락 객체와 부분 적용 여부

- 설명되지 않은 누락 table: 없음
- 설명되지 않은 누락 column: 없음
- 설명되지 않은 누락 index: 없음
- FK drift: 없음
- trigger/view drift: 없음
- `PARTIALLY_APPLIED`: 없음
- `UNKNOWN`: 없음
- `SCHEMA_DRIFT`: 없음

`idx_tasks_group`의 부재는 0018의 알려진 결과로 분류하며, 현재 성능/참조 보완 항목이지 원장 복구를 막는 불명 상태가 아니다.

## 6. 안전한 원장 복구 방식

0015–0025 SQL 원문을 재실행하지 않는다. 특히 0018은 `DROP TABLE tasks`를 포함하고, 0025는 초기 history backfill을 다시 만들 수 있다.

복구는 다음 gate를 모두 만족할 때만 환경별로 수행한다.

1. 즉시 전 D1 backup/export와 SHA-256 확보
2. 원장이 정확히 14행이며 `id + name` 지문이 위 값과 일치
3. semantic schema fingerprint가 위 값과 일치
4. 관련 PRAGMA 세 묶음이 위 값과 일치
5. 저장소 migration 12개 파일 checksum이 위 표와 일치
6. 원장 이름 12개를 한 번만 기록하고 post-check에서 26행 확인
7. `wrangler d1 migrations list`가 새 `0026`만 pending으로 표시되는지 확인
8. 감사 보고서에 환경, 이전/이후 지문, backup hash, 실행자를 남김

원장 복구 SQL은 효과가 이미 입증된 파일명만 기록하며 business table을 변경하지 않는다. 조건 하나라도 다르면 `MIGRATION_LEDGER_RECONCILIATION_BLOCKED`로 중단한다.

## 7. Backup/Restore

- QA와 Production 각각 원장 복구 직전 full D1 export를 별도 보관한다.
- 복구는 business data를 바꾸지 않으므로 정상 rollback은 추가된 ledger entry만 정확한 backup/감사 근거로 되돌리는 방식이다.
- business schema/data corruption이 확인된 경우에만 Cloudflare D1 Time Travel 또는 검증된 full export를 사용한다.
- 원장 복구 이후 0026 적용 전 다시 schema/row count를 확인한다.

## 8. 다음 Migration 번호

다음 파일 번호는 `0026`으로 확정한다.

근거:

- 저장소의 가장 높은 번호는 0025다.
- 두 0015 파일은 기존 파일명을 유지한다.
- 검증된 원장 복구 후 두 0015 파일을 포함한 12개 이름이 기록된다.
- 숫자 prefix는 migration id가 아니라 정렬 가능한 파일 naming convention이며, 신규 파일은 중복 없는 `0026_v3_foundation.sql`을 사용한다.

## 9. Stage A 판정

QA/Production의 실제 cumulative schema는 0025 equivalent이고 원장만 0014에 머문 상태다. 설명되지 않은 차이, `UNKNOWN`, 안전하지 않은 `PARTIALLY_APPLIED`가 없으므로 다음 단계 진행 조건을 만족한다. 단, 0026 적용 전에 본 문서의 gate를 이용한 환경별 backup과 원장 복구가 선행되어야 한다.
