// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, Worker, CountryHoliday, CalendarOverride, DailyStatusType, WorkDayStatus } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
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
import { LanguageSelector } from '../components/common/LanguageSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { MobileAppHeader } from '../components/mobile/MobileAppHeader';
import { MobileWorkerSheet } from '../components/mobile/MobileWorkerSheet';
import { MobileTaskCard } from '../components/mobile/MobileTaskCard';
import { MobileWeekDay } from '../components/mobile/MobileWeekStrip';
import { MobileStatusSheet } from '../components/mobile/MobileStatusSheet';
import { CalendarManagerModal } from '../components/modals/CalendarManagerModal';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Users,
  CheckCircle,
  RotateCcw,
  Calendar,
} from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { isMobile } = useResponsiveLayout();

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
  const [currentWorker, setCurrentWorker] = useState<string>(getCurrentWorkerName());
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);
  const [isMobileWorkerSheetOpen, setIsMobileWorkerSheetOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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
      setWorkers(wData || []);
      setCountryHolidays([...(krData || []), ...(vnData || [])]);
      setCalendarOverrides(ovrData || []);
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
    const saved = getCurrentWorkerName();
    if (saved) setCurrentWorker(saved);
  }, [projectId]);

  const requireWorkerSelection = (): boolean => {
    const active = currentWorker || getCurrentWorkerName();
    if (!active) {
      if (isMobile) {
        setIsMobileWorkerSheetOpen(true);
      } else {
        setIsWorkerPromptOpen(true);
      }
      return false;
    }
    return true;
  };

  const isCompleted = project?.status === 'COMPLETED';

  const handleOpenAddTask = () => {
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (data: Partial<Task>) => {
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
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleEditTask = (taskItem: Task) => {
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedTask(taskItem);
    setIsTaskModalOpen(true);
  };

  const handleDeleteTask = async (taskItem: Task) => {
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    const taskName = getTaskDisplayName(taskItem);
    if (!window.confirm(`'${taskName}' ${t('deleteConfirm')}`)) return;
    try {
      await api.deleteTask(taskItem.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleCompleteProject = async () => {
    if (!project) return;
    if (!requireWorkerSelection()) return;
    const displayName = getProjectDisplayName(project);
    const confirmMsg = t('completeConfirmMsg', { name: displayName });
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.completeProject(project.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleReopenProject = async () => {
    if (!project) return;
    if (!requireWorkerSelection()) return;
    if (!window.confirm(t('reopenConfirmMsg'))) return;

    try {
      await api.reopenProject(project.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  // Status Cell Handler
  const handleCellClick = (e: React.MouseEvent, taskId: string, dateStr: string, currentStatus: DailyStatusType) => {
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverState({
      isOpen: true,
      taskId,
      dateStr,
      currentStatus,
      anchorRect: rect,
    });
  };

  const handleMobileCellClick = (taskId: string, dateStr: string, currentStatus: DailyStatusType, workStatus?: WorkDayStatus) => {
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    const taskItem = tasks.find((tItem) => tItem.id === taskId);
    const taskName = taskItem ? getTaskDisplayName(taskItem) : '';
    setMobileStatusSheetState({
      isOpen: true,
      taskId,
      dateStr,
      taskName,
      currentStatus,
      workStatus,
    });
  };

  const handleSelectStatus = async (status: DailyStatusType) => {
    const targetTaskId = popoverState.isOpen ? popoverState.taskId : mobileStatusSheetState.taskId;
    const targetDateStr = popoverState.isOpen ? popoverState.dateStr : mobileStatusSheetState.dateStr;

    try {
      await api.updateDailyStatus(targetTaskId, targetDateStr, status);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    } finally {
      setPopoverState((prev) => ({ ...prev, isOpen: false }));
      setMobileStatusSheetState((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const getProjectDisplayName = (prj: Project): string => {
    if (lang === 'vi') return prj.name_vi || prj.name;
    return prj.name_ko || prj.name;
  };

  const getTaskDisplayName = (tItem: Task): string => {
    if (lang === 'vi') return tItem.task_name_vi || tItem.task_name;
    return tItem.task_name_ko || tItem.task_name;
  };

  const tasksByWorker = tasks.reduce((acc, tItem) => {
    const w = tItem.worker_name || t('worker');
    if (!acc[w]) acc[w] = [];
    acc[w].push(tItem);
    return acc;
  }, {} as Record<string, Task[]>);

  const getStatusBgClass = (status: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'bg-blue-600 text-white font-bold';
      case 'COMPLETED':
        return 'bg-emerald-600 text-white font-bold';
      case 'ISSUE':
        return 'bg-amber-500 text-white font-bold';
      default:
        return 'bg-transparent text-slate-400';
    }
  };

  const getHolidayCellBgClass = (ws: WorkDayStatus, isToday: boolean) => {
    let base = 'bg-white';
    switch (ws.day_type) {
      case 'PUBLIC_HOLIDAY':
        base = 'bg-rose-50/80 text-rose-700';
        break;
      case 'LEAVE':
        base = 'bg-violet-100/80 text-violet-700';
        break;
      case 'MANUAL_OFF':
        base = 'bg-amber-100/80 text-amber-700';
        break;
      case 'WORK_OVERRIDE':
        base = 'bg-cyan-100/80 text-cyan-700';
        break;
      case 'WEEKLY_OFF':
        base = 'bg-slate-100/80 text-slate-500';
        break;
      default:
        base = 'bg-white';
    }
    if (isToday) {
      return `${base} ring-2 ring-blue-500 z-10`;
    }
    return base;
  };

  const mobile7DaysCols = dateColumns.slice(0, 7);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans max-w-full overflow-x-hidden">
      {/* Header */}
      {isMobile ? (
        <MobileAppHeader
          title={project ? getProjectDisplayName(project) : ''}
          isDetailPage={true}
          onBack={() => navigate('/projects')}
          currentWorker={currentWorker}
          onOpenWorkerSheet={() => setIsMobileWorkerSheetOpen(true)}
          onOpenCalendarModal={() => setIsCalendarModalOpen(true)}
        />
      ) : (
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 h-16 flex items-center justify-between gap-4 shadow-sm shrink-0 flex-nowrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              data-testid="back-to-list-btn"
              onClick={() => navigate('/projects')}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition shrink-0"
              title={t('backToList')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 truncate">
                  {project ? getProjectDisplayName(project) : ''}
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
            <button
              type="button"
              data-testid="manage-holidays-btn"
              onClick={() => setIsCalendarModalOpen(true)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition"
            >
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>{t('manageHolidays')}</span>
            </button>

            <LanguageSelector />
            <WorkerSelector
              currentWorker={currentWorker}
              onWorkerChange={(name) => setCurrentWorker(name)}
            />

            {!isCompleted ? (
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
            )}
          </div>
        </header>
      )}

      {/* Controls Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 md:px-5 py-2">
        {isMobile ? (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold w-full">
              <button
                type="button"
                data-testid="mobile-view-summary-btn"
                onClick={() => handleMobileViewChange('SUMMARY')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'SUMMARY'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                {t('summaryView')}
              </button>
              <button
                type="button"
                data-testid="mobile-view-week-btn"
                onClick={() => handleMobileViewChange('WEEK')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'WEEK'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                {t('week7View')}
              </button>
              <button
                type="button"
                data-testid="mobile-view-gantt-btn"
                onClick={() => handleMobileViewChange('GANTT')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'GANTT'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                {t('gantt30View')}
              </button>
            </div>
          </div>
        ) : (
          <GanttViewControls
            viewMode={viewMode}
            rangeTitle={rangeTitle}
            onViewModeChange={changeViewMode}
            onPrevious={goPrevious}
            onNext={goNext}
            onToday={goToday}
          />
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 p-3 md:p-5 overflow-x-hidden flex flex-col">
        {/* MOBILE VIEW */}
        {isMobile && (mobileViewMode === 'SUMMARY' || mobileViewMode === 'WEEK') ? (
          <div className="space-y-4 w-full">
            {project && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-slate-900 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-sm text-slate-900 tracking-tight leading-snug">
                    {getProjectDisplayName(project)}
                  </h2>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {project.progress}%
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {t('startDate')}: {project.start_date} ~ {project.end_date}
                </div>
              </div>
            )}

            {Object.entries(tasksByWorker).map(([workerName, wTasks]) => {
              const workerObj = workers.find((w) => w.name === workerName) || {
                id: workerName,
                name: workerName,
                country_code: (workerName.includes('탄') || workerName.includes('끄엉') || workerName.includes('꾸옥') || workerName.includes('Thanh') || workerName.includes('Manh') || workerName.includes('Quoc')) ? 'VN' : 'KR',
                workweek_profile: (workerName.includes('탄') || workerName.includes('끄엉') || workerName.includes('꾸옥') || workerName.includes('Thanh') || workerName.includes('Manh') || workerName.includes('Quoc')) ? 'MON_SAT' : 'MON_FRI',
              };

              return (
                <div key={workerName} className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>{workerName} ({workerObj.country_code || 'KR'})</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      {t('tasksCount', { count: String(wTasks.length) })}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {wTasks.map((tItem) => {
                      const weekDays: MobileWeekDay[] = mobile7DaysCols.map((col) => {
                        const { isVisible, startIndex, durationDays } = calculateVisibleGanttSpan(
                          tItem.start_date,
                          tItem.end_date,
                          startDate,
                          endDate
                        );
                        const cIdx = dateColumns.findIndex((c) => c.dateStr === col.dateStr);
                        const isInTaskSpan = isVisible && cIdx >= startIndex && cIdx < startIndex + durationDays;
                        const workStatus = resolveWorkDayStatus(col.dateStr, workerObj as any, countryHolidays, calendarOverrides);

                        return {
                          dateStr: col.dateStr,
                          dayNum: col.dayNum,
                          dayName: col.dayName,
                          isToday: col.isToday,
                          isWeekend: col.isWeekend,
                          isInTaskSpan,
                          workStatus,
                        };
                      });

                      return (
                        <MobileTaskCard
                          key={tItem.id}
                          task={tItem}
                          weekDays={weekDays}
                          onCellClick={handleMobileCellClick}
                          onEdit={(tData) => handleEditTask(tData)}
                          onDelete={(tData) => handleDeleteTask(tData)}
                          isReadOnly={isCompleted}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GANTT VIEW (Desktop / Tablet) */
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
                  {dateColumns.map((col, idx) => (
                    <th
                      key={idx}
                      style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                      className={`text-center py-1.5 border-r border-slate-200 text-[11px] font-medium ${
                        col.isToday ? 'bg-blue-100 text-blue-800 font-bold' : col.isWeekend ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-600'
                      }`}
                    >
                      <div>{col.dayNum}</div>
                      <div className="text-[10px] scale-90">{col.dayName}</div>
                    </th>
                  ))}
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
                    const { isVisible, startIndex, durationDays } = calculateVisibleGanttSpan(
                      task.start_date,
                      task.end_date,
                      startDate,
                      endDate
                    );
                    const taskDisplayName = getTaskDisplayName(task);
                    const workerObj = workers.find((w) => w.name === task.worker_name) || {
                      id: task.worker_name,
                      name: task.worker_name,
                      country_code: (task.worker_name.includes('탄') || task.worker_name.includes('끄엉') || task.worker_name.includes('꾸옥') || task.worker_name.includes('Thanh') || task.worker_name.includes('Manh') || task.worker_name.includes('Quoc')) ? 'VN' : 'KR',
                      workweek_profile: (task.worker_name.includes('탄') || task.worker_name.includes('끄엉') || task.worker_name.includes('꾸옥') || task.worker_name.includes('Thanh') || task.worker_name.includes('Manh') || task.worker_name.includes('Quoc')) ? 'MON_SAT' : 'MON_FRI',
                    };

                    return (
                      <tr key={task.id} data-testid={`task-row-${task.id}`} className="hover:bg-blue-50/40 transition group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/40 px-3 py-2.5 border-r border-slate-200 w-[170px] md:w-[295px] min-w-[170px] md:min-w-[295px] max-w-[295px] align-middle">
                          <div className="flex items-center justify-between">
                            <div className="pr-1 overflow-hidden min-w-0">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                  {task.worker_name}
                                </span>
                                <span className="font-semibold text-slate-900 truncate text-xs" title={taskDisplayName}>
                                  {taskDisplayName}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                data-testid={`task-edit-btn-${task.id}`}
                                onClick={() => handleEditTask(task)}
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                data-testid={`task-delete-btn-${task.id}`}
                                onClick={() => handleDeleteTask(task)}
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>

                        {dateColumns.map((col, cIdx) => {
                          const isInTaskSpan = isVisible && cIdx >= startIndex && cIdx < startIndex + durationDays;
                          const status = task.daily_statuses?.[col.dateStr] || 'NONE';
                          const detail = task.daily_status_details?.[col.dateStr];
                          const updatedBy = detail?.updated_by_name || (status !== 'NONE' ? task.worker_name : '');
                          const bgClass = getStatusBgClass(status);

                          const workStatus = resolveWorkDayStatus(col.dateStr, workerObj as any, countryHolidays, calendarOverrides);
                          const holidayBgClass = getHolidayCellBgClass(workStatus, col.isToday);

                          const tooltipText = `${col.dateStr} [${task.worker_name}] - ${lang === 'vi' ? workStatus.label_vi : workStatus.label_ko} (${workStatus.is_working_day ? (lang === 'vi' ? 'Ngày làm việc' : '근무일') : (lang === 'vi' ? 'Ngày nghỉ' : '휴무일')})${status !== 'NONE' ? ` | 상태: ${status}` : ''}${updatedBy ? ` (수정: ${updatedBy})` : ''}`;

                          return (
                            <td
                              key={cIdx}
                              title={tooltipText}
                              style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                              data-testid={`status-cell-${task.id}-${col.dateStr}`}
                              onClick={(e) => isInTaskSpan && handleCellClick(e, task.id, col.dateStr, status)}
                              className={`p-0 relative border-r border-slate-200 align-middle ${holidayBgClass} ${
                                isInTaskSpan && !isCompleted ? 'cursor-pointer hover:brightness-95' : ''
                              }`}
                            >
                              {isInTaskSpan && (
                                <div className="absolute inset-0.5 flex items-center justify-center">
                                  <div className={`w-full h-6 rounded-md shadow-2xs flex items-center justify-center text-[10px] transition-all ${bgClass}`}>
                                    {status === 'IN_PROGRESS' ? '•' : status === 'COMPLETED' ? '✓' : status === 'ISSUE' ? '!' : ''}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Popovers & Modals */}
      <StatusPopover
        isOpen={popoverState.isOpen}
        position={popoverState.anchorRect ? { x: popoverState.anchorRect.left + popoverState.anchorRect.width / 2, y: popoverState.anchorRect.bottom } : null}
        triggerRect={popoverState.anchorRect}
        dateStr={popoverState.dateStr}
        currentStatus={popoverState.currentStatus}
        onSelect={handleSelectStatus}
        onClose={() => setPopoverState((prev) => ({ ...prev, isOpen: false }))}
      />

      <MobileStatusSheet
        isOpen={mobileStatusSheetState.isOpen}
        dateStr={mobileStatusSheetState.dateStr}
        taskName={mobileStatusSheetState.taskName}
        currentStatus={mobileStatusSheetState.currentStatus}
        workStatus={mobileStatusSheetState.workStatus}
        onSelect={handleSelectStatus}
        onClose={() => setMobileStatusSheetState((prev) => ({ ...prev, isOpen: false }))}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        projectId={projectId || ''}
        task={selectedTask}
        currentWorkerName={currentWorker}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
      />

      <WorkerPromptModal
        isOpen={isWorkerPromptOpen}
        onClose={() => setIsWorkerPromptOpen(false)}
        onSelectWorker={(name) => {
          setCurrentWorker(name);
          setIsWorkerPromptOpen(false);
        }}
      />

      <MobileWorkerSheet
        isOpen={isMobileWorkerSheetOpen}
        onClose={() => setIsMobileWorkerSheetOpen(false)}
        currentWorker={currentWorker}
        onSelectWorker={(name) => {
          setCurrentWorker(name);
          setIsMobileWorkerSheetOpen(false);
        }}
      />

      <CalendarManagerModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        workers={workers}
        currentWorker={currentWorker}
        onRefreshCalendar={fetchCalendarData}
      />
    </div>
  );
};
