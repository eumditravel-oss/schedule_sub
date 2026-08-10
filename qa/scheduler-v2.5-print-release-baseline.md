# Scheduler V2.5 Print Release Baseline

Release Name: Scheduler V2.5 Print / Report Output System
Release SHA: 9cb509eff277c7dd761eb1cfa0cd27419979ee8e
Current Main SHA: 9cb509eff277c7dd761eb1cfa0cd27419979ee8e
QA Worker SHA: 9cb509eff277c7dd761eb1cfa0cd27419979ee8e
Production Worker SHA: 9cb509eff277c7dd761eb1cfa0cd27419979ee8e
Production Build Indicator SHA: 9cb509eff277c7dd761eb1cfa0cd27419979ee8e
Runtime Match: MATCH (Release SHA == Production Runtime SHA: 9cb509e)

Product State: PRODUCTION_RELEASED

---

## Release Governance Summary

1. **Release SHA Anchor**:
   - `V2_5_PRINT_RELEASE_SHA`: `9cb509eff277c7dd761eb1cfa0cd27419979ee8e`
   - `Production Runtime SHA`: Confirmed via live API (`GET https://concost-dev-scheduler.eumditravel.workers.dev/api/version` -> `9cb509eff277c7dd761eb1cfa0cd27419979ee8e`).

2. **Database & Data Changes**:
   - DB Migration: **0**
   - D1 Mutation: **0**
   - Project/Task Mutation: **0**
   - Calendar Mutation: **0**
   - Production Data Import: **0**

3. **Feature Coverage**:
   - 8 Report Templates (4 A4 Portrait, 4 A3 Landscape)
   - Dynamic `@page` size CSS rule injection
   - Task PRIMARY PIC semantics
   - Strict 2~3 Combined Project validation
   - Color and Mono mode visual tokens (hatch & contrast)
   - Korea Business Date single source utility (`Asia/Seoul`)

4. **Production Web UI Verification**:
   - Project Overview Print Button: VISIBLE
   - Project Detail Print Button: VISIBLE
   - Dropdown Menu: VISIBLE
   - Direct Print Routes: 100% PASS
