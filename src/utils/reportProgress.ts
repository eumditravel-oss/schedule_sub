// src/utils/reportProgress.ts
import { Project, Task } from '../types';
import { calculateProjectProgress } from './progressCalculator';

export interface ReportProjectProgress {
  plannedProgress: number;
  actualProgress: number;
  scheduleState: 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' | 'COMPLETION_REVIEW';
  statusDisplayKo: string;
  statusDisplayVi: string;
  completedAtDisplayKo: string;
  completedAtDisplayVi: string;
  isLifecycleCompleted: boolean;
}

export function resolveReportProjectProgress(
  project: Project | null | undefined,
  tasks: Task[] = []
): ReportProjectProgress {
  if (!project) {
    return {
      plannedProgress: 0,
      actualProgress: 0,
      scheduleState: 'UPCOMING',
      statusDisplayKo: '진행 예정',
      statusDisplayVi: 'Sắp diễn ra',
      completedAtDisplayKo: '-',
      completedAtDisplayVi: '-',
      isLifecycleCompleted: false,
    };
  }

  // CASE A: Project is Lifecycle COMPLETED (status === 'COMPLETED')
  if (project.status === 'COMPLETED') {
    const completedAtDate = project.completed_at ? project.completed_at.slice(0, 10) : null;
    return {
      plannedProgress: 100,
      actualProgress: 100,
      scheduleState: 'COMPLETED',
      statusDisplayKo: '완료',
      statusDisplayVi: 'Đã hoàn thành',
      completedAtDisplayKo: completedAtDate || '완료일 미기록',
      completedAtDisplayVi: completedAtDate || 'Chưa ghi nhận',
      isLifecycleCompleted: true,
    };
  }

  // Compute calculated metrics as fallback if API DTO properties are missing
  const projectTasks = tasks.filter((t) => t.project_id === project.id);
  const computed = calculateProjectProgress(project, projectTasks);

  const plannedProgress = project.planned_progress ?? computed.planned_progress;
  const actualProgress = project.actual_progress ?? computed.actual_progress;
  const scheduleState = (project.schedule_state || computed.schedule_state) as ReportProjectProgress['scheduleState'];

  // Lifecycle ACTIVE never becomes a synthetic "completion review" state.
  // Actual 100% can be a valid task fact, but project completion remains an
  // explicit lifecycle action and date passage must not manufacture a status.
  if (actualProgress === 100 || scheduleState === 'COMPLETED' || scheduleState === 'COMPLETION_REVIEW') {
    return {
      plannedProgress,
      actualProgress,
      scheduleState: 'IN_PROGRESS',
      statusDisplayKo: '진행 중',
      statusDisplayVi: 'Đang thực hiện',
      completedAtDisplayKo: '-',
      completedAtDisplayVi: '-',
      isLifecycleCompleted: false,
    };
  }

  // CASE C: Project is Lifecycle ACTIVE and in progress / upcoming / delayed
  const statusLabelsKo: Record<string, string> = {
    UPCOMING: '진행 예정',
    IN_PROGRESS: '진행 중',
    DELAYED: '지연',
    COMPLETED: '완료',
    COMPLETION_REVIEW: '완료 확인 필요',
  };

  const statusLabelsVi: Record<string, string> = {
    UPCOMING: 'Sắp diễn ra',
    IN_PROGRESS: 'Đang thực hiện',
    DELAYED: 'Chậm tiến độ',
    COMPLETED: 'Đã hoàn thành',
    COMPLETION_REVIEW: 'Cần xác nhận hoàn thành',
  };

  return {
    plannedProgress,
    actualProgress,
    scheduleState,
    statusDisplayKo: statusLabelsKo[scheduleState] || '진행 중',
    statusDisplayVi: statusLabelsVi[scheduleState] || 'Đang thực hiện',
    completedAtDisplayKo: '-',
    completedAtDisplayVi: '-',
    isLifecycleCompleted: false,
  };
}

export function getCompletedTaskCount(tasks: Task[] = []): number {
  return tasks.filter((t) => {
    if (t.schedule_status === 'UNSCHEDULED' || (!t.start_date && !t.end_date)) return false;
    return Number(t.completion_confirmed) === 1 || t.schedule_state === 'COMPLETED' || (t.actual_progress ?? t.progress ?? 0) >= 100;
  }).length;
}
