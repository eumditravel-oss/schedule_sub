// src/components/mobile/MobileProjectCard.tsx
import React, { useState } from 'react';
import { Project } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { ChevronRight, MoreVertical, Edit2, CheckCircle, Trash2, Calendar } from 'lucide-react';

interface MobileProjectCardProps {
  project: Project;
  onClick: () => void;
  onEdit?: (project: Project) => void;
  onComplete?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  isCompletedTab?: boolean;
}

export const MobileProjectCard: React.FC<MobileProjectCardProps> = ({
  project,
  onClick,
  onEdit,
  onComplete,
  onDelete,
  isCompletedTab = false,
}) => {
  const { t, lang } = useI18n();
  const [showMenu, setShowMenu] = useState(false);

  const displayName = lang === 'vi' ? (project.name_vi || project.name) : (project.name_ko || project.name);
  const isFallback = lang === 'vi' ? !project.name_vi : !project.name_ko;

  return (
    <div
      data-testid={`project-card-${project.id}`}
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition active:scale-[0.99] cursor-pointer relative text-slate-900 overflow-hidden"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-bold text-slate-900 text-sm tracking-tight leading-snug line-clamp-2">
              {displayName}
            </h3>
            {isFallback && (
              <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded border border-slate-200 shrink-0 font-normal">
                {t('originalTag')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{project.start_date} ~ {project.end_date}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            isCompletedTab
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            {project.progress}%
          </span>

          {!isCompletedTab && (onEdit || onComplete || onDelete) && (
            <div className="relative">
              <button
                type="button"
                data-testid={`mobile-project-menu-btn-${project.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-9 z-30 w-36 bg-white border border-slate-200 rounded-xl shadow-xl p-1 text-xs"
                >
                  {onComplete && (
                    <button
                      type="button"
                      data-testid={`project-card-complete-${project.id}`}
                      onClick={() => {
                        setShowMenu(false);
                        onComplete(project);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 hover:bg-emerald-50 rounded-lg font-semibold"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{t('completeProject')}</span>
                    </button>
                  )}
                  {onEdit && (
                    <button
                      type="button"
                      data-testid={`mobile-project-edit-btn-${project.id}`}
                      onClick={() => {
                        setShowMenu(false);
                        onEdit(project);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{t('editProject')}</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      data-testid={`mobile-project-delete-btn-${project.id}`}
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(project);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('deleteProject')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar & Mini Timeline */}
      <div className="mt-3">
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
          <div
            style={{ width: `${project.progress}%` }}
            className={`h-full transition-all duration-300 ${
              isCompletedTab ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-cyan-500'
            }`}
          />
        </div>
      </div>

      {/* Bottom Footer Details */}
      {isCompletedTab && (
        <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-600">
          <div>
            <span>{t('completedDate')}: </span>
            <span className="font-bold text-emerald-700">{project.completed_at || '-'}</span>
          </div>
          {project.completed_by_name && (
            <div>
              <span>{t('completedBy')}: </span>
              <span className="font-semibold">{project.completed_by_name}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
