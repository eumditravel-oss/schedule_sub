// src/utils/projectReadiness.ts
import { Project, Task, ProjectWorkerAllocation, Worker } from '../types';
import { getKoreaDateString } from './dateUtils';

export type ReadinessIssueType =
  | 'PIC_MISSING'
  | 'ALLOCATION_UNSET'
  | 'UNSCHEDULED_TASK'
  | 'OVERDUE_TASK'
  | 'TRANSLATION_ERROR'
  | 'TASK_OUTSIDE_RANGE'
  | 'INVALID_WORKER_PROFILE'
  | 'PROJECT_COMPLETION_INCONSISTENCY';

export interface ReadinessIssue {
  type: ReadinessIssueType;
  severity: 'RISK' | 'NEEDS_SETUP';
  title_ko: string;
  title_vi: string;
  description_ko: string;
  description_vi: string;
  target_id?: string;
  target_name?: string;
}

export interface ReadinessGroupSummary {
  type: ReadinessIssueType;
  severity: 'RISK' | 'NEEDS_SETUP';
  count: number;
  label_ko: string;
  label_vi: string;
  tasks?: Task[];
  workers?: Worker[];
}

export type ReadinessStatus = 'READY' | 'NEEDS_SETUP' | 'RISK';

export interface ProjectReadiness {
  status: ReadinessStatus;
  badge_text_ko: string;
  badge_text_vi: string;
  badge_color_class: string;
  total_issue_count: number;
  category_count: number;
  setup_count: number;
  risk_count: number;
  issues: ReadinessIssue[];
  issue_groups: Record<string, ReadinessGroupSummary>;
}

export function calculateProjectReadiness(
  project: Project,
  tasks: Task[],
  allocations: ProjectWorkerAllocation[],
  workers: Worker[]
): ProjectReadiness {
  const issues: ReadinessIssue[] = [];
  const groupsMap: Record<string, ReadinessGroupSummary> = {};

  const projectTasks = tasks.filter((t) => t.project_id === project.id);
  const todayStr = getKoreaDateString();
  const isCompletedProject = project.status === 'COMPLETED';

  // 1. Audit Completed Project Data Consistency
  if (isCompletedProject) {
    const incompleteTasks = projectTasks.filter(
      (t) => (t.actual_progress ?? t.progress ?? 0) < 100 && Number(t.completion_confirmed) !== 1
    );

    if (incompleteTasks.length > 0) {
      issues.push({
        type: 'PROJECT_COMPLETION_INCONSISTENCY',
        severity: 'RISK',
        title_ko: '프로젝트 완료 불일치',
        title_vi: 'Không đồng bộ hoàn thành dự án',
        description_ko: `프로젝트는 완료 상태이지만 미완료 세부 작업이 ${incompleteTasks.length}건 존재합니다.`,
        description_vi: `Dự án đã hoàn thành nhưng còn ${incompleteTasks.length} công việc chưa hoàn thành.`,
      });

      groupsMap['PROJECT_COMPLETION_INCONSISTENCY'] = {
        type: 'PROJECT_COMPLETION_INCONSISTENCY',
        severity: 'RISK',
        count: incompleteTasks.length,
        label_ko: `완료 불일치 (${incompleteTasks.length}건)`,
        label_vi: `Không đồng bộ (${incompleteTasks.length})`,
        tasks: incompleteTasks,
      };
    }
  } else {
    // 2. Audit ACTIVE Project Operational Schedule Risks
    const overdueTasks: Task[] = [];
    const unscheduledTasks: Task[] = [];
    const outsideRangeTasks: Task[] = [];
    const picMissingTasks: Task[] = [];
    const translationErrTasks: Task[] = [];

    projectTasks.forEach((task) => {
      // PIC Check
      const hasPic = Boolean(
        task.primary_worker_id || (task.assignees && task.assignees.some((a) => a.assignment_role === 'PRIMARY'))
      );
      if (!hasPic) {
        picMissingTasks.push(task);
        issues.push({
          type: 'PIC_MISSING',
          severity: 'NEEDS_SETUP',
          title_ko: '주 담당자(PIC) 미배정',
          title_vi: 'Chưa phân công PIC',
          description_ko: `작업 '${task.task_name}'에 주 담당자(PIC)가 배정되지 않았습니다.`,
          description_vi: `Công việc '${task.task_name}' chưa có người phụ trách chính.`,
          target_id: task.id,
          target_name: task.task_name,
        });
      }

      // Schedule Status & Overdue Check
      if (task.schedule_status === 'UNSCHEDULED' || (!task.start_date && !task.end_date)) {
        unscheduledTasks.push(task);
        issues.push({
          type: 'UNSCHEDULED_TASK',
          severity: 'NEEDS_SETUP',
          title_ko: '일정 미정 작업',
          title_vi: 'Công việc chưa có lịch',
          description_ko: `작업 '${task.task_name}'의 시작일 및 종료일이 설정되지 않았습니다.`,
          description_vi: `Công việc '${task.task_name}' chưa 설정 ngày bắt đầu/kết thúc.`,
          target_id: task.id,
          target_name: task.task_name,
        });
      } else if (
        task.end_date &&
        task.end_date < todayStr &&
        (task.actual_progress ?? task.progress ?? 0) < 100 &&
        Number(task.completion_confirmed) !== 1
      ) {
        overdueTasks.push(task);
        issues.push({
          type: 'OVERDUE_TASK',
          severity: 'RISK',
          title_ko: '기한 경과 작업',
          title_vi: 'Công việc quá hạn',
          description_ko: `작업 '${task.task_name}'의 종료일(${task.end_date})이 경과했습니다.`,
          description_vi: `Công việc '${task.task_name}' đã quá hạn (${task.end_date}).`,
          target_id: task.id,
          target_name: task.task_name,
        });
      }

      // Range Check
      if (task.start_date && task.end_date && project.start_date && project.end_date) {
        if (task.start_date < project.start_date || task.end_date > project.end_date) {
          outsideRangeTasks.push(task);
          issues.push({
            type: 'TASK_OUTSIDE_RANGE',
            severity: 'RISK',
            title_ko: '프로젝트 기간 외 작업',
            title_vi: 'Công việc ngoài thời gian dự án',
            description_ko: `작업 '${task.task_name}'의 일정이 프로젝트 기간을 벗어났습니다.`,
            description_vi: `Lịch công việc '${task.task_name}' vượt quá thời gian dự án.`,
            target_id: task.id,
            target_name: task.task_name,
          });
        }
      }

      // Translation Check
      if (task.translation_status === 'FAILED') {
        translationErrTasks.push(task);
        issues.push({
          type: 'TRANSLATION_ERROR',
          severity: 'NEEDS_SETUP',
          title_ko: '자동 번역 실패',
          title_vi: 'Lỗi dịch tự động',
          description_ko: `작업 '${task.task_name}'의 번역에 실패했습니다.`,
          description_vi: `Lỗi dịch tự động công việc '${task.task_name}'.`,
          target_id: task.id,
          target_name: task.task_name,
        });
      }
    });

    // Populate Groups
    if (overdueTasks.length > 0) {
      groupsMap['OVERDUE_TASK'] = {
        type: 'OVERDUE_TASK',
        severity: 'RISK',
        count: overdueTasks.length,
        label_ko: `기한 경과 (${overdueTasks.length}건)`,
        label_vi: `Quá hạn (${overdueTasks.length})`,
        tasks: overdueTasks,
      };
    }
    if (picMissingTasks.length > 0) {
      groupsMap['PIC_MISSING'] = {
        type: 'PIC_MISSING',
        severity: 'NEEDS_SETUP',
        count: picMissingTasks.length,
        label_ko: `PIC 미배정 (${picMissingTasks.length}건)`,
        label_vi: `Chưa phân công (${picMissingTasks.length})`,
        tasks: picMissingTasks,
      };
    }
    if (unscheduledTasks.length > 0) {
      groupsMap['UNSCHEDULED_TASK'] = {
        type: 'UNSCHEDULED_TASK',
        severity: 'NEEDS_SETUP',
        count: unscheduledTasks.length,
        label_ko: `일정 미정 (${unscheduledTasks.length}건)`,
        label_vi: `Chưa có lịch (${unscheduledTasks.length})`,
        tasks: unscheduledTasks,
      };
    }
    if (outsideRangeTasks.length > 0) {
      groupsMap['TASK_OUTSIDE_RANGE'] = {
        type: 'TASK_OUTSIDE_RANGE',
        severity: 'RISK',
        count: outsideRangeTasks.length,
        label_ko: `기간 외 일정 (${outsideRangeTasks.length}건)`,
        label_vi: `Ngoài thời gian (${outsideRangeTasks.length})`,
        tasks: outsideRangeTasks,
      };
    }

    // Allocation Unset Check
    const unallocatedWorkers: Worker[] = [];
    const allocatedWorkerIds = new Set(allocations.map((a) => a.worker_id));

    workers.forEach((w) => {
      if (w.is_active) {
        const isAssigned = projectTasks.some(
          (t) => (t.assignee_ids || []).includes(w.id) || t.primary_worker_id === w.id
        );
        if (isAssigned && !allocatedWorkerIds.has(w.id)) {
          unallocatedWorkers.push(w);
          issues.push({
            type: 'ALLOCATION_UNSET',
            severity: 'NEEDS_SETUP',
            title_ko: '작업자 투입률 미설정',
            title_vi: 'Chưa 설정 tỷ lệ phân bổ',
            description_ko: `작업자 '${w.name}'의 프로젝트 투입 비율이 설정되지 않았습니다.`,
            description_vi: `Tỷ lệ phân bổ cho '${w.name}' chưa được thiết lập.`,
            target_id: w.id,
            target_name: w.name,
          });
        }
      }
    });

    if (unallocatedWorkers.length > 0) {
      groupsMap['ALLOCATION_UNSET'] = {
        type: 'ALLOCATION_UNSET',
        severity: 'NEEDS_SETUP',
        count: unallocatedWorkers.length,
        label_ko: `투입률 미설정 (${unallocatedWorkers.length}명)`,
        label_vi: `Chưa phân bổ (${unallocatedWorkers.length})`,
        workers: unallocatedWorkers,
      };
    }
  }

  // Calculate Aggregates
  const riskCount = issues.filter((i) => i.severity === 'RISK').length;
  const setupCount = issues.filter((i) => i.severity === 'NEEDS_SETUP').length;
  const categoryCount = Object.keys(groupsMap).length;

  let status: ReadinessStatus = 'READY';
  let badge_text_ko = '정상';
  let badge_text_vi = 'Hoàn hảo';
  let badge_color_class = 'bg-emerald-100 text-emerald-800 border-emerald-300';

  if (isCompletedProject) {
    if (riskCount > 0) {
      const group = groupsMap['PROJECT_COMPLETION_INCONSISTENCY'];
      const unconfCount = group ? group.count : riskCount;
      status = 'RISK';
      badge_text_ko = `완료 불일치 ${unconfCount}`;
      badge_text_vi = `Không đồng bộ ${unconfCount}`;
      badge_color_class = 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold';
    } else {
      status = 'READY';
      badge_text_ko = '완료';
      badge_text_vi = 'Hoàn thành';
      badge_color_class = 'bg-slate-100 text-slate-700 border-slate-300';
    }
  } else {
    if (riskCount > 0) {
      status = 'RISK';
      if (categoryCount === 1) {
        const group = Object.values(groupsMap)[0];
        badge_text_ko = group.label_ko;
        badge_text_vi = group.label_vi;
      } else {
        badge_text_ko = `주의 ${categoryCount}종`;
        badge_text_vi = `Cảnh báo ${categoryCount} loại`;
      }
      badge_color_class = 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold';
    } else if (setupCount > 0) {
      status = 'NEEDS_SETUP';
      if (categoryCount === 1) {
        const group = Object.values(groupsMap)[0];
        badge_text_ko = group.label_ko;
        badge_text_vi = group.label_vi;
      } else {
        badge_text_ko = `설정필요 ${categoryCount}종`;
        badge_text_vi = `Cần thiết lập ${categoryCount} loại`;
      }
      badge_color_class = 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold';
    }
  }

  return {
    status,
    badge_text_ko,
    badge_text_vi,
    badge_color_class,
    total_issue_count: issues.length,
    category_count: categoryCount,
    setup_count: setupCount,
    risk_count: riskCount,
    issues,
    issue_groups: groupsMap,
  };
}
