// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, DailyStatusType, GanttDateColumn } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { TaskModal } from '../components/modals/TaskModal';
import { StatusPopover } from '../components/modals/StatusPopover';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { ArrowLeft, Plus, Edit2, Trash2 } from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

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
  }>({
    isOpen: false,
    taskId: '',
    dateStr: '',
    currentStatus: 'NONE',
    position: null,
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
      alert(err.message || '프로젝트 상세 정보를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    const saved = getCurrentWorkerName();
    if (saved) setCurrentWorker(saved);
  }, [projectId]);

  const requireWorkerSelection = (): boolean => {
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
    if (selectedTask) {
      await api.updateTask(selectedTask.id, data);
    } else {
      await api.createTask({ ...data, project_id: projectId });
    }
    await fetchDetail();
  };

  const handleDeleteTask = async (id: string, name: string) => {
    if (!requireWorkerSelection()) return;
    if (!window.confirm(`'${name}' 작업을 삭제하시겠습니까?`)) return;
    await api.deleteTask(id);
    await fetchDetail();
  };

  const handleEditTask = (task: Task) => {
    if (!requireWorkerSelection()) return;
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleCellClick = (e: React.MouseEvent, taskId: string, dateStr: string, currentStatus: DailyStatusType) => {
    e.stopPropagation();
    if (!requireWorkerSelection()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      isOpen: true,
      taskId,
      dateStr,
      currentStatus: currentStatus || 'NONE',
      position: { x: rect.left + rect.width / 2, y: rect.bottom },
    });
  };

  const handleSelectDailyStatus = async (status: DailyStatusType) => {
    if (!popover.taskId || !popover.dateStr) return;
    if (!requireWorkerSelection()) return;
    try {
      const activeWorker = currentWorker || getCurrentWorkerName();
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === popover.taskId) {
            const nextStatuses = { ...t.daily_statuses, [popover.dateStr]: status };
            const nextDetails = {
              ...t.daily_status_details,
              [popover.dateStr]: { status, updated_by_name: activeWorker },
            };
            return { ...t, daily_statuses: nextStatuses, daily_status_details: nextDetails };
          }
          return t;
        })
      );

      await api.updateDailyStatus(popover.taskId, popover.dateStr, status);
      await fetchDetail();
    } catch (err: any) {
      alert(err.message || '일별 상태 수정 중 오류가 발생했습니다.');
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
        return 'bg-amber-600 text-white font-bold';
      default:
        return 'hover:bg-slate-700/50';
    }
  };

  const getStatusText = (status?: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS':
        return '작업 중';
      case 'COMPLETED':
        return '완료';
      case 'ISSUE':
        return '문제 발생';
      default:
        return '미작업';
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* 1. Top Header */}
      <header className="sticky top-0 z-30 bg-slate-850 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/projects')}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>목록으로</span>
          </button>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {project ? project.name : '프로젝트 상세 정보'}
              </h1>
              {project && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-500/30">
                  전체 공정률 {project.progress}%
                </span>
              )}
            </div>
            {project && (
              <p className="text-xs text-slate-400 mt-0.5">
                전체 기간: <span className="text-slate-300 font-semibold">{project.start_date} ~ {project.end_date}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Gantt View Controls */}
          <GanttViewControls
            viewMode={viewMode}
            rangeTitle={rangeTitle}
            onViewModeChange={changeViewMode}
            onPrevious={goPrevious}
            onNext={goNext}
            onToday={goToday}
          />

          {/* Worker Selector */}
          <WorkerSelector
            currentWorker={currentWorker}
            onWorkerChange={(name) => setCurrentWorker(name)}
          />

          <button
            onClick={handleOpenAddTask}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>작업 추가</span>
          </button>
        </div>
      </header>

      {/* 2. Main Gantt Table Area */}
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="text-xs font-semibold text-slate-400">작업자별 세부 일정 및 일별 상태</span>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-700 border border-slate-600 inline-block" />
              <span className="text-slate-400">미작업</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-600 inline-block" />
              <span className="text-slate-300">작업 중</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
              <span className="text-slate-300">완료</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-600 inline-block" />
              <span className="text-slate-300">문제 발생</span>
            </div>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 bg-slate-850 border border-slate-800 rounded-2xl shadow-2xl overflow-auto custom-scrollbar relative"
        >
          <table className="w-full border-collapse text-left min-w-max">
            <thead className="sticky top-0 z-20 bg-slate-800 text-xs uppercase tracking-wider text-slate-300">
              <tr className="border-b border-slate-700/80">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 bg-slate-800 px-4 py-3 font-semibold text-slate-200 border-r border-slate-700 shadow-md min-w-[340px] max-w-[340px]"
                >
                  <div className="flex justify-between items-center text-sm font-bold text-white">
                    <span>작업자 / 작업내용</span>
                    <span className="text-[11px] text-slate-400 font-normal">공정률 / 기간</span>
                  </div>
                </th>
                {monthGroups.map((mg, idx) => (
                  <th
                    key={idx}
                    colSpan={mg.span}
                    className="text-center font-bold py-2 border-r border-slate-700/60 bg-slate-800/90 text-blue-300 text-xs"
                  >
                    {mg.monthStr}
                  </th>
                ))}
              </tr>

              <tr className="border-b border-slate-700">
                {dateColumns.map((col, idx) => (
                  <th
                    key={idx}
                    className={`w-[36px] min-w-[36px] max-w-[36px] text-center py-2 border-r border-slate-700/40 text-[11px] font-medium ${
                      col.isToday
                        ? 'bg-blue-900/60 text-blue-200 font-bold'
                        : col.isWeekend
                        ? 'bg-slate-900/60 text-slate-500'
                        : 'text-slate-400'
                    }`}
                  >
                    <div>{col.dayNum}</div>
                    <div className="text-[10px] scale-90">{col.dayName}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-400">
                    작업 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-400">
                    등록된 세부 작업이 없습니다. 상단의 '+ 작업 추가' 버튼을 눌러보세요.
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

                  return (
                    <tr key={task.id} className="hover:bg-slate-800/50 transition group">
                      {/* Fixed Left Column */}
                      <td className="sticky left-0 z-10 bg-slate-850 group-hover:bg-slate-800 px-4 py-3 border-r border-slate-700 shadow-md min-w-[340px] max-w-[340px] align-middle">
                        <div className="flex items-center justify-between">
                          <div className="pr-2 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-700 text-blue-300 shrink-0">
                                {task.worker_name}
                              </span>
                              <span className="font-semibold text-white truncate text-xs">{task.task_name}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-2">
                              <span>{task.start_date} ~ {task.end_date}</span>
                              {task.updated_by_name && (
                                <span className="text-[10px] text-slate-500 truncate">
                                  (수정: {task.updated_by_name})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-500/30">
                              {task.progress}%
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => handleEditTask(task)}
                                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                title="수정"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id, task.task_name)}
                                className="p-1 hover:bg-red-950 rounded text-slate-400 hover:text-red-400"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
                          ? `${col.dateStr}\n상태: ${getStatusText(status)}${updatedBy ? `\n수정자: ${updatedBy}` : ''}`
                          : '';

                        return (
                          <td
                            key={cIdx}
                            title={tooltipText}
                            onClick={(e) => isInTaskSpan && handleCellClick(e, task.id, col.dateStr, status)}
                            className={`w-[36px] min-w-[36px] max-w-[36px] p-0 text-center relative border-r border-slate-800/40 align-middle transition ${
                              isInTaskSpan ? 'cursor-pointer hover:brightness-125' : ''
                            } ${
                              isInTaskSpan
                                ? bgClass
                                : col.isToday
                                ? 'bg-blue-950/20'
                                : col.isWeekend
                                ? 'bg-slate-900/40'
                                : ''
                            }`}
                          >
                            {col.isToday && (
                              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-blue-500 z-10 opacity-70 pointer-events-none" />
                            )}

                            {isInTaskSpan && status === 'NONE' && (
                              <div className="w-full h-full min-h-[36px] bg-blue-950/30 border-y border-blue-500/20 flex items-center justify-center text-[10px] text-blue-400/60 font-mono">
                                •
                              </div>
                            )}

                            {isInTaskSpan && status !== 'NONE' && (
                              <div className="w-full h-full min-h-[36px] flex items-center justify-center text-[10px] font-bold">
                                {status === 'IN_PROGRESS' ? '진행' : status === 'COMPLETED' ? '완료' : '이슈'}
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
