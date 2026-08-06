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
  confirm_schedule_cascade: z.boolean().optional(),
});

export const rawTaskSchema = z.object({
  project_id: z.string().min(1, '프로젝트 ID가 필요합니다.'),
  worker_name: z.string().min(1, '작업자명이 필요합니다.'),
  task_name: z.string().min(1, '작업내용을 입력해 주세요.').max(200),
  schedule_status: z.enum(['SCHEDULED', 'UNSCHEDULED']).default('SCHEDULED'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다.').nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다.').nullable().optional(),
  progress: z.number().min(0).max(100).default(0),
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
  task_name_ko: z.string().optional(),
  task_name_vi: z.string().optional(),
  source_language: z.string().optional(),
  translation_status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'MANUAL']).optional(),
  translation_error: z.string().optional(),
  task_group_id: z.string().nullable().optional(),
  task_sort_order: z.number().optional(),
  primary_worker_id: z.string().nullable().optional(),
  assignee_ids: z.array(z.string()).optional(),
  assignees: z.array(z.any()).optional(),
  progress_mode: z.string().optional(),
  availability_policy: z.string().optional(),
  completion_confirmed: z.number().optional(),
});

export const taskSchema = rawTaskSchema.superRefine((data, ctx) => {
  if (data.schedule_status === 'UNSCHEDULED') {
    if (data.start_date || data.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '일정 미정(UNSCHEDULED) 작업은 시작일과 종료일이 없어야(null) 합니다.',
        path: ['start_date'],
      });
    }
  } else {
    // SCHEDULED mode
    if (!data.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '시작일을 입력해 주세요.',
        path: ['start_date'],
      });
    }
    if (!data.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '종료일을 입력해 주세요.',
        path: ['end_date'],
      });
    }
    if (data.start_date && data.end_date && data.start_date > data.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '시작일은 종료일보다 이전이어야 합니다.',
        path: ['start_date'],
      });
    }
  }
});

export const updateTaskSchema = rawTaskSchema.partial().extend({
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
});

export const dailyStatusSchema = z.object({
  status: z.enum(['NONE', 'IN_PROGRESS', 'COMPLETED', 'ISSUE']),
  editor_name: z.string().min(1, '현재 접속자를 먼저 선택해 주세요.'),
});

export const workerSchema = z.object({
  name: z.string().min(1, '작업자 이름을 입력해 주세요.').max(50),
});

export const calendarOverrideSchema = z.object({
  scope_type: z.enum(['COUNTRY', 'WORKER']),
  scope_key: z.string().min(1, '대상 식별자가 필요합니다.'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다.').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다.').optional(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.').optional(),
  override_type: z.enum(['WORK', 'OFF', 'LEAVE']),
  label_ko: z.string().optional(),
  label_vi: z.string().optional(),
  note: z.string().optional(),
  confirm_leave_schedule_cascade: z.boolean().optional(),
  save_leave_without_schedule_shift: z.boolean().optional(),
  editor_name: z.string().optional(),
});

export const restoreScheduleSchema = z.object({
  restore_token: z.string().min(1, '복원 토큰이 필요합니다.'),
  confirm_restore: z.boolean().optional(),
  editor_name: z.string().optional(),
});

export const keepScheduleSchema = z.object({
  restore_token: z.string().min(1, '복원 토큰이 필요합니다.'),
  confirm_keep: z.boolean().optional(),
  editor_name: z.string().optional(),
});
