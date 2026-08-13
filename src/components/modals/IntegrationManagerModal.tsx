// src/components/modals/IntegrationManagerModal.tsx
import React, { useCallback, useState, useEffect } from 'react';
import { X, Key, Plus, Shield, Copy, Check, Trash2, Activity, AlertCircle, FileText } from 'lucide-react';
import { IntegrationApiKey, IntegrationApiLog, Worker } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { api } from '../../services/api';

interface IntegrationManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorker: Worker | null;
}

export const IntegrationManagerModal: React.FC<IntegrationManagerModalProps> = ({
  isOpen,
  onClose,
  currentWorker,
}) => {
  const { lang } = useI18n();
  const isVi = lang === 'vi';

  const [activeTab, setActiveTab] = useState<'KEYS' | 'LOGS' | 'DOCS'>('KEYS');
  const [keys, setKeys] = useState<IntegrationApiKey[]>([]);
  const [logs, setLogs] = useState<IntegrationApiLog[]>([]);
  const [loading, setLoading] = useState(false);

  // New Key Form State
  const [isCreating, setIsCreating] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(90);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setKeys(await api.getIntegrationKeys());
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
    }
  }, [currentWorker]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogs(await api.getIntegrationLogs());
    } catch (err) {
      console.error('Failed to fetch API logs:', err);
    }
  }, [currentWorker]);

  useEffect(() => {
    if (isOpen && currentWorker?.can_manage_integrations === 1) {
      void fetchKeys();
      void fetchLogs();
    }
  }, [currentWorker?.can_manage_integrations, fetchKeys, fetchLogs, isOpen]);

  const [keyError, setKeyError] = useState<string | null>(null);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setKeyError(null);
    try {
      setLoading(true);
      const json: any = await api.createIntegrationKey({
        name: keyName.trim(),
        scopes: ['projects:read', 'projects:write', 'groups:read', 'groups:write', 'tasks:read', 'tasks:write'],
        expires_in_days: expiresInDays,
      });

      if (json) {
        const token = json.data?.raw_token_once || json.raw_token_once || null;
        setGeneratedToken(token);
        setIsCreating(false);
        setKeyName('');
        setKeyError(null);
        await fetchKeys();
      } else {
        const errData: any = {};
        const msg = errData.error?.message || 'API Key를 생성하지 못했습니다.';
        console.error('[IntegrationManagerModal] create key failed:', errData);
        setKeyError(msg);
      }
    } catch (err: any) {
      console.error('[IntegrationManagerModal] create key exception:', err);
      setKeyError(err.message || 'API Key를 생성하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm(isVi ? 'Bạn có chắc chắn muốn thu hồi khóa API này?' : '이 API Key를 정말로 수동 취소하시겠습니까?')) return;
    try {
      setLoading(true);
      await api.revokeIntegrationKey(keyId);
      await fetchKeys();
    } catch (err: any) {
      alert(err.message || 'Error revoking key');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const hasPermission = Number(currentWorker?.can_manage_integrations) === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-hidden">
      <div
        data-testid="integration-manager-modal"
        className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150 my-auto overflow-hidden"
      >
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">
                {isVi ? 'Quản lý kết nối API bên ngoài' : '외부 개발도구 연동 API 관리'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">Generic Integration REST API v1</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="integration-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-slate-200 px-6 bg-slate-50/50 gap-2">
          <button
            type="button"
            data-testid="integration-tab-keys"
            onClick={() => setActiveTab('KEYS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'KEYS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>API Keys ({keys.length})</span>
          </button>
          <button
            type="button"
            data-testid="integration-tab-logs"
            onClick={() => setActiveTab('LOGS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'LOGS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Audit Logs ({logs.length})</span>
          </button>
          <button
            type="button"
            data-testid="integration-tab-docs"
            onClick={() => setActiveTab('DOCS')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'DOCS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>OpenAPI & CLI</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!hasPermission && activeTab !== 'DOCS' && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
              <Shield className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isVi
                  ? 'Tài khoản chưa được cấp quyền quản lý API Key. Bạn có thể xem tài liệu OpenAPI & CLI.'
                  : 'API Key 발급 및 관리 권한이 없습니다. (조회/발급은 팀 관리자 권한이 필요하지만 OpenAPI/CLI 문서는 조회 가능합니다.)'}
              </span>
            </div>
          )}
              {/* Generated Secret Alert */}
              {generatedToken && (
                <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-950 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-800">
                      <Check className="w-4 h-4 text-emerald-600" />
                      {isVi
                        ? 'Khóa API đã được tạo thành công! Vui lòng sao chép ngay.'
                        : 'API Key가 생성되었습니다! 보안을 위해 단 1회만 제공됩니다.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGeneratedToken(null)}
                      className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
                    >
                      {isVi ? 'Đã lưu' : '확인 완료'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-emerald-200 font-mono text-xs text-slate-900 break-all select-all">
                    <span data-testid="generated-raw-token" className="flex-1">{generatedToken}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedToken)}
                      className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 transition flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-emerald-800 font-medium space-y-0.5 pt-1 border-t border-emerald-200">
                    <div><strong>Base URL:</strong> <code className="bg-emerald-100/80 px-1 rounded">https://concost-dev-scheduler.eumditravel.workers.dev/api/integrations/v1</code></div>
                    <div><strong>OpenAPI Spec:</strong> <code className="bg-emerald-100/80 px-1 rounded">/api/integrations/v1/openapi.json</code></div>
                  </div>
                </div>
              )}

              {/* KEYS TAB */}
              {activeTab === 'KEYS' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">
                      {isVi
                        ? 'Quản lý khóa API cấp quyền cho Codex, CLI, GitHub Actions.'
                        : '외부 개발도구(Codex, CLI, GitHub Actions) 연동용 API Key 목록입니다.'}
                    </span>
                    {!isCreating && hasPermission && (
                      <button
                        type="button"
                        data-testid="create-api-key-btn"
                        onClick={() => setIsCreating(true)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{isVi ? '+ Tạo khóa API' : '+ API Key 발급'}</span>
                      </button>
                    )}
                  </div>

                  {/* Create Form */}
                  {isCreating && (
                    <form onSubmit={handleCreateKey} className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                      <h4 className="font-bold text-xs text-blue-900">
                        {isVi ? 'Tạo khóa API mới' : '신규 API Key 발급'}
                      </h4>

                      {keyError && (
                        <div
                          data-testid="integration-key-error"
                          className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-bold flex items-center gap-2"
                        >
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{keyError}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            {isVi ? 'Tên khóa / Ứng dụng' : 'Key 명칭 / 애플리케이션'}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Codex CLI Sync"
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            {isVi ? 'Thời hạn hiệu lực' : '유효 기간'}
                          </label>
                          <select
                            value={expiresInDays}
                            onChange={(e) => setExpiresInDays(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                          >
                            <option value={30}>30 {isVi ? 'ngày' : '일'}</option>
                            <option value={90}>90 {isVi ? 'ngày' : '일'}</option>
                            <option value={365}>365 {isVi ? 'ngày' : '일'}</option>
                            <option value={0}>{isVi ? 'Không hết hạn' : '무제한 (만료 없음)'}</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsCreating(false)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                        >
                          {isVi ? 'Hủy' : '취소'}
                        </button>
                        <button
                          type="submit"
                          data-testid="submit-create-key-btn"
                          disabled={loading}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                        >
                          {isVi ? 'Tạo' : '발급'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Keys Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                        <tr>
                          <th className="px-4 py-2.5">{isVi ? 'Tên khóa' : 'Key 명칭'}</th>
                          <th className="px-4 py-2.5">Prefix</th>
                          <th className="px-4 py-2.5">{isVi ? 'Người tạo' : '발급자'}</th>
                          <th className="px-4 py-2.5">{isVi ? 'Trạng thái' : '상태'}</th>
                          <th className="px-4 py-2.5 text-right">{isVi ? 'Thao tác' : '관리'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {keys.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                              {isVi ? 'Chưa có khóa API nào.' : '등록된 Integration API Key가 없습니다.'}
                            </td>
                          </tr>
                        ) : (
                          keys.map((k) => (
                            <tr key={k.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-bold text-slate-900">{k.name}</td>
                              <td className="px-4 py-3 font-mono text-slate-500">{k.key_prefix}xxxx</td>
                              <td className="px-4 py-3 text-slate-600">{k.created_by_name}</td>
                              <td className="px-4 py-3">
                                {k.is_active === 1 ? (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Active
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Revoked
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {k.is_active === 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeKey(k.id)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                    title={isVi ? 'Thu hồi' : '취소 / Revoke'}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* LOGS TAB */}
              {activeTab === 'LOGS' && (
                <div className="space-y-3 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5">Time</th>
                        <th className="px-4 py-2.5">Method & Route</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                            No API request logs recorded yet.
                          </td>
                        </tr>
                      ) : (
                        logs.map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2 text-slate-500">{l.created_at?.slice(11, 19)}</td>
                            <td className="px-4 py-2 text-slate-800 font-bold">
                              {l.method} {l.route}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  l.http_status < 300
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {l.http_status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-400">{l.client_ip}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* DOCS TAB */}
              {activeTab === 'DOCS' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 text-sm">CLI Bulk Sync Tool Usage</h4>
                    <p className="text-slate-600">
                      {isVi
                        ? 'Chạy lệnh đồng bộ danh sách dự án và công việc bằng file JSON:'
                        : 'JSON 파일 기반 전용 CLI 스크립트 실행 방법:'}
                    </p>
                    <pre className="p-3 rounded bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto">
                      node scripts/scheduler-sync.mjs schedule.json --key sched_live_xxxxxxxxx
                    </pre>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 text-sm">OpenAPI 3.0 Spec Endpoint</h4>
                    <p className="text-slate-600">
                      GET <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/api/integrations/v1/openapi.json</code>
                    </p>
                  </div>
                </div>
              )}
            </div>

        {/* Footer */}
        <footer className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition"
          >
            {isVi ? 'Đóng' : '닫기'}
          </button>
        </footer>
      </div>
    </div>
  );
};
