// src/components/modals/DateHeaderInfoPanel.tsx
import React, { useState } from 'react';
import { Worker, CountryHoliday, isExecutiveViewer } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Calendar, Plus, Trash2, ShieldAlert, CheckCircle, Info } from 'lucide-react';
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
  const [nameKo, setNameKo] = useState('');
  const [nameVi, setNameVi] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  if (!isOpen) return null;

  const isViewer = isExecutiveViewer(currentWorker);
  const userCountry = currentWorker?.country_code || 'KR';
  const canRegister = !isViewer && !!currentWorker;

  const krHoliday = holidays.find((h) => h.country_code === 'KR' && h.holiday_date === dateStr);
  const vnHoliday = holidays.find((h) => h.country_code === 'VN' && h.holiday_date === dateStr);

  const d = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat

  const krDefaultWork = dayOfWeek !== 0 && dayOfWeek !== 6;
  const vnDefaultWork = dayOfWeek !== 0;

  const handleAddManualHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRegister) return;
    if (!nameKo.trim() && !nameVi.trim()) {
      alert(lang === 'vi' ? 'Vui lòng nhập tên ngày lễ.' : '공휴일 이름을 입력하세요.');
      return;
    }

    const confirmMsg = lang === 'vi'
      ? 'Nếu đăng ký ngày này làm ngày lễ quốc gia, nó sẽ được áp dụng cho tất cả nhân viên thuộc cùng quốc gia.'
      : '이 날짜를 국가 공휴일로 등록하면 같은 국가의 모든 작업자에게 적용됩니다.';

    if (!confirm(confirmMsg)) return;

    try {
      setLoading(true);
      await api.addManualHoliday({
        country_code: userCountry,
        holiday_date: dateStr,
        name_ko: nameKo.trim() || nameVi.trim(),
        name_vi: nameVi.trim() || nameKo.trim(),
      });
      await onRefreshHolidays();
      setIsRegistering(false);
      setNameKo('');
      setNameVi('');
    } catch (err: any) {
      alert(err.message || 'Failed to add manual holiday');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteManualHoliday = async (holiday: CountryHoliday) => {
    if (!canRegister) return;
    if (holiday.source !== 'MANUAL' && holiday.is_manual !== 1) {
      alert(lang === 'vi' ? 'Không thể xóa các ngày lễ được thu thập tự động.' : '자동 수집된 공휴일은 삭제할 수 없습니다.');
      return;
    }
    if (holiday.country_code !== userCountry) {
      alert(lang === 'vi' ? 'Bạn chỉ có thể xóa ngày lễ của quốc gia mình.' : '본인 국가의 공휴일만 삭제할 수 있습니다.');
      return;
    }

    if (!confirm(lang === 'vi' ? 'Bạn có chắc chắn muốn xóa ngày lễ thủ công này?' : '이 수동 공휴일을 삭제하시겠습니까?')) return;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div
        data-testid="date-holiday-info-panel"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-900 overflow-hidden text-xs animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              {dateStr} ({dayName})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Default Work Rules Table */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="font-bold text-slate-800 text-xs flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span>{lang === 'vi' ? 'Quy tắc làm việc cơ bản' : '국가별 기본 근무 규칙'}</span>
              <span className="text-[10px] text-slate-500 font-normal">Standard</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <span className="px-1 rounded bg-rose-100 text-rose-800 text-[10px] font-extrabold">KR</span>
                  <span>한국 (KR)</span>
                </div>
                <div className="mt-1 font-semibold text-slate-700">
                  {krDefaultWork ? (
                    <span className="text-blue-600">{lang === 'vi' ? 'Ngày làm việc' : '정상 근무일'}</span>
                  ) : (
                    <span className="text-slate-500">{lang === 'vi' ? 'Nghỉ hàng tuần' : '주말 정기 휴무'}</span>
                  )}
                </div>
              </div>

              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <span className="px-1 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold">VN</span>
                  <span>베트남 (VN)</span>
                </div>
                <div className="mt-1 font-semibold text-slate-700">
                  {vnDefaultWork ? (
                    <span className="text-emerald-600">{lang === 'vi' ? 'Ngày làm việc (Mon-Sat)' : '정상 근무일 (월~토)'}</span>
                  ) : (
                    <span className="text-slate-500">{lang === 'vi' ? 'Nghỉ Chủ Nhật' : '일요일 정기 휴무'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Registered Holidays Status */}
          <div className="space-y-2">
            <div className="font-bold text-slate-800 text-xs">{lang === 'vi' ? 'Thông tin ngày lễ quốc gia:' : '국가 공휴일 정보:'}</div>

            {/* KR Holiday */}
            <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-rose-900">
                  <span className="px-1 rounded bg-rose-200 text-rose-800 text-[10px] font-extrabold">KR</span>
                  <span>{krHoliday ? (lang === 'vi' ? (krHoliday.name_vi || krHoliday.name_local) : (krHoliday.name_ko || krHoliday.name_local)) : (lang === 'vi' ? 'Không có ngày lễ' : '공휴일 없음')}</span>
                </div>
                {krHoliday && (
                  <div className="text-[10px] text-rose-700 mt-0.5">
                    {lang === 'vi' ? 'Nguồn:' : '출처:'} {krHoliday.source} {krHoliday.is_manual ? '(수동 등록)' : ''}
                  </div>
                )}
              </div>
              {krHoliday && (krHoliday.source === 'MANUAL' || krHoliday.is_manual === 1) && (
                userCountry === 'KR' && canRegister ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDeleteManualHoliday(krHoliday)}
                    className="p-1 rounded text-red-600 hover:bg-rose-100 transition"
                    title={lang === 'vi' ? 'Xóa ngày lễ thủ công' : '수동 공휴일 삭제'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold">{lang === 'vi' ? 'Chỉ xem' : '삭제 불가'}</span>
                )
              )}
            </div>

            {/* VN Holiday */}
            <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <span className="px-1 rounded bg-amber-200 text-amber-900 text-[10px] font-extrabold">VN</span>
                  <span>{vnHoliday ? (lang === 'vi' ? (vnHoliday.name_vi || vnHoliday.name_local) : (vnHoliday.name_ko || vnHoliday.name_local)) : (lang === 'vi' ? 'Không có ngày lễ' : '공휴일 없음')}</span>
                </div>
                {vnHoliday && (
                  <div className="text-[10px] text-amber-800 mt-0.5">
                    {lang === 'vi' ? 'Nguồn:' : '출처:'} {vnHoliday.source} {vnHoliday.is_manual ? '(수동 등록)' : ''}
                  </div>
                )}
              </div>
              {vnHoliday && (vnHoliday.source === 'MANUAL' || vnHoliday.is_manual === 1) && (
                userCountry === 'VN' && canRegister ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDeleteManualHoliday(vnHoliday)}
                    className="p-1 rounded text-red-600 hover:bg-amber-100 transition"
                    title={lang === 'vi' ? 'Xóa ngày lễ thủ công' : '수동 공휴일 삭제'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold">{lang === 'vi' ? 'Chỉ xem' : '삭제 불가'}</span>
                )
              )}
            </div>
          </div>

          {/* Manual Holiday Registration Section */}
          {!isViewer && canRegister && (
            <div className="pt-2 border-t border-slate-200">
              {!isRegistering ? (
                <button
                  type="button"
                  data-testid="add-manual-holiday-btn"
                  onClick={() => setIsRegistering(true)}
                  className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl border border-blue-200 transition flex items-center justify-center gap-1.5 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {lang === 'vi'
                      ? `Đăng ký ngày lễ thủ công (${userCountry})`
                      : `수동 공휴일 추가 등록 (${userCountry})`}
                  </span>
                </button>
              ) : (
                <form onSubmit={handleAddManualHoliday} className="space-y-3 bg-blue-50/50 p-3 rounded-xl border border-blue-200">
                  <div className="font-bold text-slate-900 text-xs flex items-center justify-between">
                    <span>{lang === 'vi' ? 'Đăng ký ngày lễ mới' : '신규 공휴일 수동 등록'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-extrabold">
                      {userCountry}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-blue-100 font-medium">
                    {lang === 'vi'
                      ? 'Nếu đăng ký ngày này làm ngày lễ quốc gia, nó sẽ được áp dụng cho tất cả nhân viên thuộc cùng quốc gia.'
                      : '이 날짜를 국가 공휴일로 등록하면 같은 국가의 모든 작업자에게 적용됩니다.'}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                        {lang === 'vi' ? 'Tên tiếng Hàn (name_ko)' : '공휴일명 (한국어) *'}
                      </label>
                      <input
                        type="text"
                        data-testid="manual-holiday-name-ko"
                        value={nameKo}
                        onChange={(e) => setNameKo(e.target.value)}
                        placeholder="예: 대체공휴일"
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-blue-500 font-medium text-xs"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                        {lang === 'vi' ? 'Tên tiếng Việt (name_vi)' : '공휴일명 (베트남어)'}
                      </label>
                      <input
                        type="text"
                        data-testid="manual-holiday-name-vi"
                        value={nameVi}
                        onChange={(e) => setNameVi(e.target.value)}
                        placeholder="VD: Ngày nghỉ bù"
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-blue-500 font-medium text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      data-testid="save-manual-holiday-btn"
                      disabled={loading}
                      className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition text-xs"
                    >
                      {lang === 'vi' ? 'Lưu' : '등록'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRegistering(false)}
                      className="h-8 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition text-xs"
                    >
                      {lang === 'vi' ? 'Hủy' : '취소'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
