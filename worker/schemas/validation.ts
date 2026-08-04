// worker/schemas/validation.ts
import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(1, '프로젝트명을 입력하세요.'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다.'),
  progress: z.number().min(0).max(100).default(0),
});

export const updateProjectSchema = projectSchema.partial();

export const taskSchema = z.object({
  project_id: z.string().min(1, '프로젝트 ID가 필요합니다.'),
  worker_name: z.string().min(1, '작업자명을 입력하세요.'),
  task_name: z.string().min(1, '작업내용을 입력하세요.'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다.'),
  progress: z.number().min(0).max(100).default(0),
});

export const updateTaskSchema = taskSchema.partial();

export const dailyStatusSchema = z.object({
  status: z.enum(['NONE', 'IN_PROGRESS', 'COMPLETED', 'ISSUE']),
});
