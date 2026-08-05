// src/components/modals/DateHeaderInfoPanel.tsx
import React, { useState } from 'react';
import { Worker, CountryHoliday, isExecutiveViewer } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Calendar, Plus, Trash2, Lock, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

export interface DateHeaderInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
  dayName: string;
  holidays: CountryHoliday[];
  currentWorker: Worker | null;
  onRefreshHolidays: () => Promise<void>;
}

export const DateHeaderInfoPanel: React.FC<DateHeaderInfoPanelProps> = ({
  isOpen,
  onClose,
  dateStr,
  dayName,
  holidays,
  currentWorker,
  onRefreshHolidays,
}) => {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [targetCountry, setTargetCountry] = useState<'KR' | 'VN'>('KR');
  const [isRegistering, setIsRegistering] = useState(false);

  const defaultNameKo = lang === 'vi' ? 'Ngày nghỉ lễ bổ sung' : '임시 공휴일';
  const defaultNameVi = lang === 'vi' ? 'Ngày nghỉ lễ bổ sung' : 'Ngày nghỉ lễ bổ sung';

  const [nameKo, setNameKo] = useState(defaultNameKo);
  const [nameVi, setNameVi] = useState(defaultNameVi);

  if (!isOpen) return null;

  const isViewer = isExecutiveViewer(currentWorker);
  const userCountry = currentWorker?.country_code || 'KR';

  const krHoliday = holidays.find((h) => h.country_code === 'KR' && h.holiday_date === dateStr);
  const vnHoliday = holidays.find((h) => h.country_code === 'VN' && h.holiday_date === dateStr);

  const d = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat

  // State determinations for KR and VN
  const isKrSunday = dayOfWeek === 0;
  const isKrSaturday = dayOfWeek === 6;
  const isVnSunday = dayOfWeek === 0;
  const isVnSaturday = dayOfWeek === 6;

  let krStatusLabel = '';
  let krStatusStyle = '';
  if (krHoliday) {
    krStatusLabel = lang === 'vi' ? (krHoliday.name_vi || krHoliday.name_local) : (krHoliday.name_ko || krHoliday.name_local);
    krStatusStyle = 'bg-rose-50 border-rose-200 text-rose-900';
  } else if (isKrSunday || isKrSaturday) {
    krStatusLabel = isKrSunday ? (lang === 'vi' ? 'Nghỉ Chủ Nhật' : '일요 휴무') : (lang === 'vi' ? 'Nghỉ Thứ Bảy' : '토요 정기휴무');
    krStatusStyle = 'bg-slate-50 border-slate-200 text-slate-700';
  } else {
    krStatusLabel = lang === 'vi' ? 'Ngày làm việc' : '정상 근무';
    krStatusStyle = 'bg-emerald-50 border-emerald-200 text-emerald-800';
  }

  let vnStatusLabel = '';
  let vnStatusStyle = '';
  if (vnHoliday) {
    vnStatusLabel = lang === 'vi' ? (vnHoliday.name_vi || vnHoliday.name_local) : (vnHoliday.name_ko || vnHoliday.name_local);
    vnStatusStyle = 'bg-amber-50 border-amber-200 text-amber-900';
  } else if (isVnSunday) {
    vnStatusLabel = lang === 'vi' ? 'Nghỉ Chủ Nhật' : '일요 휴무';
    vnStatusStyle = 'bg-slate-50 border-slate-200 text-slate-700';
  } else if (isVnSaturday) {
    vnStatusLabel = lang === 'vi' ? 'Làm việc Thứ Bảy (Mon-Sat)' : '토요일 정상 근무 (월~토)';
    vnStatusStyle = 'bg-emerald-50 border-emerald-200 text-emerald-800';
  } else {
    vnStatusLabel = lang === 'vi' ? 'Ngày làm việc' : '정상 근무';
    vnStatusStyle = 'bg-emerald-50 border-emerald-200 text-emerald-800';
  }

  const handleOpenRegisterForm = (country: 'KR' | 'VN') => {
    if (isViewer) return;
    if (userCountry !== country) {
      alert(lang === 'vi' ? 'Bạn chỉ có thể quản lý ngày lễ của quốc gia mình.' : '본인 국가의 공휴일만 등록할 수 있습니다.');
      return;
    }
    setTargetCountry(country);
    setNameKo(lang === 'vi' ? 'Ngày nghỉ lễ bổ sung' : '임시 공휴일');
    setNameVi('Ngày nghỉ lễ bổ sung');
    setIsRegistering(true);
  };

  const handleAddManualHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewer) return;
    if (userCountry !== targetCountry) {
      alert(lang === 'vi' ? 'Bạn chỉ có thể đăng ký ngày lễ của quốc gia mình.' : '본인 국가의 공휴일만 등록할 수 있습니다.');
      return;
    }

    try {
      setLoading(true);
      await api.addManualHoliday({
        country_code: targetCountry,
        holiday_date: dateStr,
        name_ko: nameKo.trim() || nameVi.trim() || '임시 공휴일',
        name_vi: nameVi.trim() || nameKo.trim() || 'Ngày nghỉ lễ bổ sung',
      });
      await onRefreshHolidays();
      setIsRegistering(false);
    } catch (err: any) {
      alert(err.message || 'Failed to add manual holiday');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteManualHoliday = async (holiday: CountryHoliday) => {
    if (isViewer) return;
    if (holiday.source !== 'MANUAL' && holiday.is_manual !== 1) {
      alert(lang === 'vi' ? 'Không thể xóa các ngày lễ được đồng bộ tự động.' : '자동 동기화된 공휴일은 삭제할 수 없습니다.');
      return;
    }
    if (holiday.country_code !== userCountry) {
      alert(lang === 'vi' ? 'Bạn chỉ có thể xóa ngày lễ của quốc gia mình.' : '본인 국가의 공휴일만 삭제할 수 있습니다.');
      return;
    }

    if (!confirm(lang === 'vi' ? 'Bạn có chắc chắn muốn hủy đăng ký ngày lễ thủ công này?' : '이 수동 공휴일을 해제하시겠습니까?')) return;

    try {
      setLoading(true);
      await api.deleteManualHoliday(holiday.id);
      await onRefreshHolidays();
    } catch (err: any) {
      alert(err.message || 'Failed to delete manual holiday');
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  let timingLabel = '';
  let timingStyle = '';
  if (dateStr === todayStr) {
    timingLabel = lang === 'vi' ? 'Hôm nay' : '오늘';
    timingStyle = 'bg-blue-100 text-blue-800 border-blue-300';
  } else if (dateStr < todayStr) {
    timingLabel = lang === 'vi' ? 'Đã qua' : '과거';
    timingStyle = 'bg-slate-100 text-slate-700 border-slate-300';
  } else {
    timingLabel = lang === 'vi' ? 'Tương lai' : '미래';
    timingStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      <div
        data-testid="date-header-info-panel"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 text-slate-900 overflow-hidden text-xs animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-sm">{dateStr} ({dayName})</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${timingStyle}`}>
                  {timingLabel}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="date-info-close-btn"
            onClick={onClose}
            aria-label={t('close')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Executive Read-Only Notice */}
          {isViewer && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[11px] font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-red-600 shrink-0" />
              <span>{lang === 'vi' ? 'Tài khoản CEO/COO chỉ có quyền xem thông tin.' : 'CEO·COO 계정은 조회 전용 모드로 동작합니다.'}</span>
            </div>
          )}

          {/* Inline Registration Form */}
          {isRegistering ? (
            <form onSubmit={handleAddManualHoliday} className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                <span className="font-extrabold text-blue-900 text-xs flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>{lang === 'vi' ? `Đăng ký ngày lễ thủ công (${targetCountry})` : `수동 공휴일 등록 (${targetCountry})`}</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-extrabold">{targetCountry}</span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{lang === 'vi' ? 'Tên tiếng Hàn (name_ko)' : '공휴일명 (한국어)'} *</label>
                  <input
                    type="text"
                    data-testid="manual-holiday-name-ko"
                    value={nameKo}
                    onChange={(e) => setNameKo(e.target.value)}
                    required
                    className="w-full h-8 px-3 rounded-lg border border-slate-300 bg-white font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{lang === 'vi' ? 'Tên tiếng Việt (name_vi)' : '공휴일명 (베트남어)'}</label>
                  <input
                    type="text"
                    data-testid="manual-holiday-name-vi"
                    value={nameVi}
                    onChange={(e) => setNameVi(e.target.value)}
                    className="w-full h-8 px-3 rounded-lg border border-slate-300 bg-white font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  data-testid="save-manual-holiday-btn"
                  disabled={loading}
                  className="flex-1 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center justify-center gap-1"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{lang === 'vi' ? 'Đăng ký' : '등록'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="h-8 px-3 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  {lang === 'vi' ? 'Hủy' : '취소'}
                </button>
              </div>
            </form>
          ) : null}

          {/* KR Card */}
          <div
            data-testid="date-info-kr-card"
            className={`p-3.5 rounded-2xl border ${krStatusStyle} space-y-2 transition shadow-xs`}
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">KR</span>
                <span className="font-extrabold text-slate-900 text-xs">대한민국 (Korea)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold">기본 MON_FRI</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="font-extrabold text-slate-900 text-xs" data-testid="date-info-kr-status">
                  {krStatusLabel}
                </div>
                {krHoliday && (
                  <div className="text-[10px] text-slate-600 font-medium flex items-center gap-1">
                    <span>출처:</span>
                    <span data-testid="date-info-holiday-source" className="font-bold text-slate-800">{krHoliday.source}</span>
                  </div>
                )}
              </div>

              <div>
                {krHoliday ? (
                  krHoliday.source !== 'MANUAL' && krHoliday.is_manual !== 1 ? (
                    <span className="px-2 py-1 rounded-lg bg-rose-100 border border-rose-200 text-rose-800 font-extrabold text-[10px] flex items-center gap-1">
                      <Lock className="w-3 h-3 text-rose-600" />
                      <span>자동 동기화</span>
                    </span>
                  ) : userCountry === 'KR' && !isViewer ? (
                    <button
                      type="button"
                      data-testid="delete-manual-holiday-btn-kr"
                      disabled={loading}
                      onClick={() => handleDeleteManualHoliday(krHoliday)}
                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-xs"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>수동 공휴일 해제</span>
                    </button>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 font-bold text-[10px]">
                      수동 공휴일 (조회전용)
                    </span>
                  )
                ) : userCountry === 'KR' && !isViewer ? (
                  <button
                    type="button"
                    data-testid="add-manual-holiday-btn-kr"
                    onClick={() => handleOpenRegisterForm('KR')}
                    className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>수동 공휴일 등록</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold">읽기 전용</span>
                )}
              </div>
            </div>
          </div>

          {/* VN Card */}
          <div
            data-testid="date-info-vn-card"
            className={`p-3.5 rounded-2xl border ${vnStatusStyle} space-y-2 transition shadow-xs`}
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-black">VN</span>
                <span className="font-extrabold text-slate-900 text-xs">베트남 (Vietnam)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold">기본 MON_SAT</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="font-extrabold text-slate-900 text-xs" data-testid="date-info-vn-status">
                  {vnStatusLabel}
                </div>
                {vnHoliday && (
                  <div className="text-[10px] text-slate-600 font-medium flex items-center gap-1">
                    <span>Nguồn:</span>
                    <span data-testid="date-info-holiday-source" className="font-bold text-slate-800">{vnHoliday.source}</span>
                  </div>
                )}
              </div>

              <div>
                {vnHoliday ? (
                  vnHoliday.source !== 'MANUAL' && vnHoliday.is_manual !== 1 ? (
                    <span className="px-2 py-1 rounded-lg bg-amber-100 border border-amber-200 text-amber-900 font-extrabold text-[10px] flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-700" />
                      <span>Tự động đồng bộ</span>
                    </span>
                  ) : userCountry === 'VN' && !isViewer ? (
                    <button
                      type="button"
                      data-testid="delete-manual-holiday-btn-vn"
                      disabled={loading}
                      onClick={() => handleDeleteManualHoliday(vnHoliday)}
                      className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-xs"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hủy ngày lễ thủ công</span>
                    </button>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 font-bold text-[10px]">
                      Chỉ xem
                    </span>
                  )
                ) : userCountry === 'VN' && !isViewer ? (
                  <button
                    type="button"
                    data-testid="add-manual-holiday-btn-vn"
                    onClick={() => handleOpenRegisterForm('VN')}
                    className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Đăng ký ngày lễ thủ công</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold">Chỉ xem</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 h-8 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
