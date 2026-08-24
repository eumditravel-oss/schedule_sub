import { describe, expect, it } from 'vitest';
import { taskSchema, updateTaskSchema } from '../worker/schemas/validation';

const longVietnameseTaskName = [
  'OPTION B – PROJECT INTAKE VÀ BÀN GIAO – BACKEND',
  'Khi báo giá được xác nhận, chuẩn bị dữ liệu, rà soát yêu cầu,',
  'bàn giao phạm vi và ghi nhận đầy đủ các điều kiện triển khai.',
].join(' ').repeat(4);

describe('task name validation', () => {
  it('accepts task names longer than the legacy 200-character limit on create', () => {
    expect(longVietnameseTaskName.length).toBeGreaterThan(200);

    const result = taskSchema.safeParse({
      project_id: 'prj_01',
      worker_name: 'Thanh Phuong',
      task_name: longVietnameseTaskName,
      schedule_status: 'SCHEDULED',
      start_date: '2026-08-22',
      end_date: '2026-08-30',
      editor_name: 'Thanh Phuong',
    });

    expect(result.success).toBe(true);
  });

  it('accepts task names longer than the legacy 200-character limit on update', () => {
    const result = updateTaskSchema.safeParse({
      task_name: longVietnameseTaskName,
      editor_name: 'Manh Cuong',
    });

    expect(result.success).toBe(true);
  });

  it('still rejects an empty task name', () => {
    const result = updateTaskSchema.safeParse({
      task_name: '',
      editor_name: 'Manh Cuong',
    });

    expect(result.success).toBe(false);
  });
});
