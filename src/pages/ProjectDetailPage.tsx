// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, DailyStatusType } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import {
  GANTT_DAY_WIDTH_PX,
  BUTTON_H36_CLASS,
  PRIMARY_BUTTON_H36_CLASS,
} from '../constants/gantt';
import { TaskModal } from '../components/modals/TaskModal';
import { StatusPopover } from '../components/modals/StatusPopover';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { LanguageSelector } from '../components/common/LanguageSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { ArrowLeft, Plus, Edit2, Trash2, RotateCcw, Lock } from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, lang } = useI18n();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Worker State
  const [currentWorker, setCurrentWorker] = useState<string>(getCurrentWorkerName());
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);

  // Modal State for Task Add/Edit
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Popover State for Daily Date Status Selection
  const [popover, setPopover] = useState<{
    isOpen: boolean;
    taskId: string;
    dateStr: string;
    currentStatus: DailyStatusType;
    position: { x: number; y: number } | null;
    triggerRect: DOMRect | null;
  }>({
    isOpen: false,
    taskId: '',
    dateStr: '',
    currentStatus: 'NONE',
    position: null,
    triggerRect: null,
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

  const fetchDetail = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const res = await api.getProjectDetail(projectId);
      setProject(res.project);
      setTasks(res.tasks || []);
    } catch (err: any) {
      console.error(err);
      alert(getLocalizedErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    const saved = getCurrentWorkerName();
    if (saved) setCurrentWorker(saved);
  }, [projectId]);

  const isCompleted = project?.status === 'COMPLETED';

  const requireWorkerSelection = (): boolean => {
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return false;
    }
    const active = currentWorker || getCurrentWorkerName();
    if (!active) {
      setIsWorkerPromptOpen(true);
      return false;
    }
    return true;
  };

  const handleOpenAddTask = () => {
    if (!requireWorkerSelection()) return;
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    if (!projectId) return;
    if (!requireWorkerSelection()) return;
    try {
      if (selectedTask) {
        await api.updateTask(selectedTask.id, data);
      } else {
        await api.createTask({ ...data, project_id: projectId });
      }
      await fetchDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleDeleteTask = async (id: string, name: string) => {
    if (!requireWorkerSelection()) return;
    if (!window.confirm(`'${name}' ${t('deleteConfirm')}`)) return;
    try {
      await api.deleteTask(id);
      await fetchDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleEditTask = (task: Task) => {
    if (!requireWorkerSelection()) return;
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleReopenProject = async () => {
    if (!projectId) return;
    const active = currentWorker || getCurrentWorkerName();
    if (!active) {
      setIsWorkerPromptOpen(true);
      return;
    }
    if (!window.confirm(t('reopenConfirmMsg'))) return;
    try {
      await api.reopenProject(projectId);
      await fetchDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleCellClick = (e: React.MouseEvent, taskId: string, dateStr: string, currentStatus: DailyStatusType) => {
    e.stopPropagation();
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      isOpen: true,
      taskId,
      dateStr,
      currentStatus: currentStatus || 'NONE',
      position: { x: rect.left + rect.width / 2, y: rect.bottom },
      triggerRect: rect,
    });
  };

  const handleSelectDailyStatus = async (status: DailyStatusType) => {
    if (!popover.taskId || !popover.dateStr) return;
    if (!requireWorkerSelection()) return;
    try {
      const activeWorker = currentWorker || getCurrentWorkerName();
      setTasks((prev) =>
        prev.map((tItem) => {
          if (tItem.id === popover.taskId) {
            const nextStatuses = { ...tItem.daily_statuses, [popover.dateStr]: status };
            const nextDetails = {
              ...tItem.daily_status_details,
              [popover.dateStr]: { status, updated_by_name: activeWorker },
            };
            return { ...tItem, daily_statuses: nextStatuses, daily_status_details: nextDetails };
          }
          return tItem;
        })
      );

      await api.updateDailyStatus(popover.taskId, popover.dateStr, status);
      await fetchDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
      await fetchDetail();
    }
  };

  const getStatusBgClass = (status?: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'bg-blue-600 text-white font-bold';
      case 'COMPLETED':
        return 'bg-emerald-600 text-white font-bold';
      case 'ISSUE':
        return 'bg-amber-500 text-white font-bold';
      default:
        return 'hover:bg-slate-100';
    }
  };

  const getStatusText = (status?: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS':
        return t('statusInProgress');
      case 'COMPLETED':
        return t('statusCompleted');
      case 'ISSUE':
        return t('statusIssue');
      default:
        return t('statusNone');
    }
  };

  const getTaskDisplayName = (tItem: Task): string => {
    if (lang === 'vi') {
      return tItem.task_name_vi || tItem.task_name;
    }
    return tItem.task_name_ko || tItem.task_name;
  };

  const getProjectDisplayName = (prj: Project): string => {
    if (lang === 'vi') return prj.name_vi || prj.name;
    return prj.name_ko || prj.name;
  };

  const legendSlot = (
    <div className="flex items-center gap-3 text-xs font-medium">
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded bg-white border border-slate-300 inline-block" />
        <span className="text-slate-600">{t('statusNone')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" />
        <span className="text-slate-700">{t('statusInProgress')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
        <span className="text-slate-700">{t('statusCompleted')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
        <span className="text-slate-700">{t('statusIssue')}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Row A: Main App Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 h-16 flex items-center justify-between gap-4 shadow-sm shrink-0 flex-nowrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            aria-label={t('backToList')}
          >
            <ArrowLeft className="w-4 h-4 text-slate-500 shrink-0" />
            <span>{t('backToList')}</span>
          </button>

          {/* Integrated Logo Container */}
          <div className="hidden sm:flex items-center shrink-0">
            <img src="/logo3.png" alt="CON-COST × VIETQS" className="h-7 object-contain max-w-[170px]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate">
              <h1 className="text-base font-bold text-slate-900 tracking-tight truncate">
                {project ? getProjectDisplayName(project) : '프로젝트 상세 정보'}
              </h1>
              {project && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-blue-50 text-blue-700 border-blue-300'
                }`}>
                  {project.progress}%
                </span>
              )}
            </div>
            {project && (
              <p className="hidden md:block text-[11px] text-slate-500 truncate">
                {t('startDate')}: {project.start_date} ~ {project.end_date}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <LanguageSelector />

          <WorkerSelector
            currentWorker={currentWorker}
            onWorkerChange={(name) => setCurrentWorker(name)}
          />

          {isCompleted ? (
            <button
              type="button"
              onClick={handleReopenProject}
              className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('reopenProject')}</span>
            </button>
          ) : (
            <button onClick={handleOpenAddTask} className={PRIMARY_BUTTON_H36_CLASS}>
              <Plus className="w-4 h-4" />
              <span>{t('addTask')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Read-Only Notice for Completed Projects */}
      {isCompleted && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 flex items-center justify-between text-xs text-amber-800 font-semibold shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>{t('readOnlyCompletedNotice')}</span>
          </div>
          <button
            type="button"
            onClick={handleReopenProject}
            className="underline text-amber-900 hover:text-amber-700 font-bold ml-4"
          >
            {t('reopenProject')}
          </button>
        </div>
      )}

      {/* Row B: Gantt Toolbar (View Controls & Legend) */}
      <GanttViewControls
        viewMode={viewMode}
        rangeTitle={rangeTitle}
        onViewModeChange={changeViewMode}
        onPrevious={goPrevious}
        onNext={goNext}
        onToday={goToday}
        rightSlot={legendSlot}
      />

      {/* Main Gantt Table Area */}
      <main className="flex-1 p-4 2xl:p-6 overflow-hidden flex flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto custom-scrollbar relative"
        >
          <table className="w-full border-collapse text-left min-w-max">
            <thead className="sticky top-0 z-20 bg-slate-100 text-xs uppercase tracking-wider text-slate-700">
              <tr className="border-b border-slate-200">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 font-bold text-slate-800 border-r border-slate-200 w-[295px] min-w-[295px] max-w-[295px]"
                >
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                    <span>{t('worker')} / {t('taskContent')}</span>
                    <span className="text-[10px] text-slate-500 font-normal">{t('progress')} / {t('startDate')}</span>
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
                      col.isToday
                        ? 'bg-blue-100 text-blue-800 font-bold'
                        : col.isWeekend
                        ? 'bg-slate-50 text-slate-400'
                        : 'bg-white text-slate-600'
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
                    {t('noData')}
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

                  return (
                    <tr key={task.id} className="hover:bg-blue-50/50 transition group">
                      {/* Fixed Left Column */}
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 px-3 py-2.5 border-r border-slate-200 w-[295px] min-w-[295px] max-w-[295px] align-middle">
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
                            <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                              {task.start_date} ~ {task.end_date}
                              {task.updated_by_name && (
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({task.updated_by_name})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {task.progress}%
                            </span>
                            {!isCompleted && (
                              <div className="flex items-center gap-0.5 opacity-80 hover:opacity-100 transition">
                                <button
                                  type="button"
                                  onClick={() => handleEditTask(task)}
                                  aria-label={t('editTask')}
                                  title={t('editTask')}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id, taskDisplayName)}
                                  aria-label={t('deleteTask')}
                                  title={t('deleteTask')}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-red-50 rounded text-slate-600 hover:text-red-600 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Right Date Cells */}
                      {dateColumns.map((col, cIdx) => {
                        const isInTaskSpan = isVisible && cIdx >= startIndex && cIdx < startIndex + durationDays;
                        const status = task.daily_statuses?.[col.dateStr] || 'NONE';
                        const detail = task.daily_status_details?.[col.dateStr];
                        const updatedBy = detail?.updated_by_name || (status !== 'NONE' ? task.worker_name : '');
                        const bgClass = getStatusBgClass(status);

                        const tooltipText = isInTaskSpan
                          ? `${col.dateStr}\n${t('progress')}: ${getStatusText(status)}${updatedBy ? `\n수정자: ${updatedBy}` : ''}`
                          : '';

                        return (
                          <td
                            key={cIdx}
                            title={tooltipText}
                            style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                            onClick={(e) => isInTaskSpan && handleCellClick(e, task.id, col.dateStr, status)}
                            className={`p-0 text-center relative border-r border-slate-200 align-middle transition ${
                              isInTaskSpan && !isCompleted ? 'cursor-pointer hover:brightness-110' : ''
                            } ${
                              isInTaskSpan
                                ? bgClass
                                : col.isToday
                                ? 'bg-blue-50/70'
                                : col.isWeekend
                                ? 'bg-slate-50/60'
                                : ''
                            }`}
                          >
                            {col.isToday && (
                              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-blue-500 z-10 opacity-70 pointer-events-none" />
                            )}

                            {isInTaskSpan && status === 'NONE' && (
                              <div className="w-full h-full min-h-[34px] bg-blue-50/50 border-y border-blue-200/60 flex items-center justify-center text-[10px] text-blue-500 font-mono">
                                •
                              </div>
                            )}

                            {isInTaskSpan && status !== 'NONE' && (
                              <div className="w-full h-full min-h-[34px] flex items-center justify-center text-[10px] font-bold">
                                {getStatusText(status)}
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
      </main>

      {/* Modals */}
      {projectId && (
        <TaskModal
          isOpen={isTaskModalOpen}
          projectId={projectId}
          task={selectedTask}
          currentWorkerName={currentWorker}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleSaveTask}
        />
      )}

      <StatusPopover
        isOpen={popover.isOpen}
        position={popover.position}
        triggerRect={popover.triggerRect}
        currentStatus={popover.currentStatus}
        dateStr={popover.dateStr}
        onSelect={handleSelectDailyStatus}
        onClose={() => setPopover((prev) => ({ ...prev, isOpen: false }))}
      />

      <WorkerPromptModal
        isOpen={isWorkerPromptOpen}
        onClose={() => setIsWorkerPromptOpen(false)}
        onSelectWorker={(name) => setCurrentWorker(name)}
      />
    </div>
  );
};
