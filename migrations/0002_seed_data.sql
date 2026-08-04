-- 0002_seed_data.sql
-- Seed Data for CON-COST Dev Team Scheduler

-- 1. Projects Seed
INSERT OR REPLACE INTO projects (id, name, start_date, end_date, progress) VALUES
('prj_1', 'ERP 그룹웨어 구축', '2026-07-01', '2026-09-15', 65),
('prj_2', '개발팀 간트 스케줄러', '2026-07-15', '2026-08-31', 50),
('prj_3', '현장 견적 툴박스', '2026-06-01', '2026-08-15', 90),
('prj_4', '통합 계정 관리 SSO', '2026-08-01', '2026-10-15', 20);

-- 2. Tasks Seed
INSERT OR REPLACE INTO tasks (id, project_id, worker_name, task_name, start_date, end_date, progress) VALUES
-- ERP 그룹웨어
('tsk_1_1', 'prj_1', '김개발', '요구사항 분석 및 DB 설계', '2026-07-01', '2026-07-15', 100),
('tsk_1_2', 'prj_1', '김개발', '프로젝트 목록 및 관리 화면', '2026-07-16', '2026-08-10', 70),
('tsk_1_3', 'prj_1', '박개발', '인사/회계 연동 API 개발', '2026-07-15', '2026-08-20', 60),
('tsk_1_4', 'prj_1', '정검증', 'ERP 통합 테스트 및 버그 수정', '2026-08-15', '2026-09-15', 30),

-- 개발팀 간트 스케줄러
('tsk_2_1', 'prj_2', '이프론트', '전체 프로젝트 간트 화면 개발', '2026-07-15', '2026-08-10', 80),
('tsk_2_2', 'prj_2', '이프론트', '작업자 세부 일정 간트 화면 개발', '2026-07-25', '2026-08-20', 60),
('tsk_2_3', 'prj_2', '최백엔드', 'Cloudflare D1 REST API 구축', '2026-07-20', '2026-08-15', 70),
('tsk_2_4', 'prj_2', '김개발', '일별 상태 색상 입력 팝업 연동', '2026-08-01', '2026-08-25', 40),

-- 현장 견적 툴박스
('tsk_3_1', 'prj_3', '박개발', '도면 파싱 파이프라인 연동', '2026-06-01', '2026-07-15', 100),
('tsk_3_2', 'prj_3', '최백엔드', '견적서 PDF 자동 생성 엔진', '2026-07-01', '2026-08-15', 80),

-- 통합 계정 관리 SSO
('tsk_4_1', 'prj_4', '최백엔드', 'OAuth2 / Cloudflare Access 인증', '2026-08-01', '2026-09-10', 30),
('tsk_4_2', 'prj_4', '이프론트', 'SSO 권한 관리 프론트 UI', '2026-08-15', '2026-10-15', 10);

-- 3. Daily Status Seed
INSERT OR REPLACE INTO daily_status (id, task_id, work_date, status) VALUES
('st_1', 'tsk_2_1', '2026-08-01', 'COMPLETED'),
('st_2', 'tsk_2_1', '2026-08-02', 'COMPLETED'),
('st_3', 'tsk_2_1', '2026-08-03', 'IN_PROGRESS'),
('st_4', 'tsk_2_1', '2026-08-04', 'IN_PROGRESS'),
('st_5', 'tsk_2_2', '2026-08-03', 'IN_PROGRESS'),
('st_6', 'tsk_2_2', '2026-08-04', 'ISSUE'),
('st_7', 'tsk_2_3', '2026-08-04', 'COMPLETED');
