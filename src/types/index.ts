// src/types/index.ts

export type DailyStatusType = 'NONE' | 'IN_PROGRESS' | 'COMPLETED' | 'ISSUE';

export interface DailyStatusDetail {
  status: DailyStatusType;
  updated_by_name?: string;
  updated_at?: string;
}

export interface Worker {
  id: string;
  name: string;
  is_active: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;

  // Attribution
  created_by_name?: string;
  updated_by_name?: string;

  // Translation fields
  task_name_ko?: string | null;
  task_name_vi?: string | null;
  source_language?: string | null;
  translation_status?: TranslationStatus;
  translation_error?: string | null;

  // Daily Statuses
  daily_statuses?: Record<string, DailyStatusType>;
  daily_status_details?: Record<string, DailyStatusDetail>;
}

export interface GanttDateColumn {
  date: Date;
  dateStr: string;
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
    code?: string;
    message: string;
  };
}
