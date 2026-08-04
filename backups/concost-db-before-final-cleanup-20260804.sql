PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_initial_schema.sql','2026-08-04 08:46:51');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_seed_data.sql','2026-08-04 08:46:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003_add_workers_and_editor_tracking.sql','2026-08-04 09:12:20');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0004_actual_workers_project_archive_i18n.sql','2026-08-04 11:06:16');
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
, status TEXT NOT NULL DEFAULT 'ACTIVE', completed_at DATE, completed_by_name TEXT, name_ko TEXT, name_vi TEXT, source_language TEXT, translation_status TEXT NOT NULL DEFAULT 'PENDING', translation_error TEXT);
INSERT INTO "projects" ("id","name","start_date","end_date","progress","created_at","updated_at","status","completed_at","completed_by_name","name_ko","name_vi","source_language","translation_status","translation_error") VALUES('prj_1','ERP 그룹웨어 구축 21단게 작업진행','2026-07-01','2026-09-15',65,'2026-08-04 08:47:09','2026-08-04 11:41:39','ACTIVE',NULL,NULL,'ERP 그룹웨어 구축 21단게 작업진행','ERP Groupware Xây dựng 21Làm việc đơn giản','ko','COMPLETED',NULL);
INSERT INTO "projects" ("id","name","start_date","end_date","progress","created_at","updated_at","status","completed_at","completed_by_name","name_ko","name_vi","source_language","translation_status","translation_error") VALUES('prj_2','개발팀 간트 스케줄러','2026-07-15','2026-08-31',50,'2026-08-04 08:47:09','2026-08-04 08:47:09','ACTIVE',NULL,NULL,'개발팀 간트 스케줄러','Đội ngũ phát triển Gantt Scheduler','ko','COMPLETED',NULL);
INSERT INTO "projects" ("id","name","start_date","end_date","progress","created_at","updated_at","status","completed_at","completed_by_name","name_ko","name_vi","source_language","translation_status","translation_error") VALUES('prj_3','현장 견적 툴박스','2026-06-01','2026-08-15',90,'2026-08-04 08:47:09','2026-08-04 08:47:09','ACTIVE',NULL,NULL,'현장 견적 툴박스','Vị trí của hộp Tools','ko','COMPLETED',NULL);
INSERT INTO "projects" ("id","name","start_date","end_date","progress","created_at","updated_at","status","completed_at","completed_by_name","name_ko","name_vi","source_language","translation_status","translation_error") VALUES('prj_4','통합 계정 관리 SSO','2026-08-01','2026-10-15',20,'2026-08-04 08:47:09','2026-08-04 08:47:09','ACTIVE',NULL,NULL,'통합 계정 관리 SSO','Quản lý tài khoản tích hợp SSO','ko','COMPLETED',NULL);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
, created_by_name TEXT, updated_by_name TEXT, task_name_ko TEXT, task_name_vi TEXT, source_language TEXT, translation_status TEXT NOT NULL DEFAULT 'PENDING', translation_error TEXT);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_1_1','prj_1','김개발','요구사항 분석 및 DB 설계','2026-07-01','2026-07-15',100,'2026-08-04 08:47:09','2026-08-04 08:47:09','김개발','김개발','요구사항 분석 및 DB 설계','Phân tích yêu cầu và thiết kế DB','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_1_2','prj_1','김개발','프로젝트 목록 및 관리 화면','2026-07-16','2026-08-10',70,'2026-08-04 08:47:09','2026-08-04 08:47:09','김개발','김개발','프로젝트 목록 및 관리 화면','Danh sách dự án và quản lý','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_1_3','prj_1','박개발','인사/회계 연동 API 개발','2026-07-15','2026-08-20',60,'2026-08-04 08:47:09','2026-08-04 08:47:09','박개발','박개발','인사/회계 연동 API 개발','Phát triển API kế toán / kế toán','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_1_4','prj_1','정검증','ERP 통합 테스트 및 버그 수정','2026-08-15','2026-09-15',30,'2026-08-04 08:47:09','2026-08-04 08:47:09','정검증','정검증','ERP 통합 테스트 및 버그 수정','Kiểm tra tích hợp ERP và sửa lỗi','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_2_1','prj_2','이프론트','전체 프로젝트 간트 화면 개발','2026-07-15','2026-08-10',80,'2026-08-04 08:47:09','2026-08-04 08:47:09','이프론트','이프론트','전체 프로젝트 간트 화면 개발','Toàn bộ dự án sẽ được phát triển','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_2_2','prj_2','이프론트','작업자 세부 일정 간트 화면 개발','2026-07-25','2026-08-20',60,'2026-08-04 08:47:09','2026-08-04 08:47:09','이프론트','이프론트','작업자 세부 일정 간트 화면 개발','Nhân viên làm việc theo thời gian phát triển.','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_2_3','prj_2','최백엔드','Cloudflare D1 REST API 구축','2026-07-20','2026-08-15',70,'2026-08-04 08:47:09','2026-08-04 08:47:09','최백엔드','최백엔드','Cloudflare D1 REST API 구축','Xây dựng Cloudflare D1 REST API','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_2_4','prj_2','김개발','일별 상태 색상 입력 팝업 연동','2026-08-01','2026-08-25',40,'2026-08-04 08:47:09','2026-08-04 08:47:09','김개발','김개발','일별 상태 색상 입력 팝업 연동','Màn hình màu pop-up','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_3_1','prj_3','박개발','도면 파싱 파이프라인 연동','2026-06-01','2026-07-15',100,'2026-08-04 08:47:09','2026-08-04 08:47:09','박개발','박개발','도면 파싱 파이프라인 연동','Hoạt động giải trí gần Fishing Pipe Line','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_3_2','prj_3','최백엔드','견적서 PDF 자동 생성 엔진','2026-07-01','2026-08-15',80,'2026-08-04 08:47:09','2026-08-04 08:47:09','최백엔드','최백엔드','견적서 PDF 자동 생성 엔진','Đánh giá PDF tự động tạo động cơ','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_4_1','prj_4','최백엔드','OAuth2 / Cloudflare Access 인증','2026-08-01','2026-09-10',30,'2026-08-04 08:47:09','2026-08-04 08:47:09','최백엔드','최백엔드','OAuth2 / Cloudflare Access 인증','Chứng nhận OAuth2 / Cloudflare Access','ko','COMPLETED',NULL);
INSERT INTO "tasks" ("id","project_id","worker_name","task_name","start_date","end_date","progress","created_at","updated_at","created_by_name","updated_by_name","task_name_ko","task_name_vi","source_language","translation_status","translation_error") VALUES('tsk_4_2','prj_4','이프론트','SSO 권한 관리 프론트 UI','2026-08-15','2026-10-15',10,'2026-08-04 08:47:09','2026-08-04 08:47:09','이프론트','이프론트','SSO 권한 관리 프론트 UI','SSO quyền quản lý trước UI','ko','COMPLETED',NULL);
CREATE TABLE daily_status (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('NONE', 'IN_PROGRESS', 'COMPLETED', 'ISSUE')),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by_name TEXT,
  UNIQUE(task_id, work_date)
);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_1','tsk_2_1','2026-08-01','COMPLETED','2026-08-04 08:47:09',NULL);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_2','tsk_2_1','2026-08-02','COMPLETED','2026-08-04 08:47:09',NULL);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_3','tsk_2_1','2026-08-03','IN_PROGRESS','2026-08-04 08:47:09',NULL);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_4','tsk_2_1','2026-08-04','IN_PROGRESS','2026-08-04 08:47:09',NULL);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_5','tsk_2_2','2026-08-03','IN_PROGRESS','2026-08-04 08:47:09',NULL);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_6','tsk_2_2','2026-08-04','ISSUE','2026-08-04 08:47:09',NULL);
INSERT INTO "daily_status" ("id","task_id","work_date","status","updated_at","updated_by_name") VALUES('st_7','tsk_2_3','2026-08-04','COMPLETED','2026-08-04 08:47:09',NULL);
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "workers" ("id","name","is_active","sort_order","created_at","updated_at") VALUES('wrk_01','유종욱 실장',1,1,'2026-08-04 11:06:16','2026-08-04 11:06:16');
INSERT INTO "workers" ("id","name","is_active","sort_order","created_at","updated_at") VALUES('wrk_02','박용진 수석',1,2,'2026-08-04 11:06:16','2026-08-04 11:06:16');
INSERT INTO "workers" ("id","name","is_active","sort_order","created_at","updated_at") VALUES('wrk_03','Thanh Phuong(탄 프엉)',1,3,'2026-08-04 11:06:16','2026-08-04 11:06:16');
INSERT INTO "workers" ("id","name","is_active","sort_order","created_at","updated_at") VALUES('wrk_04','Manh Cuong(끄엉)',1,4,'2026-08-04 11:06:16','2026-08-04 11:06:16');
INSERT INTO "workers" ("id","name","is_active","sort_order","created_at","updated_at") VALUES('wrk_05','Quoc Nhut(꾸옥 느엿)',1,5,'2026-08-04 11:06:16','2026-08-04 11:06:16');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',4);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_daily_status_task_date ON daily_status(task_id, work_date);
CREATE INDEX idx_projects_status_completed_at ON projects(status, completed_at);
