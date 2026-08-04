// src/types/index.ts

export type DailyStatusType = 'NONE' | 'IN_PROGRESS' | 'COMPLETED' | 'ISSUE';

export interface Project {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  progress: number;   // 0~100 (simple average of tasks or custom)
  created_at?: string;
  updated_at?: string;
  task_count?: number;
}

export interface Task {
  id: string;
  project_id: string;
  worker_name: string;
  task_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  progress: number;   // 0~100
  created_at?: string;
  updated_at?: string;
  daily_statuses?: Record<string, DailyStatusType>; // work_date -> status map
}

export interface DailyStatus {
  id: string;
  task_id: string;
  work_date: string; // YYYY-MM-DD
  status: DailyStatusType;
  updated_at?: string;
}

export interface GanttDateColumn {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  dayName: string; // 월, 화, 수...
  isWeekend: boolean;
  isToday: boolean;
  monthStr: string; // YYYY년 MM월
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
