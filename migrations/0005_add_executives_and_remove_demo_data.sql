-- Migration: 0005_add_executives_and_remove_demo_data.sql
-- 1. Reset Workers Table and Populate 7 Active Members in Exact Order
DELETE FROM workers;

INSERT INTO workers (id, name, is_active, sort_order) VALUES
  ('wrk_00_ceo', 'CEO', 1, 1),
  ('wrk_00_coo', 'COO', 1, 2),
  ('wrk_01', '유종욱 실장', 1, 3),
  ('wrk_02', '박용진 수석', 1, 4),
  ('wrk_03', 'Thanh Phuong(탄 프엉)', 1, 5),
  ('wrk_04', 'Manh Cuong(끄엉)', 1, 6),
  ('wrk_05', 'Quoc Nhut(꾸옥 느엿)', 1, 7);

-- 2. Safely Remove Initial Seed Demo Data (daily_status, tasks, projects)
DELETE FROM daily_status WHERE task_id IN (
  'tsk_1_1', 'tsk_1_2', 'tsk_1_3', 'tsk_1_4',
  'tsk_2_1', 'tsk_2_2', 'tsk_2_3', 'tsk_2_4',
  'tsk_3_1', 'tsk_3_2',
  'tsk_4_1', 'tsk_4_2'
) OR id IN ('st_1', 'st_2', 'st_3', 'st_4', 'st_5', 'st_6', 'st_7');

DELETE FROM tasks WHERE id IN (
  'tsk_1_1', 'tsk_1_2', 'tsk_1_3', 'tsk_1_4',
  'tsk_2_1', 'tsk_2_2', 'tsk_2_3', 'tsk_2_4',
  'tsk_3_1', 'tsk_3_2',
  'tsk_4_1', 'tsk_4_2'
) OR project_id IN ('prj_1', 'prj_2', 'prj_3', 'prj_4');

DELETE FROM projects WHERE id IN ('prj_1', 'prj_2', 'prj_3', 'prj_4');
