// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, TaskGroup, TaskGroupColorKey, Worker, CountryHoliday, CalendarOverride, DailyStatusType, WorkDayStatus, CountryCode, WorkweekProfile, ScheduleConflictDetail, isExecutiveViewer, isEditableWorker } from '../types';
import { WorkerConflictModal } from '../components/modals/WorkerConflictModal';
import { TaskGroupModal } from '../components/modals/TaskGroupModal';
import { TaskGroupDeleteModal } from '../components/modals/TaskGroupDeleteModal';
import { api, getCurrentWorkerId, setCurrentWorker as setCurrentWorkerApi } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { resolveWorkDayStatus, getCountryOffState } from '../utils/workCalendar';
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
import { WorkerDayCellBackground } from '../components/gantt/WorkerDayCellBackground';
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
  FolderPlus,
  ChevronDown,
} from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useI18n();
  const { isMobile, isTabletFold } = useResponsiveLayout();
  const isMobileView = isMobile || isTabletFold;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`schedule_task_group_collapsed_${projectId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<TaskGroup | null>(null);
  const [deleteGroupModalState, setDeleteGroupModalState] = useState<{
    isOpen: boolean;
    group: TaskGroup | null;
    taskCount: number;
  }>({
    isOpen: false,
    group: null,
    taskCount: 0,
  });

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
      setTaskGroups(data.task_groups || []);
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(`schedule_task_group_collapsed_${projectId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleOpenAddGroup = () => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedGroup(null);
    setIsGroupModalOpen(true);
  };

  const handleOpenEditGroup = (group: TaskGroup) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedGroup(group);
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async (data: Partial<TaskGroup>) => {
    if (!projectId) return;
    try {
      if (selectedGroup) {
        await api.updateTaskGroup(selectedGroup.id, data);
      } else {
        await api.createTaskGroup(projectId, data);
      }
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleDeleteGroup = async (group: TaskGroup) => {
    if (isViewer || isCompleted) return;
    if (!requireWorkerSelection()) return;

    const groupTasks = tasks.filter((t) => t.task_group_id === group.id);
    if (groupTasks.length > 0) {
      setDeleteGroupModalState({
        isOpen: true,
        group,
        taskCount: groupTasks.length,
      });
      return;
    }

    const gName = lang === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);
    if (!confirm(lang === 'vi' ? `Bạn có chắc muốn xóa nhóm [${gName}]?` : `공정 대분류 [${gName}]을 삭제하시겠습니까?`)) return;

    try {
      await api.deleteTaskGroup(group.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleConfirmDeleteGroup = async (options: { move_to_group_id?: string; delete_tasks?: boolean }) => {
    if (!deleteGroupModalState.group) return;
    try {
      await api.deleteTaskGroup(deleteGroupModalState.group.id, options);
      await fetchProjectDetail();
      setDeleteGroupModalState({ isOpen: false, group: null, taskCount: 0 });
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
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
                data-testid="desktop-manage-calendar-btn"
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
                  data-testid="add-task-group-btn"
                  onClick={handleOpenAddGroup}
                  className="h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                >
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  <span>{lang === 'vi' ? '+ Thêm nhóm' : '+ 공정 대분류 추가'}</span>
                </button>
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
                    className="sticky left-0 z-30 bg-slate-100 px-3 py-2 font-bold text-slate-800 border-r border-slate-200 w-[360px] lg:w-[420px] min-w-[360px] lg:min-w-[420px]"
                  >
                    <div className="flex items-center text-xs font-bold text-slate-900 justify-between">
                      <span className="w-[180px] lg:w-[220px] truncate">{lang === 'vi' ? 'Công việc chi tiết' : '세부 작업명'}</span>
                      <span className="w-[126px] lg:w-[150px] truncate px-1">{lang === 'vi' ? 'Người phụ trách' : '작업자'}</span>
                      <span className="w-[48px] lg:w-[50px] text-right">{lang === 'vi' ? 'Thao tác' : '액션'}</span>
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
                    const offInfo = getCountryOffState(col.dateStr, calendarOverrides, countryHolidays);

                    let bgStyle = 'bg-white text-slate-700 border-slate-200';
                    if (offInfo.state === 'BOTH_OFF') {
                      bgStyle = 'bg-rose-100 text-rose-900 border-rose-300 font-semibold';
                    } else if (offInfo.state === 'KR_ONLY_OFF') {
                      bgStyle = 'bg-orange-50 text-orange-900 border-orange-200 font-medium';
                    } else if (offInfo.state === 'VN_ONLY_OFF') {
                      bgStyle = 'bg-amber-50 text-amber-900 border-amber-200 font-medium';
                    }

                    const todayStyle = col.isToday ? 'ring-2 ring-blue-500 ring-inset font-bold' : '';

                    let ariaText = `${col.dateStr} (${col.dayName})`;
                    if (offInfo.krHolidayName && offInfo.vnHolidayName) {
                      ariaText += `, 한국과 베트남 모두 공휴일 (${offInfo.krHolidayName})`;
                    } else if (offInfo.krHolidayName) {
                      ariaText += `, 한국 공휴일 (${offInfo.krHolidayName}), 베트남 정상 근무`;
                    } else if (offInfo.vnHolidayName) {
                      ariaText += `, 베트남 공휴일 (${offInfo.vnHolidayName}), 한국 정상 근무`;
                    } else if (offInfo.state === 'BOTH_OFF') {
                      ariaText += `, 한국과 베트남 모두 휴무`;
                    } else if (offInfo.state === 'KR_ONLY_OFF') {
                      ariaText += `, 한국 휴무, 베트남 근무`;
                    } else if (offInfo.state === 'VN_ONLY_OFF') {
                      ariaText += `, 베트남 휴무, 한국 근무`;
                    }

                    const hasHoliday = !!offInfo.krHolidayName || !!offInfo.vnHolidayName;

                    return (
                      <th
                        key={idx}
                        data-testid="calendar-date-header"
                        data-date={col.dateStr}
                        data-country-off-state={offInfo.state}
                        aria-label={ariaText}
                        onClick={() => setHeaderInfoState({ isOpen: true, dateStr: col.dateStr, dayName: col.dayName })}
                        style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px`, height: '44px' }}
                        className={`relative text-center py-1 border-r border-slate-200 text-[11px] font-medium cursor-pointer transition select-none ${bgStyle} ${todayStyle}`}
                      >
                        {hasHoliday && (
                          <div
                            className={`absolute top-0 left-0 right-0 h-[2px] ${
                              offInfo.krHolidayName && offInfo.vnHolidayName
                                ? 'bg-rose-600'
                                : offInfo.krHolidayName
                                ? 'bg-orange-500'
                                : 'bg-amber-500'
                            }`}
                          />
                        )}
                        <div>{col.dayNum}</div>
                        <div className="text-[10px] opacity-85">{col.dayName}</div>
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
                ) : (
                  (() => {
                    const groupsToRender = taskGroups.length > 0 ? taskGroups : [
                      { id: 'default', project_id: projectId!, group_name: '기존 작업', group_name_ko: '기존 작업', group_name_vi: 'Công việc hiện có', color_key: 'BLUE' as TaskGroupColorKey, sort_order: 1 }
                    ];

                    const GROUP_BORDER_COLORS: Record<TaskGroupColorKey, string> = {
                      BLUE: 'border-l-blue-500',
                      GREEN: 'border-l-emerald-500',
                      ORANGE: 'border-l-amber-500',
                      VIOLET: 'border-l-purple-500',
                      SLATE: 'border-l-slate-500',
                    };

                    return groupsToRender.map((group, gIdx) => {
                      const groupNum = gIdx + 1;
                      const groupName = lang === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);
                      const groupTasks = tasks.filter((tItem) => tItem.task_group_id === group.id || (!tItem.task_group_id && gIdx === 0));
                      const isCollapsed = !!collapsedGroupIds[group.id];

                      return (
                        <React.Fragment key={group.id}>
                          {/* Task Group Header Row */}
                          <tr
                            data-testid={`task-group-row-${group.id}`}
                            className="bg-slate-100/90 hover:bg-slate-200/80 transition"
                          >
                            <td className={`sticky left-0 z-10 bg-slate-100/90 px-3 py-1 border-r border-slate-200 border-b border-l-4 ${GROUP_BORDER_COLORS[group.color_key || 'BLUE']} h-10 align-middle w-[360px] lg:w-[420px]`}>
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                  <button
                                    type="button"
                                    data-testid={`task-group-toggle-${group.id}`}
                                    onClick={() => toggleGroupCollapse(group.id)}
                                    className="p-1 rounded hover:bg-slate-300/60 text-slate-600 transition shrink-0"
                                  >
                                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                  <span className="font-extrabold text-slate-900 truncate">
                                    {groupNum}. {groupName}
                                  </span>
                                  {isCollapsed && (
                                    <span className="text-[11px] text-slate-500 font-semibold shrink-0">
                                      · {groupTasks.length}{lang === 'vi' ? ' công việc' : '개 작업'}
                                    </span>
                                  )}
                                </div>

                                {!isViewer && !isCompleted && group.id !== 'default' && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      data-testid={`task-group-edit-${group.id}`}
                                      onClick={() => handleOpenEditGroup(group)}
                                      className="p-1 rounded hover:bg-slate-300/60 text-slate-600 transition"
                                      title={lang === 'vi' ? 'Sửa nhóm' : '대분류 수정'}
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`task-group-delete-${group.id}`}
                                      onClick={() => handleDeleteGroup(group)}
                                      className="p-1 rounded hover:bg-rose-200 text-rose-700 transition"
                                      title={lang === 'vi' ? 'Xóa nhóm' : '대분류 삭제'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td colSpan={dateColumns.length} className="h-10 bg-slate-100/60 border-b border-slate-200" />
                          </tr>

                          {/* Detail Tasks Rows */}
                          {!isCollapsed && groupTasks.map((task, tIdx) => {
                            const taskNumStr = `${groupNum}.${tIdx + 1}`;
                            const taskDisplayName = getTaskDisplayName(task);
                            const workerObj = workers.find((w) => w.id === task.worker_name || w.name === task.worker_name);
                            const targetWorkerObj = workerObj || {
                              id: task.worker_name,
                              name: task.worker_name,
                              country_code: 'KR' as CountryCode,
                              workweek_profile: 'MON_FRI' as WorkweekProfile,
                            };

                            const spanInfo = getGanttSpanColumns(task.start_date, task.end_date, dateColumns);

                            return (
                              <tr
                                key={task.id}
                                data-testid={`task-row-${task.id}`}
                                className="hover:bg-blue-50/30 transition group h-11 border-b border-slate-200"
                              >
                                {/* Left Info Column (3 sub-columns: Task Name, Assignees, Actions) */}
                                <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/30 px-3 py-1 border-r border-slate-200 w-[360px] lg:w-[420px] h-11 align-middle">
                                  <div className="flex items-center justify-between text-xs w-full">
                                    {/* Sub-col 1: Task Number + Task Name */}
                                    <div className="w-[180px] lg:w-[220px] flex items-center gap-1.5 min-w-0 pr-1">
                                      {task.has_schedule_conflict && (
                                        <span
                                          data-testid="task-conflict-badge"
                                          className="p-0.5 rounded bg-rose-100 text-rose-700 shrink-0 cursor-help"
                                          title={`일정 중복 경고: ${task.schedule_conflicts?.map((c) => `${c.conflict_project_name} (${c.overlapping_working_days}일 중복)`).join(', ')}`}
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                                        </span>
                                      )}
                                      <span className="font-bold text-slate-500 shrink-0 text-[11px]">{taskNumStr}</span>
                                      <span className="font-semibold text-slate-900 truncate text-xs" title={taskDisplayName}>
                                        {taskDisplayName}
                                      </span>
                                    </div>

                                    {/* Sub-col 2: Assignees Chips */}
                                    <div className="w-[126px] lg:w-[150px] flex items-center gap-1 min-w-0 px-1 overflow-hidden">
                                      {(() => {
                                        const assignees = task.assignees || [];
                                        const primaryName = task.worker_name || assignees.find((a) => a.assignment_role === 'PRIMARY')?.name || '담당자 미정';
                                        const hasMulti = assignees.length > 1;

                                        return (
                                          <div data-testid={`task-assignees-chip-${task.id}`} className="flex items-center gap-1 truncate">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-[95px]">
                                              {primaryName}
                                            </span>
                                            {hasMulti && (
                                              <span className="px-1 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                                                +{assignees.length - 1}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* Sub-col 3: Action Buttons */}
                                    <div className="w-[48px] lg:w-[50px] flex items-center justify-end gap-1 shrink-0">
                                      {!isViewer && !isCompleted && (
                                        <>
                                          <button
                                            type="button"
                                            data-testid={`task-edit-${task.id}`}
                                            onClick={() => handleEditTask(task)}
                                            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition"
                                            title={lang === 'vi' ? 'Sửa' : '수정'}
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            data-testid={`task-delete-${task.id}`}
                                            onClick={() => handleDeleteTask(task)}
                                            className="p-1 rounded hover:bg-rose-100 text-rose-600 transition"
                                            title={lang === 'vi' ? 'Xóa' : '삭제'}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Gantt Date Cells with Overlay ScheduleBar */}
                                {dateColumns.map((col, cIdx) => {
                                  const dayStatus = resolveWorkDayStatus(
                                    col.dateStr,
                                    targetWorkerObj as any,
                                    countryHolidays,
                                    calendarOverrides
                                  );

                                  const isFirstCol = spanInfo ? spanInfo.startIndex === cIdx : false;
                                  const spanCount = spanInfo ? spanInfo.spanCount : 1;

                                  return (
                                    <td
                                      key={cIdx}
                                      onClick={() => handleCellClick(task, col.dateStr, dayStatus, workerObj || null)}
                                      style={{
                                        width: `${GANTT_DAY_WIDTH_PX}px`,
                                        minWidth: `${GANTT_DAY_WIDTH_PX}px`,
                                        maxWidth: `${GANTT_DAY_WIDTH_PX}px`,
                                        height: '44px',
                                      }}
                                      className="relative border-r border-slate-200 p-0 text-center align-middle cursor-pointer hover:brightness-95 transition"
                                    >
                                      <WorkerDayCellBackground
                                        dateStr={col.dateStr}
                                        worker={targetWorkerObj as any}
                                        assignees={task.assignees}
                                        availabilityPolicy={task.availability_policy}
                                        dayStatus={dayStatus}
                                        countryHolidays={countryHolidays}
                                        calendarOverrides={calendarOverrides}
                                        workers={workers}
                                        isToday={col.isToday}
                                      />

                                      {/* Gantt Schedule Bar Overlay */}
                                      {isFirstCol && (
                                        <div
                                          className="absolute left-0 top-0 bottom-0 z-30 flex items-center px-1"
                                          style={{
                                            width: `${spanCount * GANTT_DAY_WIDTH_PX}px`,
                                          }}
                                        >
                                          <ScheduleBar
                                            title={taskDisplayName}
                                            startDate={task.start_date}
                                            endDate={task.end_date}
                                            calendarSpanDays={spanCount}
                                            plannedWorkingDays={task.planned_working_days || spanCount}
                                            plannedProgress={task.planned_progress ?? task.progress ?? 0}
                                            actualProgress={task.actual_progress ?? task.progress ?? 0}
                                            status={task.schedule_state || 'UPCOMING'}
                                            hasConflict={task.has_schedule_conflict}
                                            onClick={() => handleEditTask(task)}
                                          />
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    });
                  })()
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
        taskGroups={taskGroups}
        holidays={countryHolidays}
        overrides={calendarOverrides}
        workers={workers}
      />

      <TaskGroupModal
        isOpen={isGroupModalOpen}
        group={selectedGroup}
        currentWorker={currentWorker}
        onClose={() => setIsGroupModalOpen(false)}
        onSave={handleSaveGroup}
      />

      <TaskGroupDeleteModal
        isOpen={deleteGroupModalState.isOpen}
        group={deleteGroupModalState.group}
        otherGroups={taskGroups.filter((g) => g.id !== deleteGroupModalState.group?.id)}
        taskCount={deleteGroupModalState.taskCount}
        onClose={() => setDeleteGroupModalState({ isOpen: false, group: null, taskCount: 0 })}
        onConfirm={handleConfirmDeleteGroup}
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
