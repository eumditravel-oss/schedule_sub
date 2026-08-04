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
export type DayType = 'WORKDAY' | 'WEEKLY_OFF' | 'PUBLIC_HOLIDAY' | 'MANUAL_OFF' | 'LEAVE' | 'WORK_OVERRIDE';
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

export interface Project {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  created_at?: string;
  updated_at?: string;
  task_count?: number;

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
}

export interface Task {
  id: string;
  project_id: string;
  worker_name: string;
  task_name: string;
  start_date: string;
  end_date: string;
  progress: number;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_at?: string;
  updated_at?: string;

  // Translation fields
  task_name_ko?: string | null;
  task_name_vi?: string | null;
  source_language?: string | null;
  translation_status?: TranslationStatus;
  translation_error?: string | null;

  // Frontend dynamic statuses
  daily_statuses?: Record<string, DailyStatusType>;
  daily_status_details?: Record<string, DailyStatusDetail>;
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
}

export interface CalendarOverride {
  id: string;
  scope_type: OverrideScopeType;
  scope_key: string;
  work_date: string;
  override_type: OverrideType;
  label_ko?: string;
  label_vi?: string;
  note?: string;
  created_by_name?: string;
  updated_by_name?: string;
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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}
