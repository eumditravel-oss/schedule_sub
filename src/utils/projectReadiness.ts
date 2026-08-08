// src/utils/projectReadiness.ts
import { Project, Task, ProjectWorkerAllocation, Worker, TaskAssignee } from '../types';
import { getPicAssignee } from '../types';

export type ReadinessStatus = 'READY' | 'NEEDS_SETUP' | 'RISK';

export interface ReadinessIssue {
  type:
    | 'PIC_MISSING'
    | 'ALLOCATION_UNSET'
    | 'UNSCHEDULED_TASK'
    | 'OVERDUE_TASK'
    | 'OVERALLOCATED_WORKER'
    | 'TRANSLATION_ERROR'
    | 'TASK_OUTSIDE_RANGE'
    | 'INVALID_WORKER_PROFILE';
  severity: 'NEEDS_SETUP' | 'RISK';
  message_ko: string;
  message_vi: string;
  target_id?: string;
  target_name?: string;
}

export interface ProjectReadinessResult {
  status: ReadinessStatus;
  setup_count: number;
  risk_count: number;
  issues: ReadinessIssue[];
}

export function calculateProjectReadiness(
  project: Project,
  tasks: Task[] = [],
  allocations: ProjectWorkerAllocation[] = [],
  workers: Worker[] = []
): ProjectReadinessResult {
  const issues: ReadinessIssue[] = [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const projectTasks = tasks.filter((t) => t.project_id === project.id);
  const allocatedWorkerIds = new Set(allocations.map((a) => a.worker_id));

  // Identify worker participants in project tasks
  const projectWorkerIds = new Set<string>();
  for (const t of projectTasks) {
    const pic = getPicAssignee(t);
    if (!pic || !pic.worker_id) {
      issues.push({
        type: 'PIC_MISSING',
        severity: 'NEEDS_SETUP',
        message_ko: `작업 [${t.task_name_ko || t.task_name}]에 주 담당자(PIC)가 지정되지 않았습니다.`,
        message_vi: `Công việc [${t.task_name_vi || t.task_name}] chưa có người phụ trách chính (PIC).`,
        target_id: t.id,
        target_name: t.task_name_ko || t.task_name,
      });
    } else {
      projectWorkerIds.add(pic.worker_id);
    }

    const assignees: TaskAssignee[] = t.assignees || [];
    for (const a of assignees) {
      if (a.worker_id) projectWorkerIds.add(a.worker_id);
    }

    if (t.schedule_status === 'UNSCHEDULED' || (!t.start_date && !t.end_date)) {
      issues.push({
        type: 'UNSCHEDULED_TASK',
        severity: 'NEEDS_SETUP',
        message_ko: `작업 [${t.task_name_ko || t.task_name}]의 일정이 미정 상태입니다.`,
        message_vi: `Công việc [${t.task_name_vi || t.task_name}] chưa xếp lịch.`,
        target_id: t.id,
        target_name: t.task_name_ko || t.task_name,
      });
    } else if (t.start_date && t.end_date) {
      if (t.start_date < project.start_date || t.end_date > project.end_date) {
        issues.push({
          type: 'TASK_OUTSIDE_RANGE',
          severity: 'RISK',
          message_ko: `작업 [${t.task_name_ko || t.task_name}]의 일정이 프로젝트 기간(${project.start_date} ~ ${project.end_date})을 벗어났습니다.`,
          message_vi: `Lịch công việc [${t.task_name_vi || t.task_name}] nằm ngoài thời gian dự án.`,
          target_id: t.id,
          target_name: t.task_name_ko || t.task_name,
        });
      }

      const isCompleted = t.actual_progress === 100 || Number(t.completion_confirmed) === 1;
      if (!isCompleted && t.end_date < todayStr) {
        issues.push({
          type: 'OVERDUE_TASK',
          severity: 'RISK',
          message_ko: `작업 [${t.task_name_ko || t.task_name}]의 종료일(${t.end_date})이 경과했습니다.`,
          message_vi: `Công việc [${t.task_name_vi || t.task_name}] đã quá hạn (${t.end_date}).`,
          target_id: t.id,
          target_name: t.task_name_ko || t.task_name,
        });
      }
    }

    if (t.translation_status === 'FAILED' || (t as any).translation_status === 'ERROR') {
      issues.push({
        type: 'TRANSLATION_ERROR',
        severity: 'NEEDS_SETUP',
        message_ko: `작업 [${t.task_name_ko || t.task_name}]의 자동 번역에 오류가 발생했습니다.`,
        message_vi: `Lỗi dịch tự động công việc [${t.task_name_vi || t.task_name}].`,
        target_id: t.id,
        target_name: t.task_name_ko || t.task_name,
      });
    }
  }

  // Check worker allocations unset or profile errors
  for (const wId of Array.from(projectWorkerIds)) {
    const alloc = allocations.find((a) => a.worker_id === wId);
    const wObj = workers.find((w) => w.id === wId);

    if (!alloc || alloc.allocation_percent === undefined || alloc.allocation_percent === null || (alloc.allocation_percent as any) === '') {
      issues.push({
        type: 'ALLOCATION_UNSET',
        severity: 'NEEDS_SETUP',
        message_ko: `작업자 [${wObj?.name || wId}]의 프로젝트 투입 비율이 미설정 상태입니다.`,
        message_vi: `Tỷ lệ phân bổ nhân sự [${wObj?.name || wId}] chưa được thiết lập.`,
        target_id: wId,
        target_name: wObj?.name || wId,
      });
    }

    if (!wObj || !wObj.country_code || !wObj.workweek_profile) {
      issues.push({
        type: 'INVALID_WORKER_PROFILE',
        severity: 'RISK',
        message_ko: `작업자 [${wObj?.name || wId}]의 근무 프로필/국가 설정이 누락되었습니다.`,
        message_vi: `Thiếu hồ sơ lịch làm việc/quốc gia của nhân viên [${wObj?.name || wId}].`,
        target_id: wId,
        target_name: wObj?.name || wId,
      });
    }
  }

  const riskCount = issues.filter((i) => i.severity === 'RISK').length;
  const setupCount = issues.filter((i) => i.severity === 'NEEDS_SETUP').length;

  let status: ReadinessStatus = 'READY';
  if (riskCount > 0) {
    status = 'RISK';
  } else if (setupCount > 0) {
    status = 'NEEDS_SETUP';
  }

  return {
    status,
    setup_count: setupCount,
    risk_count: riskCount,
    issues,
  };
}
