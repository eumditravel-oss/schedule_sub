// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, Worker, CountryHoliday, CalendarOverride, DailyStatusType, WorkDayStatus, CountryCode, WorkweekProfile, ScheduleConflictDetail, isExecutiveViewer, isEditableWorker } from '../types';
import { WorkerConflictModal } from '../components/modals/WorkerConflictModal';
import { api, getCurrentWorkerId, setCurrentWorker as setCurrentWorkerApi } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { resolveWorkDayStatus } from '../utils/workCalendar';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import {
  GANTT_DAY_WIDTH_PX,
  PRIMARY_BUTTON_H36_CLASS,
} from '../constants/gantt';
import { TaskModal } from '../components/modals/TaskModal';
import { StatusPopover } from '../components/modals/StatusPopover';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { MobileAppHeader } from '../components/mobile/MobileAppHeader';
import { MobileWorkerSheet } from '../components/mobile/MobileWorkerSheet';
import { MobileStatusSheet } from '../components/mobile/MobileStatusSheet';
import { MobileSummaryView } from '../components/mobile/MobileSummaryView';
import { MobileWeekView } from '../components/mobile/MobileWeekView';
import { MobileThirtyDayGanttView } from '../components/mobile/MobileThirtyDayGanttView';
import { MobileScheduleInfoSheet } from '../components/mobile/MobileScheduleInfoSheet';
import { CalendarManagerModal } from '../components/modals/CalendarManagerModal';
import { CalendarLegend } from '../components/common/CalendarLegend';
import { DayActionPanel } from '../components/modals/DayActionPanel';
import { DateHeaderInfoPanel } from '../components/modals/DateHeaderInfoPanel';
import { WorkerUtilizationBadge } from '../components/common/WorkerUtilizationBadge';
import { ScheduleShiftHistoryModal } from '../components/modals/ScheduleShiftHistoryModal';
import { BuildVersionIndicator } from '../components/common/BuildVersionIndicator';
import { ScheduleBar } from '../components/gantt/ScheduleBar';
import { getGanttSpanColumns } from '../utils/ganttOverlay';
import { calculateTaskWorkdayBreakdown } from '../utils/workCalendar';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Users,
  CheckCircle,
  RotateCcw,
  Calendar,
  Lock,
  AlertTriangle,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useI18n();
  const { isMobile, isTabletFold } = useResponsiveLayout();
  const isMobileView = isMobile || isTabletFold;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [countryHolidays, setCountryHolidays] = useState<CountryHoliday[]>([]);
  const [calendarOverrides, setCalendarOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // Mobile View Mode
  const [mobileViewMode, setMobileViewMode] = useState<'SUMMARY' | 'WEEK' | 'GANTT'>(() => {
    try {
      const saved = localStorage.getItem('schedule_mobile_view_mode');
      if (saved === 'WEEK' || saved === 'GANTT') return saved;
    } catch {}
    return 'SUMMARY';
  });

  const handleMobileViewChange = (mode: 'SUMMARY' | 'WEEK' | 'GANTT') => {
    setMobileViewMode(mode);
    try {
      localStorage.setItem('schedule_mobile_view_mode', mode);
    } catch {}
  };

  // Worker & Modal States
  const [currentWorker, setCurrentWorker] = useState<Worker | null>(null);
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);
  const [isMobileWorkerSheetOpen, setIsMobileWorkerSheetOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isShiftHistoryOpen, setIsShiftHistoryOpen] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    conflicts: ScheduleConflictDetail[];
    pendingTaskData: Partial<Task> | null;
  }>({
    isOpen: false,
    conflicts: [],
    pendingTaskData: null,
  });

  // Info Sheet State
  const [infoSheetState, setInfoSheetState] = useState<{
    isOpen: boolean;
    task: Task | null;
  }>({
    isOpen: false,
    task: null,
  });

  // Status Popover State (Desktop)
  const [popoverState, setPopoverState] = useState<{
    isOpen: boolean;
    taskId: string;
    dateStr: string;
    currentStatus: DailyStatusType;
    anchorRect: DOMRect | null;
  }>({
    isOpen: false,
    taskId: '',
    dateStr: '',
    currentStatus: 'NONE',
    anchorRect: null,
  });

  // Mobile Status Sheet State
  const [mobileStatusSheetState, setMobileStatusSheetState] = useState<{
    isOpen: boolean;
    taskId: string;
    dateStr: string;
    taskName: string;
    currentStatus: DailyStatusType;
    workStatus?: WorkDayStatus;
  }>({
    isOpen: false,
    taskId: '',
    dateStr: '',
    taskName: '',
    currentStatus: 'NONE',
  });

  const [dayActionState, setDayActionState] = useState<{
    isOpen: boolean;
    task: Task | null;
    dateStr: string;
    dayStatus: WorkDayStatus | null;
    workerObj: Worker | null;
  }>({
    isOpen: false,
    task: null,
    dateStr: '',
    dayStatus: null,
    workerObj: null,
  });

  const [headerInfoState, setHeaderInfoState] = useState<{
    isOpen: boolean;
    dateStr: string;
    dayName: string;
  }>({
    isOpen: false,
    dateStr: '',
    dayName: '',
  });

  const handleCellClick = (taskItem: Task, dateStr: string, dayStatus: WorkDayStatus, workerObj: Worker | null) => {
    setDayActionState({
      isOpen: true,
      task: taskItem,
      dateStr,
      dayStatus,
      workerObj,
    });
  };

  const handleUpdateDailyStatus = async (taskId: string, dateStr: string, status: DailyStatusType) => {
    try {
      await api.updateDailyStatus(taskId, dateStr, status);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleCreateOverrideFromCell = async (overrideType: 'LEAVE' | 'OFF' | 'WORK') => {
    if (!dayActionState.task || !dayActionState.workerObj) return;
    try {
      await api.createOverride({
        scope_type: 'WORKER',
        scope_key: dayActionState.workerObj.id,
        start_date: dayActionState.dateStr,
        end_date: dayActionState.dateStr,
        override_type: overrideType,
        confirm_leave_schedule_cascade: true,
      });
      await fetchCalendarData();
      await fetchProjectDetail();
    } catch (err: any) {
      if (err.code === 'LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED') {
        if (confirm(err.message + '\n\n' + (lang === 'vi' ? 'Bạn có muốn chuyển lịch công việc không?' : '작업 일정을 이연하시겠습니까?'))) {
          await api.createOverride({
            scope_type: 'WORKER',
            scope_key: dayActionState.workerObj.id,
            start_date: dayActionState.dateStr,
            end_date: dayActionState.dateStr,
            override_type: overrideType,
            confirm_leave_schedule_cascade: true,
          });
          await fetchCalendarData();
          await fetchProjectDetail();
          return;
        }
      }
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleClearOverrideFromCell = async (overrideId?: string) => {
    if (!dayActionState.task || !dayActionState.workerObj) return;
    try {
      if (overrideId) {
        await api.deleteOverride(overrideId);
      } else {
        const ovr = calendarOverrides.find(
          (o) => o.scope_type === 'WORKER' && (o.scope_key === dayActionState.workerObj?.id || o.scope_key === dayActionState.workerObj?.name) && o.work_date === dayActionState.dateStr
        );
        if (ovr) {
          await api.deleteOverride(ovr.id);
        }
      }
      await fetchCalendarData();
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  // Date Range Hook
  const {
    viewMode,
    startDate,
    endDate,
    dateColumns,
    monthGroups,
    rangeTitle,
    changeViewMode,
    goPrevious,
    goNext,
    goToday,
  } = useGanttDateRange();

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchCalendarData = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const [wData, krData, vnData, ovrData] = await Promise.all([
        api.getWorkers(),
        api.getHolidays('KR', currentYear),
        api.getHolidays('VN', currentYear),
        api.getOverrides(),
      ]);
      const workerList = wData || [];
      setWorkers(workerList);
      setCountryHolidays([...(krData || []), ...(vnData || [])]);
      setCalendarOverrides(ovrData || []);

      const savedId = getCurrentWorkerId();
      const found = workerList.find((w) => w.id === savedId || w.name === savedId);
      if (found) {
        setCurrentWorker(found);
        setLanguage(found.ui_language || (found.country_code === 'VN' ? 'vi' : 'ko'));
      } else {
        setIsWorkerPromptOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch calendar data in detail:', err);
    }
  };

  const fetchProjectDetail = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await api.getProjectDetail(projectId);
      setProject(data.project);
      setTasks(data.tasks || []);
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
    fetchProjectDetail();
  }, [projectId]);

  const handleSelectWorkerProfile = (w: Worker) => {
    setCurrentWorker(w);
    setCurrentWorkerApi(w);
    const targetLang = w.ui_language || (w.country_code === 'VN' ? 'vi' : 'ko');
    setLanguage(targetLang);
  };

  const requireWorkerSelection = (): boolean => {
    if (!currentWorker) {
      if (isMobileView) {
        setIsMobileWorkerSheetOpen(true);
      } else {
        setIsWorkerPromptOpen(true);
      }
      return false;
    }
    return true;
  };

  const isCompleted = project?.status === 'COMPLETED';
  const isViewer = isExecutiveViewer(currentWorker);

  const handleOpenAddTask = () => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    try {
      if (selectedTask) {
        await api.updateTask(selectedTask.id, data);
      } else {
        await api.createTask({ ...data, project_id: projectId });
      }
      await fetchProjectDetail();
      setConflictModalState({ isOpen: false, conflicts: [], pendingTaskData: null });
    } catch (err: any) {
      if (err && err.code === 'WORKER_SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED' && err.details?.conflicts) {
        setConflictModalState({
          isOpen: true,
          conflicts: err.details.conflicts,
          pendingTaskData: data,
        });
        return;
      }
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleConfirmTaskConflictSave = async () => {
    if (!conflictModalState.pendingTaskData) return;
    try {
      const payload = {
        ...conflictModalState.pendingTaskData,
        confirm_worker_schedule_conflict: true,
      };
      if (selectedTask) {
        await api.updateTask(selectedTask.id, payload);
      } else {
        await api.createTask({ ...payload, project_id: projectId });
      }
      await fetchProjectDetail();
      setConflictModalState({ isOpen: false, conflicts: [], pendingTaskData: null });
      setIsTaskModalOpen(false);
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleEditTask = (taskItem: Task) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedTask(taskItem);
    setIsTaskModalOpen(true);
  };

  const handleDeleteTask = async (taskItem: Task) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('deleteTaskConfirm'))) return;
    try {
      await api.deleteTask(taskItem.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleCompleteProject = async () => {
    if (!project) return;
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('completeConfirmText'))) return;
    try {
      await api.completeProject(project.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleReopenProject = async () => {
    if (!project) return;
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('reopenConfirmText'))) return;
    try {
      await api.reopenProject(project.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleMobileSheetStatusSelect = async (status: DailyStatusType) => {
    const { taskId, dateStr } = isMobileView ? mobileStatusSheetState : popoverState;
    if (!taskId || !dateStr) return;
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    try {
      await api.updateDailyStatus(taskId, dateStr, status);
      await fetchProjectDetail();
      setPopoverState((prev) => ({ ...prev, isOpen: false }));
      setMobileStatusSheetState((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const getProjectDisplayName = (prj: Project): string => {
    const currentLang = currentWorker?.ui_language || lang;
    if (currentLang === 'vi') return prj.name_vi || prj.name_ko || prj.name;
    return prj.name_ko || prj.name_vi || prj.name;
  };

  const getTaskDisplayName = (taskItem: Task): string => {
    const currentLang = currentWorker?.ui_language || lang;
    if (currentLang === 'vi') return taskItem.task_name_vi || taskItem.task_name_ko || taskItem.task_name;
    return taskItem.task_name_ko || taskItem.task_name_vi || taskItem.task_name;
  };

  const handleMobileCellClick = (taskItem: Task, dateStr: string) => {
    const workerObj = workers.find((w) => w.name === taskItem.worker_name);
    const workStatus = resolveWorkDayStatus(dateStr, workerObj as any, countryHolidays, calendarOverrides);
    const currentStatus = taskItem.daily_statuses?.[dateStr] || 'NONE';

    if (isViewer || isCompleted) {
      setInfoSheetState({ isOpen: true, task: taskItem });
      return;
    }

    setMobileStatusSheetState({
      isOpen: true,
      taskId: taskItem.id,
      dateStr,
      taskName: getTaskDisplayName(taskItem),
      currentStatus,
      workStatus,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* App Header */}
      {isMobileView ? (
        <MobileAppHeader
          currentWorker={currentWorker}
          onOpenWorkerSheet={() => setIsMobileWorkerSheetOpen(true)}
        />
      ) : (
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="back-to-list-btn"
              onClick={() => navigate('/projects')}
              className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition shadow-2xs"
              title={t('backToList')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base md:text-lg text-slate-900 tracking-tight leading-none">
                  {project ? getProjectDisplayName(project) : t('loading')}
                </h1>
                {isCompleted && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    {t('statusCompleted')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isViewer ? (
              <div
                data-testid="viewer-readonly-badge"
                className="h-9 px-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Lock className="w-4 h-4 text-red-600" />
                <span>{lang === 'vi' ? 'Chỉ xem' : '보기 전용'}</span>
              </div>
            ) : (
              <button
                type="button"
                data-testid="manage-holidays-btn"
                onClick={() => setIsCalendarModalOpen(true)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition shadow-xs"
              >
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>{t('manageHolidays')}</span>
              </button>
            )}

            <WorkerSelector
              currentWorker={currentWorker}
              onWorkerChange={handleSelectWorkerProfile}
            />

            <WorkerUtilizationBadge
              worker={currentWorker}
              tasks={tasks}
              holidays={countryHolidays}
              overrides={calendarOverrides}
              compact={true}
            />

            {!isViewer && (!isCompleted ? (
              <>
                <button
                  type="button"
                  data-testid="add-task-btn"
                  onClick={handleOpenAddTask}
                  className={PRIMARY_BUTTON_H36_CLASS}
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('addTask')}</span>
                </button>
                <button
                  type="button"
                  data-testid="complete-project-btn"
                  onClick={handleCompleteProject}
                  className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{t('completeProject')}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="reopen-project-btn"
                onClick={handleReopenProject}
                className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('reopenProject')}</span>
              </button>
            ))}
          </div>
        </header>
      )}

      {/* Desktop Toolbar & Navigation Controls */}
      {isMobileView ? (
        <div className="bg-white border-b border-slate-200 p-3 flex flex-col gap-2 w-full shadow-2xs">
          <div className="flex items-center justify-between">
            <div role="tablist" aria-label="Mobile View Modes" className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold flex-1 mr-2">
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'SUMMARY'}
                data-testid="mobile-view-summary-btn"
                onClick={() => handleMobileViewChange('SUMMARY')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'SUMMARY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('summaryView')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'WEEK'}
                data-testid="mobile-view-week-btn"
                onClick={() => handleMobileViewChange('WEEK')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'WEEK'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('week7View')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'GANTT'}
                data-testid="mobile-view-gantt-btn"
                onClick={() => handleMobileViewChange('GANTT')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'GANTT'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('gantt30View')}
              </button>
            </div>

            <CalendarLegend isMobileView={true} />
          </div>
        </div>
      ) : (
        <section data-testid="desktop-schedule-toolbar" className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 space-y-2 text-slate-900 shadow-2xs">
          {/* Toolbar Main Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Back button & Project Title Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('backToList')}</span>
              </button>
              <span className="text-slate-300">|</span>
              <span className="font-extrabold text-xs text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {project ? getProjectDisplayName(project) : t('loading')}
              </span>
            </div>

            {/* Center: View Mode Toggle & Date Range Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  data-testid="view-30days-btn"
                  onClick={() => changeViewMode('THIRTY_DAYS')}
                  className={`px-3 py-1.5 rounded-md transition font-bold ${
                    viewMode === 'THIRTY_DAYS'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('gantt30View')}
                </button>
                <button
                  type="button"
                  data-testid="view-month-btn"
                  onClick={() => changeViewMode('MONTH')}
                  className={`px-3 py-1.5 rounded-md transition font-bold ${
                    viewMode === 'MONTH'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('viewMonth')}
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{rangeTitle}</span>
              </div>
            </div>

            {/* Right: Navigation Controls & Shift History */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-lg shadow-2xs shrink-0">
                <button
                  type="button"
                  data-testid="nav-prev-btn"
                  onClick={goPrevious}
                  className="h-7 px-2.5 rounded hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center gap-1"
                  aria-label={t('prev')}
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                  <span>{t('prev')}</span>
                </button>

                <button
                  type="button"
                  data-testid="nav-today-btn"
                  onClick={goToday}
                  className="h-7 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-xs transition border border-blue-200"
                >
                  {t('today')}
                </button>

                <button
                  type="button"
                  data-testid="nav-next-btn"
                  onClick={goNext}
                  className="h-7 px-2.5 rounded hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center gap-1"
                  aria-label={t('next')}
                >
                  <span>{t('next')}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <button
                type="button"
                data-testid="schedule-shift-history-btn"
                onClick={() => setIsShiftHistoryOpen(true)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 transition shadow-2xs shrink-0"
                title={lang === 'vi' ? 'Lịch sử thay đổi' : '변경 이력'}
              >
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden lg:inline">{lang === 'vi' ? 'Lịch sử' : '변경 이력'}</span>
              </button>
            </div>
          </div>

          {/* Legend Row */}
          <div className="pt-1.5 border-t border-slate-100">
            <CalendarLegend isMobileView={false} />
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-3 md:p-5 overflow-x-hidden flex flex-col">
        {isMobileView ? (
          /* Dedicated Mutually Exclusive Mobile & Fold Views */
          <div className="w-full flex-1 flex flex-col">
            {mobileViewMode === 'SUMMARY' && (
              <MobileSummaryView
                mode="DETAIL"
                project={project}
                tasks={tasks}
                workers={workers}
                onTaskClick={(tItem) => setInfoSheetState({ isOpen: true, task: tItem })}
                isReadOnly={isViewer || isCompleted}
              />
            )}
            {mobileViewMode === 'WEEK' && (
              <MobileWeekView
                mode="DETAIL"
                project={project}
                tasks={tasks}
                workers={workers}
                currentWorker={currentWorker}
                holidays={countryHolidays}
                overrides={calendarOverrides}
                onTaskCellClick={(tItem, dateStr) => {
                  const workerObj = workers.find((w) => w.name === tItem.worker_name) || null;
                  const dayStatus = resolveWorkDayStatus(dateStr, (workerObj || { id: tItem.worker_name, name: tItem.worker_name }) as any, countryHolidays, calendarOverrides);
                  handleCellClick(tItem, dateStr, dayStatus, workerObj);
                }}
              />
            )}
            {mobileViewMode === 'GANTT' && (
              <MobileThirtyDayGanttView
                mode="DETAIL"
                project={project}
                tasks={tasks}
                workers={workers}
                dateColumns={dateColumns}
                holidays={countryHolidays}
                overrides={calendarOverrides}
                onTaskCellClick={(tItem, dateStr) => {
                  const workerObj = workers.find((w) => w.name === tItem.worker_name) || null;
                  const dayStatus = resolveWorkDayStatus(dateStr, (workerObj || { id: tItem.worker_name, name: tItem.worker_name }) as any, countryHolidays, calendarOverrides);
                  handleCellClick(tItem, dateStr, dayStatus, workerObj);
                }}
              />
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div
            ref={scrollContainerRef}
            className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-y-auto custom-scrollbar relative max-w-full"
          >
            <table className="w-full border-collapse text-left min-w-max">
              <thead className="sticky top-0 z-20 bg-slate-100 text-xs uppercase tracking-wider text-slate-700">
                <tr className="border-b border-slate-200">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 font-bold text-slate-800 border-r border-slate-200 w-[170px] md:w-[295px] min-w-[170px] md:min-w-[295px] max-w-[295px]"
                  >
                    <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                      <span>{t('worker')} / {t('taskContent')}</span>
                      <span className="hidden md:inline text-[10px] text-slate-500 font-normal">{t('progress')}</span>
                    </div>
                  </th>
                  {monthGroups.map((mg, idx) => (
                    <th
                      key={idx}
                      colSpan={mg.span}
                      className="text-center font-bold py-1.5 border-r border-slate-200 bg-slate-100 text-blue-700 text-xs"
                    >
                      {mg.monthStr}
                    </th>
                  ))}
                </tr>

                <tr className="border-b border-slate-200">
                  {dateColumns.map((col, idx) => {
                    const isSun = col.date.getDay() === 0;
                    const isSat = col.date.getDay() === 6;
                    const krHol = countryHolidays.find((h) => h.country_code === 'KR' && h.holiday_date === col.dateStr);
                    const vnHol = countryHolidays.find((h) => h.country_code === 'VN' && h.holiday_date === col.dateStr);

                    return (
                      <th
                        key={idx}
                        data-testid="calendar-date-header"
                        onClick={() => setHeaderInfoState({ isOpen: true, dateStr: col.dateStr, dayName: col.dayName })}
                        style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                        className={`text-center py-1 border-r border-slate-200 text-[11px] font-medium cursor-pointer transition select-none ${
                          col.isToday
                            ? 'ring-2 ring-blue-500 ring-inset bg-blue-100/80 text-blue-900 font-bold'
                            : krHol || vnHol
                            ? 'bg-rose-50/80 text-rose-800 font-bold'
                            : isSun
                            ? 'bg-slate-100 text-slate-500 font-medium'
                            : isSat
                            ? 'bg-slate-50 text-slate-700 font-semibold'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div>{col.dayNum}</div>
                        <div className="text-[9px] scale-90">{col.dayName}</div>
                        {isSat && (
                          <div className="text-[8px] font-bold text-slate-500 scale-75 whitespace-nowrap mt-0.5">
                            KR OFF / VN WORK
                          </div>
                        )}
                        {isSun && (
                          <div className="text-[8px] font-bold text-slate-400 scale-75 whitespace-nowrap mt-0.5">
                            OFF
                          </div>
                        )}
                        {(krHol || vnHol) && (
                          <div className="flex items-center justify-center gap-0.5 mt-0.5">
                            {krHol && <span className="text-[8px] font-extrabold px-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">KR</span>}
                            {vnHol && <span className="text-[8px] font-extrabold px-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">VN</span>}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-500 font-medium">
                      {t('loading')}
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-500 font-medium">
                      {t('noTasks')}
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => {
                    const taskDisplayName = getTaskDisplayName(task);
                    const workerObj = workers.find((w) => w.id === task.worker_name || w.name === task.worker_name);

                    if (!workerObj && workers.length > 0) {
                      return (
                        <tr key={task.id} className="bg-red-50">
                          <td colSpan={dateColumns.length + 1} className="p-3 text-red-600 font-bold text-xs">
                            데이터 오류: 작업자 프로필 정보가 없습니다 ({task.worker_name})
                          </td>
                        </tr>
                      );
                    }

                    const targetWorkerObj = workerObj || {
                      id: task.worker_name,
                      name: task.worker_name,
                      country_code: 'KR' as CountryCode,
                      workweek_profile: 'MON_FRI' as WorkweekProfile,
                    };

                    return (
                      <tr key={task.id} data-testid={`task-row-${task.id}`} className="hover:bg-blue-50/30 transition group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/30 px-3 py-2 border-r border-slate-200 w-[170px] md:w-[295px] min-w-[170px] md:min-w-[295px] max-w-[295px] align-middle">
                          <div className="flex items-center justify-between">
                            <div className="pr-1 overflow-hidden min-w-0">
                              <div className="flex items-center gap-1.5 truncate">
                                {task.has_schedule_conflict && (
                                  <span
                                    data-testid="task-conflict-badge"
                                    className="p-0.5 rounded bg-rose-100 text-rose-700 shrink-0 cursor-help"
                                    title={`일정 중복 경고: ${task.schedule_conflicts?.map((c) => `${c.conflict_project_name} (${c.overlapping_working_days}일 중복)`).join(', ')}`}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                                  </span>
                                )}
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                  {task.worker_name}
                                </span>
                                <span className="font-semibold text-slate-900 truncate text-xs" title={taskDisplayName}>
                                  {taskDisplayName}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-slate-500 flex items-center justify-between">
                                <span className="truncate">{task.start_date.slice(5)} ~ {task.end_date.slice(5)}</span>
                                <span className="font-bold shrink-0 ml-1">
                                  예정 {task.planned_progress ?? task.progress ?? 0}% / 실제 {task.actual_progress ?? task.progress ?? 0}%
                                </span>
                              </div>
                            </div>

                            {!isViewer && !isCompleted && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  data-testid={`task-edit-${task.id}`}
                                  onClick={() => handleEditTask(task)}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-500 transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`task-delete-${task.id}`}
                                  onClick={() => handleDeleteTask(task)}
                                  className="p-1 rounded hover:bg-red-100 text-red-600 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td colSpan={dateColumns.length} className="p-0 border-0 relative">
                          <div
                            className="relative h-14"
                            style={{ minWidth: `${dateColumns.length * GANTT_DAY_WIDTH_PX}px` }}
                          >
                            {/* 1. Date Cells Background & Click Handler Layer */}
                            <div
                              className="grid w-full h-full"
                              style={{
                                gridTemplateColumns: `repeat(${dateColumns.length}, minmax(${GANTT_DAY_WIDTH_PX}px, 1fr))`,
                              }}
                            >
                              {dateColumns.map((col, cIdx) => {
                                const dayStatus = resolveWorkDayStatus(col.dateStr, targetWorkerObj as any, countryHolidays, calendarOverrides);
                                const statusVal = task.daily_statuses?.[col.dateStr];

                                let cellBgClass = 'bg-white';
                                if (dayStatus.day_type === 'PUBLIC_HOLIDAY') {
                                  cellBgClass = dayStatus.country_code === 'VN' ? 'bg-amber-100/70' : 'bg-rose-100/70';
                                } else if (dayStatus.day_type === 'LEAVE') {
                                  cellBgClass = 'bg-violet-100/80';
                                } else if (dayStatus.day_type === 'MANUAL_OFF') {
                                  cellBgClass = 'bg-orange-100/80';
                                } else if (dayStatus.day_type === 'WORK_OVERRIDE') {
                                  cellBgClass = 'bg-cyan-100/70';
                                } else if (!dayStatus.is_working_day) {
                                  cellBgClass = 'bg-slate-100/90';
                                } else if (col.isToday) {
                                  cellBgClass = 'bg-blue-50/50';
                                }

                                return (
                                  <div
                                    key={cIdx}
                                    onClick={() => handleCellClick(task, col.dateStr, dayStatus, targetWorkerObj as any)}
                                    style={{ minWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                                    className={`h-full relative border-r border-slate-200 cursor-pointer ${cellBgClass} ${
                                      col.isToday ? 'ring-2 ring-blue-500 ring-inset' : ''
                                    }`}
                                  >
                                    {statusVal && statusVal !== 'NONE' && (
                                      <div className="absolute top-1 right-1 z-20">
                                        {statusVal === 'COMPLETED' && <div className="w-2 h-2 rounded-full bg-emerald-500" title="완료" />}
                                        {statusVal === 'IN_PROGRESS' && <div className="w-2 h-2 rounded-full bg-blue-500" title="작업 중" />}
                                        {statusVal === 'ISSUE' && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="문제 발생" />}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* 2. CSS Grid Overlay Layer for Continuous Schedule Bar */}
                            {(() => {
                              const spanInfo = getGanttSpanColumns(task.start_date, task.end_date, dateColumns);
                              if (!spanInfo) return null;

                              const taskBreakdown = calculateTaskWorkdayBreakdown(
                                targetWorkerObj as any,
                                task.start_date,
                                task.end_date,
                                countryHolidays,
                                calendarOverrides
                              );

                              return (
                                <div
                                  className="absolute inset-0 grid pointer-events-none z-10 w-full h-full"
                                  style={{
                                    gridTemplateColumns: `repeat(${dateColumns.length}, minmax(${GANTT_DAY_WIDTH_PX}px, 1fr))`,
                                  }}
                                >
                                  <div
                                    style={{
                                      gridColumn: `${spanInfo.startIndex + 1} / span ${spanInfo.spanCount}`,
                                    }}
                                    className="px-0.5 flex items-center h-full w-full min-w-0 pointer-events-auto"
                                  >
                                    <ScheduleBar
                                      title={taskDisplayName}
                                      startDate={task.start_date}
                                      endDate={task.end_date}
                                      calendarSpanDays={taskBreakdown.calendar_span_days}
                                      plannedWorkingDays={taskBreakdown.planned_working_days}
                                      plannedProgress={task.planned_progress ?? task.progress ?? 0}
                                      actualProgress={task.actual_progress ?? task.progress ?? 0}
                                      status={task.schedule_state || (task.progress === 100 ? 'COMPLETED' : 'IN_PROGRESS')}
                                      onClick={() => handleEditTask(task)}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Info Sheet */}
      <MobileScheduleInfoSheet
        isOpen={infoSheetState.isOpen}
        onClose={() => setInfoSheetState({ isOpen: false, task: null })}
        title={infoSheetState.task ? getTaskDisplayName(infoSheetState.task) : ''}
        subtitle={infoSheetState.task?.worker_name}
        startDate={infoSheetState.task?.start_date}
        endDate={infoSheetState.task?.end_date}
        progress={infoSheetState.task?.progress}
        workerName={infoSheetState.task?.worker_name}
        isReadOnly={isViewer || isCompleted}
        onEdit={infoSheetState.task ? () => handleEditTask(infoSheetState.task!) : undefined}
      />

      {/* Modals & Sheets */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        task={selectedTask}
        projectId={projectId || ''}
        project={project}
        currentWorker={currentWorker}
        holidays={countryHolidays}
        overrides={calendarOverrides}
        workers={workers}
      />

      <WorkerPromptModal
        isOpen={isWorkerPromptOpen}
        onClose={() => setIsWorkerPromptOpen(false)}
        onSelectWorker={handleSelectWorkerProfile}
      />

      <MobileWorkerSheet
        isOpen={isMobileWorkerSheetOpen}
        onClose={() => setIsMobileWorkerSheetOpen(false)}
        currentWorker={currentWorker}
        onSelectWorker={handleSelectWorkerProfile}
      />

      <MobileStatusSheet
        isOpen={mobileStatusSheetState.isOpen}
        onClose={() => setMobileStatusSheetState((prev) => ({ ...prev, isOpen: false }))}
        taskName={mobileStatusSheetState.taskName}
        dateStr={mobileStatusSheetState.dateStr}
        currentStatus={mobileStatusSheetState.currentStatus}
        workStatus={mobileStatusSheetState.workStatus}
        onSelect={handleMobileSheetStatusSelect}
      />

      <CalendarManagerModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        workers={workers}
        currentWorker={currentWorker}
        onRefreshCalendar={fetchCalendarData}
      />

      {/* Day Action Panel (Desktop & Mobile) */}
      {dayActionState.isOpen && dayActionState.task && (
        <DayActionPanel
          isOpen={dayActionState.isOpen}
          onClose={() => setDayActionState((prev) => ({ ...prev, isOpen: false }))}
          task={dayActionState.task}
          dateStr={dayActionState.dateStr}
          worker={dayActionState.workerObj}
          currentWorker={currentWorker}
          dayStatus={dayActionState.dayStatus || resolveWorkDayStatus(dayActionState.dateStr, (dayActionState.workerObj || { id: dayActionState.task.worker_name, name: dayActionState.task.worker_name }) as any, countryHolidays, calendarOverrides)}
          holidays={countryHolidays}
          overrides={calendarOverrides}
          onUpdateStatus={handleUpdateDailyStatus}
          onCreateOverride={handleCreateOverrideFromCell}
          onClearOverride={handleClearOverrideFromCell}
          isMobileView={isMobileView}
        />
      )}

      {/* Date Header Info Panel */}
      <DateHeaderInfoPanel
        isOpen={headerInfoState.isOpen}
        onClose={() => setHeaderInfoState((prev) => ({ ...prev, isOpen: false }))}
        dateStr={headerInfoState.dateStr}
        dayName={headerInfoState.dayName}
        holidays={countryHolidays}
        currentWorker={currentWorker}
        onRefreshHolidays={fetchCalendarData}
      />

      {/* Schedule Shift History Modal */}
      <ScheduleShiftHistoryModal
        isOpen={isShiftHistoryOpen}
        onClose={() => setIsShiftHistoryOpen(false)}
        projectId={projectId || ''}
      />

      {/* Build Version Indicator */}
      <BuildVersionIndicator />
    </div>
  );
};
