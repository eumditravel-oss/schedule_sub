-- QA ONLY — Developer Scheduler V3 Checkpoint 3A fixtures.
-- Never apply to production. All entities use a stable [V3 SHADOW QA] prefix.

INSERT OR IGNORE INTO workers (
  id,name,is_active,sort_order,country_code,workweek_profile,access_role,ui_language,
  can_manage_country_calendar,can_manage_integrations,can_manage_schedule_engine
) VALUES
  ('v3qa_worker_kr_a','[V3 SHADOW QA] KR Primary',1,901,'KR','MON_FRI','EDITOR','ko',0,0,0),
  ('v3qa_worker_kr_b','[V3 SHADOW QA] KR Cross Project',1,902,'KR','MON_FRI','EDITOR','ko',0,0,0),
  ('v3qa_worker_vn_a','[V3 SHADOW QA] VN Handoff',1,903,'VN','MON_SAT','EDITOR','vi',0,0,0),
  ('v3qa_worker_cycle','[V3 SHADOW QA] Cycle Worker',1,904,'KR','MON_FRI','EDITOR','ko',0,0,0);

INSERT OR IGNORE INTO projects (
  id,name,start_date,end_date,progress,status,name_ko,name_vi,source_language,translation_status,
  baseline_start_date,baseline_end_date
) VALUES
  ('v3qa_project_main','[V3 SHADOW QA] 조기완료·지연·제약','2026-08-12','2026-09-11',0,'ACTIVE','[V3 SHADOW QA] 조기완료·지연·제약','[V3 SHADOW QA] Hoàn thành sớm, trì hoãn và ràng buộc','ko','COMPLETED','2026-08-12','2026-09-11'),
  ('v3qa_project_cross','[V3 SHADOW QA] Cross-project 충돌','2026-08-12','2026-08-31',0,'ACTIVE','[V3 SHADOW QA] Cross-project 충돌','[V3 SHADOW QA] Xung đột giữa dự án','ko','COMPLETED','2026-08-12','2026-08-31'),
  ('v3qa_project_cycle','[V3 SHADOW QA] Dependency Cycle','2026-08-12','2026-08-31',0,'ACTIVE','[V3 SHADOW QA] Dependency Cycle','[V3 SHADOW QA] Chu kỳ phụ thuộc','ko','COMPLETED','2026-08-12','2026-08-31');

INSERT OR IGNORE INTO task_groups (
  id,project_id,group_name,group_name_ko,group_name_vi,source_language,translation_status,color_key,sort_order,created_by_name
) VALUES
  ('v3qa_group_main','v3qa_project_main','[V3 SHADOW QA] 시나리오','[V3 SHADOW QA] 시나리오','[V3 SHADOW QA] Kịch bản','ko','COMPLETED','ORANGE',1,'checkpoint3a_fixture'),
  ('v3qa_group_cross','v3qa_project_cross','[V3 SHADOW QA] 교차영향','[V3 SHADOW QA] 교차영향','[V3 SHADOW QA] Ảnh hưởng chéo','ko','COMPLETED','VIOLET',1,'checkpoint3a_fixture'),
  ('v3qa_group_cycle','v3qa_project_cycle','[V3 SHADOW QA] Cycle','[V3 SHADOW QA] Cycle','[V3 SHADOW QA] Chu kỳ','ko','COMPLETED','SLATE',1,'checkpoint3a_fixture');

INSERT OR IGNORE INTO tasks (
  id,project_id,task_group_id,task_sort_order,worker_name,primary_worker_id,task_name,start_date,end_date,progress,
  progress_mode,availability_policy,completion_confirmed,schedule_status,created_by_name,updated_by_name,
  task_name_ko,task_name_vi,source_language,translation_status,baseline_start_date,baseline_end_date,schedule_revision
) VALUES
  ('v3qa_task_early_a','v3qa_project_main','v3qa_group_main',1,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','1. 조기 완료 선행','2026-08-12','2026-08-13',100,'STATUS_BASED','ANY_AVAILABLE',1,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','1. 조기 완료 선행','1. Công việc trước hoàn thành sớm','ko','COMPLETED','2026-08-12','2026-08-13',0),
  ('v3qa_task_early_b','v3qa_project_main','v3qa_group_main',2,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','2. 조기 완료 후속','2026-08-14','2026-08-17',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','2. 조기 완료 후속','2. Công việc sau hoàn thành sớm','ko','COMPLETED','2026-08-14','2026-08-17',0),
  ('v3qa_task_not_before','v3qa_project_main','v3qa_group_main',3,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','3. NOT_BEFORE','2026-08-18','2026-08-20',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','3. NOT_BEFORE','3. NOT_BEFORE','ko','COMPLETED','2026-08-18','2026-08-20',0),
  ('v3qa_task_fixed_start','v3qa_project_main','v3qa_group_main',4,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','4. FIXED_START 충돌','2026-08-21','2026-08-24',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','4. FIXED_START 충돌','4. Xung đột FIXED_START','ko','COMPLETED','2026-08-21','2026-08-24',0),
  ('v3qa_task_overtime','v3qa_project_main','v3qa_group_main',5,'[V3 SHADOW QA] KR Cross Project','v3qa_worker_kr_b','5. Pending Overtime','2026-08-25','2026-08-26',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','5. Pending Overtime','5. Tăng ca chờ duyệt','ko','COMPLETED','2026-08-25','2026-08-26',0),
  ('v3qa_task_partial_leave','v3qa_project_main','v3qa_group_main',6,'[V3 SHADOW QA] VN Handoff','v3qa_worker_vn_a','6. 베트남 반차','2026-08-27','2026-08-28',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','6. 베트남 반차','6. Nghỉ nửa ngày Việt Nam','ko','COMPLETED','2026-08-27','2026-08-28',0),
  ('v3qa_task_handoff','v3qa_project_main','v3qa_group_main',7,'[V3 SHADOW QA] VN Handoff','v3qa_worker_vn_a','7. 한국→베트남 인수인계','2026-08-31','2026-09-01',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','7. 한국→베트남 인수인계','7. Bàn giao Hàn Quốc→Việt Nam','ko','COMPLETED','2026-08-31','2026-09-01',0),
  ('v3qa_task_primary_support','v3qa_project_main','v3qa_group_main',8,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','8. Primary + Support','2026-09-02','2026-09-03',25,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','8. Primary + Support','8. Primary + Support','ko','COMPLETED','2026-09-02','2026-09-03',0),
  ('v3qa_task_company_duty','v3qa_project_main','v3qa_group_main',9,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','9. 회사업무 Capacity 0','2026-09-04','2026-09-07',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','9. 회사업무 Capacity 0','9. Công việc công ty Capacity 0','ko','COMPLETED','2026-09-04','2026-09-07',0),
  ('v3qa_task_cross','v3qa_project_cross','v3qa_group_cross',1,'[V3 SHADOW QA] KR Primary','v3qa_worker_kr_a','Cross-project 동일 직원','2026-08-14','2026-08-18',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','Cross-project 동일 직원','Cùng nhân viên giữa dự án','ko','COMPLETED','2026-08-14','2026-08-18',0),
  ('v3qa_task_cycle_a','v3qa_project_cycle','v3qa_group_cycle',1,'[V3 SHADOW QA] Cycle Worker','v3qa_worker_cycle','Cycle A','2026-08-12','2026-08-13',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','Cycle A','Cycle A','ko','COMPLETED','2026-08-12','2026-08-13',0),
  ('v3qa_task_cycle_b','v3qa_project_cycle','v3qa_group_cycle',2,'[V3 SHADOW QA] Cycle Worker','v3qa_worker_cycle','Cycle B','2026-08-14','2026-08-17',0,'STATUS_BASED','ANY_AVAILABLE',0,'SCHEDULED','checkpoint3a_fixture','checkpoint3a_fixture','Cycle B','Cycle B','ko','COMPLETED','2026-08-14','2026-08-17',0);

INSERT OR IGNORE INTO task_assignees (id,task_id,worker_id,assignment_role,allocation_percent,sort_order,assigned_by_name,created_at)
SELECT 'v3qa_assign_' || id,id,primary_worker_id,'PRIMARY',100,0,'checkpoint3a_fixture',CURRENT_TIMESTAMP
FROM tasks WHERE id LIKE 'v3qa_task_%';
INSERT OR IGNORE INTO task_assignees (id,task_id,worker_id,assignment_role,allocation_percent,sort_order,assigned_by_name,created_at)
VALUES ('v3qa_assign_support','v3qa_task_primary_support','v3qa_worker_kr_b','CO_ASSIGNEE',100,1,'checkpoint3a_fixture',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO project_baselines (id,project_id,version,baseline_start_date,baseline_end_date,created_by,note,baseline_status,baseline_project_progress,snapshot_source,actor_mode)
VALUES
  ('v3qa_pb_main','v3qa_project_main',1,'2026-08-12','2026-09-11','checkpoint3a_fixture','[V3 SHADOW QA] Baseline','APPROVED',0,'QA_FIXTURE','SYSTEM_MIGRATION'),
  ('v3qa_pb_cross','v3qa_project_cross',1,'2026-08-12','2026-08-31','checkpoint3a_fixture','[V3 SHADOW QA] Baseline','APPROVED',0,'QA_FIXTURE','SYSTEM_MIGRATION'),
  ('v3qa_pb_cycle','v3qa_project_cycle',1,'2026-08-12','2026-08-31','checkpoint3a_fixture','[V3 SHADOW QA] Baseline','APPROVED',0,'QA_FIXTURE','SYSTEM_MIGRATION');

INSERT OR IGNORE INTO task_baselines (
  id,baseline_id,task_id,baseline_start_date,baseline_end_date,task_group_id,baseline_progress,baseline_status,
  primary_assignment_json,support_assignments_json,proposed_effort_minutes,effort_status
)
SELECT 'v3qa_tb_' || t.id,
  CASE t.project_id WHEN 'v3qa_project_main' THEN 'v3qa_pb_main' WHEN 'v3qa_project_cross' THEN 'v3qa_pb_cross' ELSE 'v3qa_pb_cycle' END,
  t.id,t.start_date,t.end_date,t.task_group_id,t.progress,CASE WHEN t.completion_confirmed=1 THEN 'COMPLETED' ELSE 'PLANNED' END,
  json_object('employee_id',t.primary_worker_id),
  CASE WHEN t.id='v3qa_task_primary_support' THEN json_array(json_object('employee_id','v3qa_worker_kr_b')) ELSE '[]' END,
  CASE t.id WHEN 'v3qa_task_primary_support' THEN 960 WHEN 'v3qa_task_partial_leave' THEN 480 ELSE 840 END,'PROPOSED'
FROM tasks t WHERE t.id LIKE 'v3qa_task_%';

INSERT OR IGNORE INTO schedule_versions (
  id,project_id,baseline_id,version_number,source_type,status,project_forecast_start,project_forecast_end,change_summary,schema_version,created_by,actor_mode
) VALUES
  ('v3qa_fv_main','v3qa_project_main','v3qa_pb_main',1,'INITIAL_BASELINE_CLONE','INITIALIZED','2026-08-12','2026-09-11','[V3 SHADOW QA] Official Forecast','V3_FOUNDATION_1','checkpoint3a_fixture','SYSTEM_MIGRATION'),
  ('v3qa_fv_cross','v3qa_project_cross','v3qa_pb_cross',1,'INITIAL_BASELINE_CLONE','INITIALIZED','2026-08-12','2026-08-31','[V3 SHADOW QA] Official Forecast','V3_FOUNDATION_1','checkpoint3a_fixture','SYSTEM_MIGRATION'),
  ('v3qa_fv_cycle','v3qa_project_cycle','v3qa_pb_cycle',1,'INITIAL_BASELINE_CLONE','INITIALIZED','2026-08-12','2026-08-31','[V3 SHADOW QA] Official Forecast','V3_FOUNDATION_1','checkpoint3a_fixture','SYSTEM_MIGRATION');

INSERT OR IGNORE INTO schedule_version_tasks (
  id,version_id,project_id,task_id,task_group_id,forecast_start,forecast_end,planned_effort_minutes,effort_status,primary_assignment_json,support_assignments_json
)
SELECT 'v3qa_fvt_' || t.id,
  CASE t.project_id WHEN 'v3qa_project_main' THEN 'v3qa_fv_main' WHEN 'v3qa_project_cross' THEN 'v3qa_fv_cross' ELSE 'v3qa_fv_cycle' END,
  t.project_id,t.id,t.task_group_id,t.start_date,t.end_date,
  CASE t.id WHEN 'v3qa_task_primary_support' THEN 960 WHEN 'v3qa_task_partial_leave' THEN 480 ELSE 840 END,
  'PROPOSED',json_object('employee_id',t.primary_worker_id),
  CASE WHEN t.id='v3qa_task_primary_support' THEN json_array(json_object('employee_id','v3qa_worker_kr_b')) ELSE '[]' END
FROM tasks t WHERE t.id LIKE 'v3qa_task_%';

INSERT OR IGNORE INTO daily_worklogs (
  id,employee_id,local_work_date,office_code,timezone,status,current_revision_number,current_eod_revision_id,eod_submitted_at_utc,
  capacity_minutes,actual_recorded_minutes,capacity_variance_minutes,actor_mode,actor_user_id,subject_employee_id,test_session_id
) VALUES
  ('v3qa_worklog_early','v3qa_worker_kr_a','2026-08-12','KR','Asia/Seoul','EOD_SUBMITTED',1,'v3qa_revision_early','2026-08-12T08:00:00.000Z',420,420,0,'TEST_SELECTOR','wrk_02','v3qa_worker_kr_a','CHECKPOINT3A_FIXTURE'),
  ('v3qa_worklog_support','v3qa_worker_kr_b','2026-08-12','KR','Asia/Seoul','EOD_SUBMITTED',1,'v3qa_revision_support','2026-08-12T08:10:00.000Z',420,240,-180,'TEST_SELECTOR','wrk_02','v3qa_worker_kr_b','CHECKPOINT3A_FIXTURE'),
  ('v3qa_worklog_overtime','v3qa_worker_kr_b','2026-08-13','KR','Asia/Seoul','EOD_SUBMITTED',1,'v3qa_revision_overtime','2026-08-13T10:00:00.000Z',420,540,120,'TEST_SELECTOR','wrk_02','v3qa_worker_kr_b','CHECKPOINT3A_FIXTURE');

-- Mark all other elapsed fixture workdays as explicitly submitted with zero recorded minutes.
-- This keeps normal delay/capacity fixtures separate from the missing-Worklog DATA_GAP fixture.
INSERT OR IGNORE INTO daily_worklogs (
  id,employee_id,local_work_date,office_code,timezone,status,current_revision_number,current_eod_revision_id,eod_submitted_at_utc,
  capacity_minutes,actual_recorded_minutes,capacity_variance_minutes,actor_mode,actor_user_id,subject_employee_id,test_session_id
)
SELECT
  'v3qa_worklog_complete_' || w.id,
  w.id,
  '2026-08-11',
  w.country_code,
  CASE w.country_code WHEN 'VN' THEN 'Asia/Ho_Chi_Minh' ELSE 'Asia/Seoul' END,
  'EOD_SUBMITTED',
  1,
  'v3qa_revision_complete_' || w.id,
  '2026-08-11T10:00:00.000Z',
  CASE w.country_code WHEN 'VN' THEN 480 ELSE 420 END,
  0,
  CASE w.country_code WHEN 'VN' THEN -480 ELSE -420 END,
  'TEST_SELECTOR','wrk_02',w.id,'CHECKPOINT3A_FIXTURE'
FROM workers w WHERE w.id LIKE 'v3qa_worker_%';

INSERT OR IGNORE INTO daily_worklog_revisions (
  id,worklog_id,revision_number,phase,created_by_employee_id,created_at,change_type,payload_snapshot,is_effective,actor_mode,actor_user_id,subject_employee_id,test_session_id
) VALUES
  ('v3qa_revision_early','v3qa_worklog_early',1,'EOD','wrk_02','2026-08-12T08:00:00.000Z','MANAGER_CORRECTION','{}',1,'TEST_SELECTOR','wrk_02','v3qa_worker_kr_a','CHECKPOINT3A_FIXTURE'),
  ('v3qa_revision_support','v3qa_worklog_support',1,'EOD','wrk_02','2026-08-12T08:10:00.000Z','MANAGER_CORRECTION','{}',1,'TEST_SELECTOR','wrk_02','v3qa_worker_kr_b','CHECKPOINT3A_FIXTURE'),
  ('v3qa_revision_overtime','v3qa_worklog_overtime',1,'EOD','wrk_02','2026-08-13T10:00:00.000Z','MANAGER_CORRECTION','{}',1,'TEST_SELECTOR','wrk_02','v3qa_worker_kr_b','CHECKPOINT3A_FIXTURE');

INSERT OR IGNORE INTO daily_worklog_revisions (
  id,worklog_id,revision_number,phase,created_by_employee_id,created_at,change_type,payload_snapshot,is_effective,actor_mode,actor_user_id,subject_employee_id,test_session_id
)
SELECT
  'v3qa_revision_complete_' || w.id,
  'v3qa_worklog_complete_' || w.id,
  1,'EOD','wrk_02','2026-08-11T10:00:00.000Z','MANAGER_CORRECTION','{}',1,'TEST_SELECTOR','wrk_02',w.id,'CHECKPOINT3A_FIXTURE'
FROM workers w WHERE w.id LIKE 'v3qa_worker_%';

INSERT OR IGNORE INTO task_actual_contributions (
  id,task_id,project_id,employee_id,worklog_id,revision_id,local_work_date,assignment_role,raw_actual_minutes,approved_actual_minutes,
  progress_before,progress_after,remaining_estimated_minutes,completion_reported,source_type,is_effective,created_at
) VALUES
  ('v3qa_contrib_early','v3qa_task_early_a','v3qa_project_main','v3qa_worker_kr_a','v3qa_worklog_early','v3qa_revision_early','2026-08-12','PRIMARY',420,420,0,100,0,1,'DAILY_WORKLOG_EOD',1,'2026-08-12T08:00:00.000Z'),
  ('v3qa_contrib_support','v3qa_task_primary_support','v3qa_project_main','v3qa_worker_kr_b','v3qa_worklog_support','v3qa_revision_support','2026-08-12','CO_ASSIGNEE',240,240,NULL,NULL,NULL,0,'DAILY_WORKLOG_EOD',1,'2026-08-12T08:10:00.000Z'),
  ('v3qa_contrib_overtime','v3qa_task_overtime','v3qa_project_main','v3qa_worker_kr_b','v3qa_worklog_overtime','v3qa_revision_overtime','2026-08-13','PRIMARY',540,420,0,20,420,0,'DAILY_WORKLOG_EOD',1,'2026-08-13T10:00:00.000Z');

INSERT OR REPLACE INTO task_actual_aggregates (
  task_id,project_id,raw_actual_minutes,approved_actual_minutes,current_progress,remaining_estimated_minutes,completion_reported,
  actual_status,last_actual_work_date,last_effective_worklog_id,progress_source,updated_at
) VALUES
  ('v3qa_task_early_a','v3qa_project_main',420,420,100,0,1,'COMPLETED','2026-08-12','v3qa_worklog_early','PRIMARY_WORKLOG','2026-08-12T08:00:00.000Z'),
  ('v3qa_task_early_b','v3qa_project_main',0,0,0,420,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_not_before','v3qa_project_main',0,0,0,420,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_fixed_start','v3qa_project_main',0,0,0,840,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_overtime','v3qa_project_main',540,420,20,420,0,'IN_PROGRESS','2026-08-13','v3qa_worklog_overtime','PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_partial_leave','v3qa_project_main',0,0,0,480,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_handoff','v3qa_project_main',0,0,0,420,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_primary_support','v3qa_project_main',240,240,25,480,0,'IN_PROGRESS','2026-08-12','v3qa_worklog_support','PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_company_duty','v3qa_project_main',0,0,0,420,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_cross','v3qa_project_cross',0,0,0,840,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_cycle_a','v3qa_project_cycle',0,0,0,420,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP),
  ('v3qa_task_cycle_b','v3qa_project_cycle',0,0,0,420,0,'IN_PROGRESS',NULL,NULL,'PRIMARY_WORKLOG',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO task_completion_events (
  id,project_id,task_id,actual_end_date,source_type,source_detail,generated_by,source_reference_id,actor_mode,actor_user_id,subject_employee_id,test_session_id
) VALUES ('v3qa_completion_early','v3qa_project_main','v3qa_task_early_a','2026-08-12','DAILY_WORKLOG','QA_EARLY_COMPLETION','wrk_02','v3qa_revision_early','TEST_SELECTOR','wrk_02','v3qa_worker_kr_a','CHECKPOINT3A_FIXTURE');

INSERT OR IGNORE INTO employee_capacity_events (
  id,employee_id,local_work_date,event_type,adjustment_minutes,source_type,source_reference_id,approval_status,requires_manager_review,reason,actor_mode,actor_user_id,test_session_id
) VALUES
  ('v3qa_capacity_partial_leave','v3qa_worker_vn_a','2026-08-27','APPROVED_LEAVE',-240,'QA_FIXTURE','V3QA_PARTIAL_LEAVE','EFFECTIVE',0,'[V3 SHADOW QA] Partial leave','TEST_SELECTOR','wrk_02','CHECKPOINT3A_FIXTURE'),
  ('v3qa_capacity_company_duty','v3qa_worker_kr_a','2026-09-04','COMPANY_DUTY',-420,'QA_FIXTURE','V3QA_COMPANY_DUTY','EFFECTIVE',1,'[V3 SHADOW QA] Company duty','TEST_SELECTOR','wrk_02','CHECKPOINT3A_FIXTURE');

INSERT OR IGNORE INTO overtime_candidates (
  id,worklog_id,revision_id,employee_id,local_work_date,raw_actual_minutes,effective_capacity_minutes,candidate_minutes,reason,evidence_json,approval_status,created_at
) VALUES ('v3qa_overtime_pending','v3qa_worklog_overtime','v3qa_revision_overtime','v3qa_worker_kr_b','2026-08-13',540,420,120,'[V3 SHADOW QA] Pending overtime','{}','PENDING_REVIEW','2026-08-13T10:00:00.000Z');

INSERT OR IGNORE INTO task_dependencies (
  dependency_id,project_id,predecessor_task_id,successor_task_id,dependency_type,lag_work_minutes,status,confidence_score,
  confidence_level,proposal_source,proposal_evidence_json,proposed_by,confirmed_at,confirmed_by
) VALUES
  ('v3qa_dep_early','v3qa_project_main','v3qa_task_early_a','v3qa_task_early_b','FINISH_TO_START',0,'CONFIRMED',100,'HIGH','QA_FIXTURE','["ACTUAL_COMPLETION_RELEASE"]','wrk_02','2026-08-12T10:00:00.000Z','wrk_02'),
  ('v3qa_dep_not_before','v3qa_project_main','v3qa_task_early_b','v3qa_task_not_before','FINISH_TO_START',0,'CONFIRMED',100,'HIGH','QA_FIXTURE','["WBS_ADJACENT"]','wrk_02','2026-08-12T10:00:00.000Z','wrk_02'),
  ('v3qa_dep_handoff','v3qa_project_main','v3qa_task_early_a','v3qa_task_handoff','FINISH_TO_START',0,'CONFIRMED',100,'HIGH','QA_FIXTURE','["KR_VN_HANDOFF"]','wrk_02','2026-08-12T10:00:00.000Z','wrk_02'),
  ('v3qa_dep_cycle_a','v3qa_project_cycle','v3qa_task_cycle_a','v3qa_task_cycle_b','FINISH_TO_START',0,'CONFIRMED',100,'HIGH','QA_FIXTURE','["CYCLE_TEST"]','wrk_02','2026-08-12T10:00:00.000Z','wrk_02'),
  ('v3qa_dep_cycle_b','v3qa_project_cycle','v3qa_task_cycle_b','v3qa_task_cycle_a','FINISH_TO_START',0,'CONFIRMED',100,'HIGH','QA_FIXTURE','["CYCLE_TEST"]','wrk_02','2026-08-12T10:00:00.000Z','wrk_02');

INSERT OR IGNORE INTO task_constraints (
  constraint_id,task_id,constraint_type,constraint_date,reason,status,created_by,updated_by
) VALUES
  ('v3qa_constraint_not_before','v3qa_task_not_before','NOT_BEFORE','2026-08-20','[V3 SHADOW QA] NOT_BEFORE','ACTIVE','wrk_02','wrk_02'),
  ('v3qa_constraint_fixed_start','v3qa_task_fixed_start','FIXED_START','2026-08-21','[V3 SHADOW QA] FIXED_START','ACTIVE','wrk_02','wrk_02');

INSERT OR IGNORE INTO project_priorities (project_id,priority_rank,priority_label,effective_from,set_by,reason)
VALUES
  ('v3qa_project_main',1,'[V3 SHADOW QA] Priority 1','2026-08-12','wrk_02','QA_FIXTURE'),
  ('v3qa_project_cross',2,'[V3 SHADOW QA] Priority 2','2026-08-12','wrk_02','QA_FIXTURE'),
  ('v3qa_project_cycle',3,'[V3 SHADOW QA] Priority 3','2026-08-12','wrk_02','QA_FIXTURE');
