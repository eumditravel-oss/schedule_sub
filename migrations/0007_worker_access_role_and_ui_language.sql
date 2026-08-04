-- Migration: 0007_worker_access_role_and_ui_language.sql

ALTER TABLE workers ADD COLUMN access_role TEXT NOT NULL DEFAULT 'EDITOR' CHECK(access_role IN ('VIEWER', 'EDITOR'));
ALTER TABLE workers ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'ko' CHECK(ui_language IN ('ko', 'vi'));

-- Update executive roles (VIEWER)
UPDATE workers SET access_role = 'VIEWER', ui_language = 'ko' WHERE name IN ('CEO', 'COO');

-- Update Korean staff roles (EDITOR, ko)
UPDATE workers SET access_role = 'EDITOR', ui_language = 'ko' WHERE name IN ('유종욱 실장', '박용진 수석');

-- Update Vietnamese staff roles (EDITOR, vi)
UPDATE workers SET access_role = 'EDITOR', ui_language = 'vi' WHERE name IN ('Thanh Phuong(탄 프엉)', 'Manh Cuong(끄엉)', 'Quoc Nhut(꾸옥 느엿)');
