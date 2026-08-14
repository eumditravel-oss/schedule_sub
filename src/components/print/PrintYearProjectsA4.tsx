import React from 'react';
import { Project, Task, Worker } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintPageShell } from './PrintPageShell';
import {
  PrintColorMode,
  getPrintStatusBadgeStyle,
  getPrintGanttBarStyle,
  getProjectPicSummary,
} from '../../utils/printVisualTokens';
import { resolveReportProjectProgress } from '../../utils/reportProgress';
import { getAdaptiveColumnPercent, getRemainingColumnPercent } from '../../utils/printLayout';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { officialProjectEnd, officialProjectStart } from '../../utils/officialForecastDates';

export interface PrintYearProjectsA4Props {
  yearStr?: string;
  projects: Project[];
  tasks: Task[];
  workers?: Worker[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintYearProjectsA4: React.FC<PrintYearProjectsA4Props> = ({
  yearStr = new Date().getFullYear().toString(),
  projects,
  tasks,
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((worker) => [worker.id, worker.name]));
  const months = Array.from({ length: 12 }, (_, index) => parseISO(`${yearStr}-${String(index + 1).padStart(2, '0')}-01`));
  const yearStart = startOfMonth(months[0]);
  const yearEnd = endOfMonth(months[11]);
  const yearProjects = projects.filter((project) => Boolean(
    officialProjectStart(project) && officialProjectEnd(project) && parseISO(officialProjectStart(project)!) <= yearEnd && parseISO(officialProjectEnd(project)!) >= yearStart
  ));
  const completed = yearProjects.filter((project) => project.status === 'COMPLETED').length;
  const active = yearProjects.filter((project) => project.status !== 'COMPLETED').length;
  const projectNames = yearProjects.map((project) => isKo ? project.name_ko || project.name : project.name_vi || project.name);
  const nameWidth = getAdaptiveColumnPercent(projectNames, 21, 27);
  const periodWidth = 14;
  const statusWidth = 8;
  const progressWidth = 7;
  const monthWidth = getRemainingColumnPercent(nameWidth + periodWidth + statusWidth + progressWidth);
  const quarterSummaries = [0, 1, 2, 3].map((quarterIndex) => {
    const quarterStart = startOfMonth(months[quarterIndex * 3]);
    const quarterEnd = endOfMonth(months[quarterIndex * 3 + 2]);
    const overlapping = yearProjects.filter((project) => parseISO(officialProjectStart(project)!) <= quarterEnd && parseISO(officialProjectEnd(project)!) >= quarterStart);
    const ending = yearProjects.filter((project) => parseISO(officialProjectEnd(project)!) >= quarterStart && parseISO(officialProjectEnd(project)!) <= quarterEnd);
    return { quarter: quarterIndex + 1, overlapping: overlapping.length, ending: ending.length };
  });

  const header = (pageNumber: number, subtitle: string) => (
    <PrintHeader
      title={isKo ? `${yearStr} 경영 보고용 프로젝트 로드맵` : `Lộ trình dự án quản trị ${yearStr}`}
      subtitle={subtitle}
      referenceDate={referenceDate}
      authorName={viewerName}
      pageNumber={pageNumber}
      totalPages={2}
      colorMode={colorMode}
      lang={lang}
    />
  );

  return (
    <div className="print-template-a4-year space-y-6 print:space-y-0">
      <PrintPageShell paper="a4" orientation="landscape" colorMode={colorMode}>
        <div className="flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
          <div>
            {header(1, isKo ? '포트폴리오 요약 · 12개월 추진 구간' : 'Tổng quan danh mục · Tiến trình 12 tháng')}
            <div className="grid grid-cols-4 gap-2 mb-3 text-center text-[10px]">
              {[
                [isKo ? '연간 대상 프로젝트' : 'Tổng dự án', yearProjects.length, 'text-slate-900'],
                [isKo ? '완료 프로젝트' : 'Hoàn thành', completed, 'text-emerald-700'],
                [isKo ? '진행 프로젝트' : 'Đang làm', active, 'text-blue-700'],
                [isKo ? '포트폴리오 달성률' : 'Tỷ lệ hoàn thành', yearProjects.length ? `${Math.round(completed / yearProjects.length * 100)}%` : '0%', 'text-purple-700'],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="bg-slate-50 border border-slate-200 rounded p-2">
                  <span className="text-[9px] text-slate-500 font-medium block">{label}</span>
                  <span className={`font-extrabold text-sm ${tone}`}>{value}</span>
                </div>
              ))}
            </div>

            <table data-testid="annual-roadmap-table" className="w-full table-fixed border-collapse border border-slate-300 text-[9.5px]">
              <colgroup>
                <col style={{ width: `${nameWidth}%` }} /><col style={{ width: `${periodWidth}%` }} />
                <col style={{ width: `${statusWidth}%` }} /><col style={{ width: `${progressWidth}%` }} />
                {months.map((_, index) => <col key={index} style={{ width: `${monthWidth / 12}%` }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold">
                  <th className="border border-slate-300 px-2 py-1 text-left">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '전체 기간' : 'Thời gian'}</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '상태' : 'Trạng thái'}</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '실제 공정' : 'Tiến độ'}</th>
                  {months.map((_, index) => <th key={index} className="border border-slate-300 p-0.5 font-mono text-[8px]">{index + 1}월</th>)}
                </tr>
              </thead>
              <tbody>
                {yearProjects.map((project) => {
                  const projectTasks = tasks.filter((task) => task.project_id === project.id);
                  const progress = resolveReportProjectProgress(project, projectTasks);
                  const badge = getPrintStatusBadgeStyle(progress.scheduleState === 'COMPLETED' ? 'COMPLETED' : project.status, colorMode, lang);
                  const bar = getPrintGanttBarStyle(project.status, colorMode);
                  const projectStart = officialProjectStart(project)!;
                  const projectEnd = officialProjectEnd(project)!;
                  const start = parseISO(projectStart);
                  const end = parseISO(projectEnd);
                  return (
                    <tr key={project.id}>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold break-words">{isKo ? project.name_ko || project.name : project.name_vi || project.name}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[8.5px] whitespace-nowrap">{projectStart.substring(2)} ~ {projectEnd.substring(2)}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center"><span className="px-1 py-0.5 rounded border font-bold" style={{ backgroundColor: badge.backgroundColor, borderColor: badge.borderColor, color: badge.textColor }}>{badge.label}</span></td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">{progress.actualProgress}%</td>
                      {months.map((month, index) => {
                        const overlap = start <= endOfMonth(month) && end >= startOfMonth(month);
                        return <td key={index} className="border border-slate-300 p-0.5"><div className="w-full h-3 border rounded-xs" style={{ backgroundColor: overlap ? bar.backgroundColor : '#F8FAFC', borderColor: overlap ? bar.borderColor : '#E2E8F0', backgroundImage: overlap ? bar.pattern || 'none' : 'none' }} /></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
        </div>
      </PrintPageShell>

      <PrintPageShell paper="a4" orientation="landscape" colorMode={colorMode}>
        <div className="flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
          <div>
            {header(2, isKo ? '분기별 실행 검토 · 프로젝트 책임 및 진척 상세' : 'Rà soát theo quý · Trách nhiệm và tiến độ')}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {quarterSummaries.map((summary) => (
                <div key={summary.quarter} className="border border-slate-200 rounded bg-slate-50 p-2">
                  <div className="font-extrabold text-slate-900">Q{summary.quarter}</div>
                  <div className="text-[10px] text-slate-600 mt-1">{isKo ? '추진' : 'Triển khai'} <b>{summary.overlapping}</b> · {isKo ? '종료 예정' : 'Kết thúc'} <b>{summary.ending}</b></div>
                </div>
              ))}
            </div>

            <h3 className="font-bold text-slate-800 mb-1.5">{isKo ? '프로젝트별 연간 실행 상세' : 'Chi tiết thực hiện theo dự án'}</h3>
            <table className="w-full table-fixed border-collapse border border-slate-300 text-[9.5px]">
              <colgroup>
                <col style={{ width: `${nameWidth}%` }} /><col style={{ width: '15%' }} /><col style={{ width: '20%' }} />
                <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: `${getRemainingColumnPercent(nameWidth + 57)}%` }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="border border-slate-700 px-2 py-1 text-left">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                  <th className="border border-slate-700 px-1 py-1">{isKo ? '기간' : 'Thời gian'}</th>
                  <th className="border border-slate-700 px-2 py-1 text-left">PIC</th>
                  <th className="border border-slate-700 px-1 py-1">{isKo ? '상태' : 'Trạng thái'}</th>
                  <th className="border border-slate-700 px-1 py-1">{isKo ? '예정 / 실제' : 'KH / Thực'}</th>
                  <th className="border border-slate-700 px-2 py-1 text-left">{isKo ? '경영 검토 포인트' : 'Điểm rà soát'}</th>
                </tr>
              </thead>
              <tbody>
                {yearProjects.map((project) => {
                  const projectTasks = tasks.filter((task) => task.project_id === project.id);
                  const progress = resolveReportProjectProgress(project, projectTasks);
                  const badge = getPrintStatusBadgeStyle(progress.scheduleState === 'COMPLETED' ? 'COMPLETED' : project.status, colorMode, lang);
                  const overdue = projectTasks.filter((task) => task.schedule_state === 'DELAYED' || task.is_blocked).length;
                  return (
                    <tr key={project.id}>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold break-words">{isKo ? project.name_ko || project.name : project.name_vi || project.name}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[8.5px] whitespace-nowrap">{officialProjectStart(project)?.substring(2)} ~ {officialProjectEnd(project)?.substring(2)}</td>
                      <td className="border border-slate-300 px-2 py-1 break-words">{getProjectPicSummary(projectTasks, workerMap, lang)}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center"><span className="px-1 py-0.5 rounded border font-bold" style={{ backgroundColor: badge.backgroundColor, borderColor: badge.borderColor, color: badge.textColor }}>{badge.label}</span></td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono whitespace-nowrap"><span className="text-blue-700">{progress.plannedProgress}%</span> / <span className="text-emerald-700 font-bold">{progress.actualProgress}%</span></td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{overdue > 0 ? (isKo ? `주의 작업 ${overdue}건 점검` : `${overdue} công việc cần rà soát`) : (isKo ? '특이사항 없음' : 'Không có vấn đề')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
        </div>
      </PrintPageShell>
    </div>
  );
};
