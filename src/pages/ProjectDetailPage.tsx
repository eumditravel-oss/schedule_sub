// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, Worker, CountryHoliday, CalendarOverride, DailyStatusType, WorkDayStatus, isExecutiveViewer, isEditableWorker } from '../types';
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

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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

  const handleUpdateDailyStatus = async (status: DailyStatusType) => {
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

      {/* Controls Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 md:px-5 py-2">
        {isMobileView ? (
          <div className="flex flex-col gap-2 w-full">
            <div role="tablist" aria-label="Mobile View Modes" className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold w-full">
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
                onTaskCellClick={(tItem, dateStr) => handleMobileCellClick(tItem, dateStr)}
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
                onTaskCellClick={(tItem, dateStr) => handleMobileCellClick(tItem, dateStr)}
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

                        {dateColumns.map((col, cIdx) => {
                          const isBarStart = isVisible && cIdx === startIndex;
                          const dayStatus = resolveWorkDayStatus(col.dateStr, workerObj as any, countryHolidays, calendarOverrides);
                          const statusVal = task.daily_statuses?.[col.dateStr];

                          return (
                            <td
                              key={cIdx}
                              style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                              className={`p-0 relative border-r border-slate-200 align-middle ${
                                !dayStatus.is_working_day
                                  ? dayStatus.day_type === 'LEAVE'
                                    ? 'bg-amber-100/70'
                                    : 'bg-slate-100/90'
                                  : col.isToday
                                  ? 'bg-blue-50/60'
                                  : 'bg-white'
                              }`}
                            >
                              {isBarStart && (
                                <div
                                  style={{ width: `${durationDays * GANTT_DAY_WIDTH_PX - 4}px` }}
                                  className="absolute left-0.5 top-1/2 -translate-y-1/2 h-7 bg-blue-600 rounded-md shadow-xs text-white text-xs font-bold flex items-center px-2 z-10 transition-all truncate"
                                >
                                  <span className="truncate">{taskDisplayName} ({task.progress}%)</span>
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
        onSelect={handleUpdateDailyStatus}
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
