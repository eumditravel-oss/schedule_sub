// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, DailyStatusType, GanttDateColumn } from '../types';
import { api } from '../services/api';
import { generateDateColumns, groupColumnsByMonth } from '../utils/dateUtils';
import { TaskModal } from '../components/modals/TaskModal';
import { StatusPopover } from '../components/modals/StatusPopover';
import { ArrowLeft, Plus, Edit2, Trash2, Calendar } from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Timeline Range
  const [startDate, setStartDate] = useState(new Date('2026-07-01'));
  const [endDate, setEndDate] = useState(new Date('2026-09-30'));

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchDetail = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const res = await api.getProjectDetail(projectId);
      setProject(res.project);
      setTasks(res.tasks || []);

      if (res.project.start_date && res.project.end_date) {
        const pStart = new Date(res.project.start_date);
        const pEnd = new Date(res.project.end_date);
        const marginStart = new Date(pStart.getTime() - 7 * 86400000);
        const marginEnd = new Date(pEnd.getTime() + 14 * 86400000);
        setStartDate(marginStart);
        setEndDate(marginEnd);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || '프로젝트 상세 정보를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [projectId]);

  const dateColumns: GanttDateColumn[] = generateDateColumns(startDate, endDate);
  const monthGroups = groupColumnsByMonth(dateColumns);

  const handleSaveTask = async (data: Partial<Task>) => {
    if (!projectId) return;
    if (selectedTask) {
      await api.updateTask(selectedTask.id, data);
    } else {
      await api.createTask({ ...data, project_id: projectId });
    }
    await fetchDetail();
  };

  const handleDeleteTask = async (id: string, name: string) => {
    if (!window.confirm(`'${name}' 작업을 삭제하시겠습니까?`)) return;
    await api.deleteTask(id);
    await fetchDetail();
  };

  const handleCellClick = (e: React.MouseEvent, taskId: string, dateStr: string, currentStatus: DailyStatusType) => {
    e.stopPropagation();
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
    try {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === popover.taskId) {
            const nextStatuses = { ...t.daily_statuses, [popover.dateStr]: status };
            return { ...t, daily_statuses: nextStatuses };
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

  const handleGoToToday = () => {
    const today = new Date();
    const start = new Date(today.getTime() - 15 * 86400000);
    const end = new Date(today.getTime() + 45 * 86400000);
    setStartDate(start);
    setEndDate(end);
  };

  // Helper to compute task bar bounds
  const getTaskSpan = (tStartStr: string, tEndStr: string) => {
    const tStart = new Date(tStartStr).getTime();
    const tEnd = new Date(tEndStr).getTime();
    const firstColDate = dateColumns[0]?.date.getTime() || tStart;

    const startDiffDays = Math.max(0, Math.floor((tStart - firstColDate) / 86400000));
    const durationDays = Math.max(1, Math.floor((tEnd - tStart) / 86400000) + 1);

    return { startIndex: startDiffDays, durationDays };
  };

  // Cell status styling helper
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

        <div className="flex items-center gap-3">
          <button
            onClick={handleGoToToday}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg shadow-sm transition"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>오늘 이동</span>
          </button>

          <button
            onClick={() => {
              setSelectedTask(null);
              setIsTaskModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>작업 추가</span>
          </button>
        </div>
      </header>

      {/* 2. Main Gantt Table Area */}
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        {/* Status Color Legend */}
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
            {/* 2-Tier Header */}
            <thead className="sticky top-0 z-20 bg-slate-800 text-xs uppercase tracking-wider text-slate-300">
              {/* Row 1: Month */}
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

              {/* Row 2: Date & Day */}
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

            {/* Body */}
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
                  const { startIndex, durationDays } = getTaskSpan(task.start_date, task.end_date);

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
                            <div className="mt-1 text-[11px] text-slate-400">
                              {task.start_date} ~ {task.end_date}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-500/30">
                              {task.progress}%
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsTaskModalOpen(true);
                                }}
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
                        const isInTaskPeriod = cIdx >= startIndex && cIdx < startIndex + durationDays;
                        const status = task.daily_statuses?.[col.dateStr] || 'NONE';
                        const bgClass = getStatusBgClass(status);

                        return (
                          <td
                            key={cIdx}
                            onClick={(e) => isInTaskPeriod && handleCellClick(e, task.id, col.dateStr, status)}
                            className={`w-[36px] min-w-[36px] max-w-[36px] p-0 text-center relative border-r border-slate-800/40 align-middle transition ${
                              isInTaskPeriod ? 'cursor-pointer hover:brightness-125' : ''
                            } ${
                              isInTaskPeriod
                                ? bgClass
                                : col.isToday
                                ? 'bg-blue-950/20'
                                : col.isWeekend
                                ? 'bg-slate-900/40'
                                : ''
                            }`}
                          >
                            {/* Today vertical indicator */}
                            {col.isToday && (
                              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-blue-500 z-10 opacity-70 pointer-events-none" />
                            )}

                            {/* In-task period highlight bar background if status is NONE */}
                            {isInTaskPeriod && status === 'NONE' && (
                              <div className="w-full h-full min-h-[36px] bg-blue-950/30 border-y border-blue-500/20 flex items-center justify-center text-[10px] text-blue-400/60 font-mono">
                                •
                              </div>
                            )}

                            {/* Status label dot or icon */}
                            {isInTaskPeriod && status !== 'NONE' && (
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
    </div>
  );
};
