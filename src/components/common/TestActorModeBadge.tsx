import React from 'react';
import { FlaskConical } from 'lucide-react';

export const TestActorModeBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    data-testid="test-actor-mode-badge"
    title="선택한 작업자는 테스트 행위자이며 실제 계정 인증이 아닙니다."
    className={`${compact ? 'h-7 px-2 text-[9px]' : 'h-8 px-2.5 text-[10px]'} rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-extrabold tracking-wide flex items-center gap-1.5 whitespace-nowrap shadow-2xs`}
  >
    <FlaskConical className="w-3.5 h-3.5" />
    <span>TEST ACTOR MODE</span>
  </div>
);
