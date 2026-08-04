// worker/schemas/validation.ts
import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(1, '프로젝트명을 입력해 주세요.').max(200),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다.'),
  progress: z.number().min(0).max(100).default(0),
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
  name_ko: z.string().optional(),
  name_vi: z.string().optional(),
  source_language: z.string().optional(),
  translation_status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'MANUAL']).optional(),
  translation_error: z.string().optional(),
});

export const updateProjectSchema = projectSchema.partial().extend({
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
});

export const taskSchema = z.object({
  project_id: z.string().min(1, '프로젝트 ID가 필요합니다.'),
  worker_name: z.string().min(1, '작업자명이 필요합니다.'),
  task_name: z.string().min(1, '작업내용을 입력해 주세요.').max(200),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다.'),
  progress: z.number().min(0).max(100).default(0),
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
  task_name_ko: z.string().optional(),
  task_name_vi: z.string().optional(),
  source_language: z.string().optional(),
  translation_status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'MANUAL']).optional(),
  translation_error: z.string().optional(),
});

export const updateTaskSchema = taskSchema.partial().extend({
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
});

export const dailyStatusSchema = z.object({
  status: z.enum(['NONE', 'IN_PROGRESS', 'COMPLETED', 'ISSUE']),
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
});

export const workerSchema = z.object({
  name: z.string().min(1, '작업자 이름을 입력해 주세요.').max(50),
});
