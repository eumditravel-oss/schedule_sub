import React, { useEffect, useState } from 'react';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { usePilotAuth } from '../auth/PilotAuthContext';

export function PilotLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, session, loading, openTestMode } = usePilotAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const destination = (location.state as any)?.from || '/worklog/today';
  useEffect(() => {
    if (!loading && session) navigate(destination, { replace: true });
  }, [destination, loading, navigate, session]);
  useEffect(() => { void api.getPilotLoginEmployees().then(setEmployees).catch(() => setEmployees([])); }, []);
  if (!loading && openTestMode) return <main className="min-h-screen grid place-items-center bg-slate-100 text-slate-700">Open Pilot 모드에서는 로그인 없이 직원 선택으로 시작합니다.</main>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      await login(employeeId, pin);
      setPin('');
      navigate(destination, { replace: true });
    } catch (next: any) {
      const messages: Record<string, string> = {
        LOGIN_FAILED: '직원 또는 PIN을 확인해 주세요.', LOGIN_DISABLED: '현재 사용할 수 없는 계정입니다.',
        LOGIN_TEMPORARILY_LOCKED: '반복된 실패로 15분간 잠겼습니다.',
      };
      setError(messages[next?.code] || '로그인에 실패했습니다.');
    } finally { setSubmitting(false); }
  };
  return <main className="min-h-screen bg-slate-100 px-4 py-10"><section className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
    <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><ShieldCheck className="h-6 w-6" /></div><div><h1 className="font-extrabold text-slate-900">개발팀 프로젝트 스케줄러</h1><p className="text-sm text-slate-500">Pilot Session 로그인</p></div></div>
    <form className="mt-7 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-bold text-slate-700">접속자<select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">직원을 선택하세요</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.country_code || employee.office_code || '-'}</option>)}</select></label>
      <label className="block text-sm font-bold text-slate-700">개인 PIN<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 tracking-[0.35em]" type="password" aria-label="개인 PIN" /></label>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
      <button disabled={submitting || !employeeId || pin.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-extrabold text-white disabled:opacity-50"><LogIn className="h-4 w-4" />{submitting ? '확인 중…' : '접속'}</button>
    </form><p className="mt-5 flex items-center gap-1 text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" />PIN과 세션 토큰은 서버에 원문으로 저장되지 않습니다.</p>
  </section></main>;
}
