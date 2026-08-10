// src/utils/projectSorting.ts
import { Project } from '../types';

export function compareProjectsByStartDateDesc(a: Project, b: Project): number {
  // Null / undefined start_date always last
  if (!a.start_date && !b.start_date) return 0;
  if (!a.start_date) return 1;
  if (!b.start_date) return -1;

  // 1. Primary: start_date DESC
  if (a.start_date !== b.start_date) {
    return b.start_date.localeCompare(a.start_date);
  }

  // 2. Secondary: end_date DESC
  const aEnd = a.end_date || '';
  const bEnd = b.end_date || '';
  if (aEnd !== bEnd) {
    return bEnd.localeCompare(aEnd);
  }

  // 3. Tertiary: created_at DESC
  const aCreated = a.created_at || '';
  const bCreated = b.created_at || '';
  return bCreated.localeCompare(aCreated);
}
