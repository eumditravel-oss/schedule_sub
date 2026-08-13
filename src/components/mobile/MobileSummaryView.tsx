// src/components/mobile/MobileSummaryView.tsx
import React from 'react';
import { Project, Task, Worker } from '../../types';
import { MobileProjectCard } from './MobileProjectCard';
import { useI18n } from '../../hooks/useI18n';
import { getActualProgress } from '../../utils/progressDisplay';
import { officialTaskEnd, officialTaskStart } from '../../utils/officialForecastDates';
import { Users, Calendar, Folder } from 'lucide-react';

interface MobileSummaryViewProps {
  mode: 'OVERVIEW' | 'DETAIL';
  projects?: Project[];
  project?: Project | null;
  tasks?: Task[];
  workers?: Worker[];
  isCompletedTab?: boolean;
  onProjectClick?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onCompleteProject?: (project: Project) => void;
  onDeleteProject?: (project: Project) => void;
  onTaskClick?: (task: Task) => void;
  isReadOnly?: boolean;
}

export const MobileSummaryView: React.FC<MobileSummaryViewProps> = ({
  mode,
  projects = [],
  project,
  tasks = [],
  workers = [],
  isCompletedTab = false,
  onProjectClick,
  onEditProject,
  onCompleteProject,
  onDeleteProject,
  onTaskClick,
  isReadOnly = false,
}) => {
  const { t, lang } = useI18n();

  const getProjectDisplayName = (prj: Project): string => {
    if (lang === 'vi') return prj.name_vi || prj.name_ko || prj.name;
    return prj.name_ko || prj.name_vi || prj.name;
  };

  const getTaskDisplayName = (tItem: Task): string => {
    if (lang === 'vi') return tItem.task_name_vi || tItem.task_name_ko || tItem.task_name;
    return tItem.task_name_ko || tItem.task_name_vi || tItem.task_name;
  };

  if (mode === 'OVERVIEW') {
    return (
      <div
        data-testid="mobile-summary-view"
        data-view-mode="SUMMARY"
        role="tabpanel"
        aria-label={t('summaryView')}
        className="space-y-3.5 w-full text-slate-900 overflow-x-hidden"
      >
        {projects.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 font-medium text-xs shadow-xs">
            {t('noData')}
          </div>
        ) : (
          projects.map((prj) => (
            <MobileProjectCard
              key={prj.id}
              project={prj}
              onClick={() => onProjectClick?.(prj)}
              onEdit={!isReadOnly ? onEditProject : undefined}
              onComplete={!isReadOnly ? onCompleteProject : undefined}
              onDelete={!isReadOnly ? onDeleteProject : undefined}
              isCompletedTab={isCompletedTab}
            />
          ))
        )}
      </div>
    );
  }

  // DETAIL Mode: Group tasks by Task Group or Process Category
  const tasksByGroup = tasks.reduce((acc, tItem) => {
    const groupName = (tItem as any).task_group_name || tItem.worker_name || (lang === 'vi' ? 'Công đoạn' : '공정');
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(tItem);
    return acc;
  }, {} as Record<string, Task[]>);

  const prjActual = project ? getActualProgress(project) : 0;
  const completedTasks = tasks.filter((tItem) => getActualProgress(tItem) >= 100 || Number(tItem.completion_confirmed) === 1).length;
  const inProgressTasks = tasks.filter((tItem) => getActualProgress(tItem) > 0 && getActualProgress(tItem) < 100 && Number(tItem.completion_confirmed) !== 1).length;
  const pendingTasks = tasks.filter((tItem) => getActualProgress(tItem) <= 0 && Number(tItem.completion_confirmed) !== 1).length;

  return (
    <div
      data-testid="mobile-summary-view"
      data-view-mode="SUMMARY"
      role="tabpanel"
      aria-label={t('summaryView')}
      className="space-y-4 w-full text-slate-900 overflow-x-hidden"
    >
      {/* Project Overview Stats Card */}
      {project && (
        <div
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3"
          data-progress-source="actual_progress"
          data-actual-progress={prjActual}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {lang === 'vi' ? 'Tổng quan dự án' : '프로젝트 요약'}
              </span>
              <h2 className="font-extrabold text-sm text-slate-900 mt-1">
                {getProjectDisplayName(project)}
              </h2>
            </div>
            <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${
              project.status === 'COMPLETED' || prjActual >= 100
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {prjActual}%
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              style={{ width: `${prjActual}%` }}
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-300"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-center">
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Đã xong' : '완료'}</div>
              <div className="text-sm font-extrabold text-emerald-600">{completedTasks}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Đang làm' : '진행 중'}</div>
              <div className="text-sm font-extrabold text-blue-600">{inProgressTasks}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500">{lang === 'vi' ? 'Chưa làm' : '대기'}</div>
              <div className="text-sm font-extrabold text-slate-600">{pendingTasks}</div>
            </div>
          </div>
        </div>
      )}

      {/* Task Summary Cards Grouped by Task Group / Process */}
      {Object.entries(tasksByGroup).map(([groupName, gTasks]) => (
        <div key={groupName} className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-700">
            <div className="flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-blue-600" />
              <span>{groupName}</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {t('tasksCount', { count: String(gTasks.length) })}
            </span>
          </div>

          <div className="space-y-2">
            {gTasks.map((tItem) => {
              const taskActual = getActualProgress(tItem);
              return (
                <div
                  key={tItem.id}
                  data-testid={`mobile-summary-task-card-${tItem.id}`}
                  data-progress-source="actual_progress"
                  data-actual-progress={taskActual}
                  onClick={() => onTaskClick?.(tItem)}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2 hover:border-blue-300 transition active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {tItem.worker_name}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs truncate">
                        {getTaskDisplayName(tItem)}
                      </h4>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{officialTaskStart(tItem)} ~ {officialTaskEnd(tItem)}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                      {taskActual}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${taskActual}%` }}
                      className="h-full bg-blue-600 transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
