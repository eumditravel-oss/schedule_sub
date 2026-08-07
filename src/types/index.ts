// src/types/index.ts

export type DailyStatusType = 'NONE' | 'IN_PROGRESS' | 'COMPLETED' | 'ISSUE';

export interface DailyStatusDetail {
  status: DailyStatusType;
  updated_by_name?: string;
  updated_at?: string;
}

export type CountryCode = 'KR' | 'VN';
export type WorkweekProfile = 'MON_FRI' | 'MON_SAT';
export type HolidaySource = 'KASI' | 'NAGER' | 'MANUAL';
export type OverrideScopeType = 'COUNTRY' | 'WORKER';
export type OverrideType = 'WORK' | 'OFF' | 'LEAVE';
export type DayType =
  | 'WORKDAY'
  | 'WEEKLY_OFF'
  | 'PUBLIC_HOLIDAY'
  | 'COUNTRY_OFF'
  | 'LEAVE'
  | 'WORK_OVERRIDE'
  | 'PROFILE_ERROR'
  | 'MANUAL_OFF';
export type AccessRole = 'VIEWER' | 'EDITOR';
export type UiLanguage = 'ko' | 'vi';

export interface Worker {
  id: string;
  name: string;
  is_active: number;
  sort_order: number;
  country_code?: CountryCode;
  workweek_profile?: WorkweekProfile;
  access_role?: AccessRole;
  ui_language?: UiLanguage;
  can_manage_country_calendar?: number;
  created_at?: string;
  updated_at?: string;
}

export function isExecutiveViewer(worker?: Partial<Worker> | null): boolean {
  if (!worker) return false;
  return worker.access_role === 'VIEWER' || worker.name === 'CEO' || worker.name === 'COO';
}

export function isEditableWorker(worker?: Partial<Worker> | null): boolean {
  if (!worker) return false;
  return worker.access_role === 'EDITOR' && !isExecutiveViewer(worker);
}

export function canManageCountryCalendar(worker?: Partial<Worker> | null): boolean {
  if (!worker) return false;
  return Number(worker.can_manage_country_calendar) === 1;
}

export function getWorkerUiLanguage(worker?: Partial<Worker> | null): UiLanguage {
  if (!worker) return 'ko';
  return worker.ui_language || (worker.country_code === 'VN' ? 'vi' : 'ko');
}

export type WorkerColorGroup = 'EXECUTIVE' | 'KOREAN_STAFF' | 'VIETNAMESE_STAFF';

export function getWorkerColorGroup(worker?: Partial<Worker> | null): WorkerColorGroup {
  if (!worker) return 'KOREAN_STAFF';
  if (isExecutiveViewer(worker)) return 'EXECUTIVE';
  if (worker.country_code === 'VN' || worker.ui_language === 'vi') return 'VIETNAMESE_STAFF';
  return 'KOREAN_STAFF';
}

export type ProjectStatus = 'ACTIVE' | 'COMPLETED';
export type TranslationStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'MANUAL';
export type ScheduleState = 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' | 'COMPLETION_REVIEW';
export type AssignmentRole = 'PRIMARY' | 'CO_ASSIGNEE';
export type ProgressMode = 'AUTO_TIME' | 'STATUS_BASED';
export type AvailabilityPolicy = 'ANY_AVAILABLE' | 'ALL_REQUIRED';

export interface TaskAssignee {
  worker_id: string;
  name: string;
  country_code?: CountryCode;
  assignment_role: AssignmentRole;
  allocation_percent: number;
  sort_order?: number;
}

export interface TaskAssigneeInput {
  worker_id: string;
  allocation_percent?: number;
  assignment_role?: AssignmentRole;
}

export interface ScheduleConflictDetail {
  worker_id?: string;
  worker_name: string;
  current_project_id?: string;
  current_project_name?: string;
  conflict_project_id: string;
  conflict_project_name: string;
  current_task_id?: string;
  current_task_name?: string;
  conflict_task_id: string;
  conflict_task_name: string;
  overlap_start_date: string;
  overlap_end_date: string;
  overlapping_working_days: number;
}

export interface Project {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  created_at?: string;
  updated_at?: string;
  task_count?: number;

  // Progress & Schedule State
  planned_progress?: number;
  actual_progress?: number;
  planned_working_days?: number;
  completed_working_days?: number;
  progress_gap?: number;
  schedule_state?: ScheduleState;
  conflict_count?: number;
  auto_progress_task_count?: number;
  status_progress_task_count?: number;

  // Archive fields
  status: ProjectStatus;
  completed_at?: string | null;
  completed_by_name?: string | null;
  participating_workers?: string[];

  // Translation fields
  name_ko?: string | null;
  name_vi?: string | null;
  source_language?: string | null;
  translation_status?: TranslationStatus;
  translation_error?: string | null;
  // Cascade confirmation
  confirm_schedule_cascade?: boolean;
  confirm_worker_schedule_conflict?: boolean;
}

export type TaskGroupColorKey = 'BLUE' | 'GREEN' | 'ORANGE' | 'VIOLET' | 'SLATE';

export interface TaskGroup {
  id: string;
  project_id: string;
  group_name: string;
  group_name_ko?: string | null;
  group_name_vi?: string | null;
  source_language?: string;
  translation_status?: TranslationStatus;
  color_key: TaskGroupColorKey;
  sort_order: number;
  created_by_name?: string;
  updated_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type ScheduleStatus = 'SCHEDULED' | 'UNSCHEDULED';

export interface Task {
  id: string;
  project_id: string;
  task_group_id?: string | null;
  task_sort_order?: number;
  worker_name: string;
  task_name: string;
  start_date?: string | null;
  end_date?: string | null;
  schedule_status?: ScheduleStatus;
  progress: number;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_at?: string;
  updated_at?: string;

  // Multi-Assignees & Progress Mode Extension
  primary_worker_id?: string | null;
  assignee_ids?: string[];
  assignees?: TaskAssignee[];
  progress_mode?: ProgressMode;
  actual_progress_source?: ProgressMode;
  availability_policy?: AvailabilityPolicy;
  completion_confirmed?: number;

  // Progress & Schedule State
  planned_progress?: number;
  actual_progress?: number;
  planned_working_days?: number;
  completed_working_days?: number;
  progress_gap?: number;
  schedule_state?: ScheduleState;
  has_schedule_conflict?: boolean;
  schedule_conflicts?: ScheduleConflictDetail[];
  confirm_worker_schedule_conflict?: boolean;

  // Translation fields
  task_name_ko?: string | null;
  task_name_vi?: string | null;
  source_language?: string | null;
  translation_status?: TranslationStatus;
  translation_error?: string | null;

  // Revision tracking
  schedule_revision?: number;

  // Frontend dynamic statuses
  daily_statuses?: Record<string, DailyStatusType>;
  daily_status_details?: Record<string, DailyStatusDetail>;
}

export interface CalendarOverrideGroup {
  id: string;
  worker_id: string;
  override_type: OverrideType;
  start_date: string;
  end_date: string;
  label_ko?: string;
  label_vi?: string;
  note?: string;
  status: 'ACTIVE' | 'DELETED';
  created_by_name: string;
  updated_by_name: string;
  deleted_by_name?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  working_leave_days?: number;
  affected_task_count?: number;
  affected_project_count?: number;
  event_status?: LeaveShiftEventStatus;
  restore_token?: string;
}

export type LeaveShiftEventStatus =
  | 'ACTIVE'
  | 'LEAVE_DELETED_PENDING_DECISION'
  | 'LEAVE_DELETED_SCHEDULE_KEPT'
  | 'RESTORED'
  | 'RESTORE_CONFLICT';

export type TaskRestoreStatus =
  | 'RESTORABLE'
  | 'RESTORED'
  | 'MANUAL_CHANGED'
  | 'COMPLETED'
  | 'PROJECT_COMPLETED'
  | 'CONFLICT';

export interface LeaveShiftEvent {
  id: string;
  override_group_id: string;
  worker_id: string;
  leave_start_date: string;
  leave_end_date: string;
  working_leave_days: number;
  affected_project_count: number;
  affected_task_count: number;
  shifted_future_status_count: number;
  event_status: LeaveShiftEventStatus;
  restore_token?: string;
  changed_by_name: string;
  created_at: string;
  leave_deleted_at?: string;
  restored_at?: string;
}

export interface LeaveShiftTaskLog {
  id: string;
  event_id: string;
  project_id: string;
  task_id: string;
  old_start_date: string;
  old_end_date: string;
  new_start_date: string;
  new_end_date: string;
  shift_mode: 'EXTEND_END_ONLY' | 'SHIFT_START_AND_END';
  task_revision_after_shift?: number;
  restore_status: TaskRestoreStatus;
  conflict_reason?: string;
  created_at: string;
  project_name?: string;
  task_name?: string;
  current_start_date?: string;
  current_end_date?: string;
}

export interface CountryHoliday {
  id: string;
  country_code: CountryCode;
  holiday_date: string;
  name_local: string;
  name_ko?: string;
  name_vi?: string;
  source: HolidaySource;
  source_year: number;
  is_verified: number;
  is_manual?: number;
  created_by_name?: string;
  updated_by_name?: string;
}

export interface CalendarOverride {
  id: string;
  scope_type: OverrideScopeType;
  scope_key: string;
  work_date: string;
  override_type: OverrideType;
  override_group_id?: string;
  label_ko?: string;
  label_vi?: string;
  note?: string;
  created_by_name?: string;
  updated_by_name?: string;
}

export interface LeaveDeleteResponse {
  deleted_group_id: string;
  restore_available: boolean;
  working_leave_days: number;
  affected_project_count: number;
  affected_task_count: number;
  restorable_task_count: number;
  conflict_task_count: number;
  restore_token?: string;
  task_preview: LeaveShiftTaskLog[];
}

export interface WorkDayStatus {
  date: string;
  day_type: DayType;
  is_working_day: boolean;
  label_ko: string;
  label_vi: string;
  source?: string;
  worker_id?: string;
  worker_name?: string;
  country_code?: CountryCode;
  override_id?: string;
}

export interface GanttDateColumn {
  dateStr: string;
  date: Date;
  dayNum: number;
  dayName: string;
  isWeekend: boolean;
  isToday: boolean;
  monthStr: string;
}

export interface TaskWorkdayBreakdown {
  calendar_span_days: number;
  planned_working_days: number;
  excluded_non_working_days: number;
  excluded_weekly_off_days: number;
  excluded_public_holiday_days: number;
  excluded_leave_days: number;
  excluded_manual_off_days: number;
  included_work_override_days: number;
  excluded_dates_detail: Array<{
    date: string;
    type: string;
    label_ko: string;
    label_vi: string;
  }>;
}

export interface WorkerUtilization {
  worker_id: string;
  worker_name: string;
  country_code: CountryCode;
  workweek_profile: WorkweekProfile;
  available_working_days: number;
  assigned_working_days: number;
  utilization_rate: number;
  overloaded_working_days: number;
  status_level: 'EASY' | 'OPTIMAL' | 'OVERLOADED';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
}
