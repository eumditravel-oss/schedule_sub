// src/components/workforce/AllocationHistoryView.tsx
import React, { useCallback, useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Worker, Project } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { History, Filter, RefreshCw, Info, ArrowRight, ShieldCheck } from 'lucide-react';

interface AllocationHistoryViewProps {
  workers: Worker[];
  projects: Project[];
}

export const AllocationHistoryView: React.FC<AllocationHistoryViewProps> = ({ workers, projects }) => {
  const { lang } = useI18n();

  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [changeTypeFilter, setChangeTypeFilter] = useState('');

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAllocationHistory({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        worker_id: selectedWorkerId || undefined,
        project_id: selectedProjectId || undefined,
        change_type: changeTypeFilter || undefined,
        limit: 200,
      });
      setHistoryLogs(data || []);
    } catch (err) {
      console.error('Failed to fetch allocation history:', err);
    } finally {
      setLoading(false);
    }
  }, [changeTypeFilter, dateFrom, dateTo, selectedProjectId, selectedWorkerId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const getChangeBadge = (type: string) => {
    switch (type) {
      case 'INITIAL_SNAPSHOT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">초기 상태 (08/08)</span>;
      case 'CREATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">신규 배정</span>;
      case 'UPDATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">투입률 변경</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">배정 삭제</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">{type}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Notice Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2.5 leading-relaxed">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold block text-blue-950">설정 변경 이력 (Audit Ledger) 안내</strong>
          <span>
            {lang === 'vi'
              ? 'Lịch sử thay đổi tỷ lệ phân bổ được ghi lại từ ngày 08-08-2026. Quá trình thay đổi trước đó không thể xác nhận.'
              : '투입률 변경 이력은 2026-08-08부터 기록되었습니다. 그 이전의 변경 과정은 확인할 수 없으며, 불변(Immutable) 원장으로 관리됩니다.'}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-slate-500" />
            <span>이력 필터 검색</span>
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            className="text-xs text-slate-600 hover:text-blue-600 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">종료일</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">작업자</label>
            <select
              value={selectedWorkerId}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">전체 작업자</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.country_code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">프로젝트</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">전체 프로젝트</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_ko || p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">변경 유형</label>
            <select
              value={changeTypeFilter}
              onChange={(e) => setChangeTypeFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">전체 유형</option>
              <option value="INITIAL_SNAPSHOT">초기 상태 (Snapshot)</option>
              <option value="CREATE">신규 생성 (CREATE)</option>
              <option value="UPDATE">투입률 수정 (UPDATE)</option>
              <option value="DELETE">배정 삭제 (DELETE)</option>
            </select>
          </div>
        </div>
      </div>

      {/* History Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold">
          <div className="flex items-center gap-1.5">
            <History className="w-4 h-4 text-blue-600" />
            <span>변경 이력 목록 ({historyLogs.length}건)</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-normal">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Immutable Audit Log Enabled</span>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">변경 이력을 불러오는 중입니다...</div>
        ) : historyLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">조건에 일치하는 변경 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-[11px] text-slate-600 font-bold whitespace-nowrap">
                  <th className="py-2.5 px-3">변경 일시</th>
                  <th className="py-2.5 px-3">유형</th>
                  <th className="py-2.5 px-3">작업자</th>
                  <th className="py-2.5 px-3">프로젝트</th>
                  <th className="py-2.5 px-3">투입률 변경</th>
                  <th className="py-2.5 px-3">변경자</th>
                  <th className="py-2.5 px-3">출처</th>
                  <th className="py-2.5 px-3">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {historyLogs.map((log) => {
                  const oldPct = log.old_allocation_percent !== null ? `${log.old_allocation_percent}%` : '없음';
                  const newPct = log.new_allocation_percent !== null ? `${log.new_allocation_percent}%` : '삭제';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition text-[11px] whitespace-nowrap">
                      <td className="py-2.5 px-3 text-slate-500 font-mono">{log.changed_at}</td>
                      <td className="py-2.5 px-3">{getChangeBadge(log.change_type)}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{log.worker_name || log.worker_id}</td>
                      <td className="py-2.5 px-3 font-semibold text-blue-900 max-w-[200px] truncate" title={log.project_name}>
                        {log.project_name || log.project_id}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">{oldPct}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="text-blue-700">{newPct}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{log.changed_by_name || 'System'}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200">
                          {log.source || 'MANUAL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate" title={log.new_note || log.old_note || ''}>
                        {log.new_note || log.old_note || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
