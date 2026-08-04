# CON-COST 개발팀 프로젝트 스케줄러

Cloudflare D1 데이터베이스와 React, TypeScript, Cloudflare Worker를 활용하여 개발팀의 여러 프로젝트 전체 공정 현황 및 작업자별 세부 공정을 관리하는 사내 간트 차트 웹 시스템입니다.

---

## 🚀 주요 특징

1. **2단계 간트 차트 구조**:
   - **`/projects`**: 전체 프로젝트 공정 현황 (시작일~종료일 막대, 전체 공정률, 오늘 날짜선, 주말 배경 구분)
   - **`/projects/:projectId`**: 작업자별 세부 공정 현황 (1작업 1행 배치, 날짜별 상태 색상 입력 팝업)
2. **D1 실시간 데이터베이스 연동**:
   - `projects`, `tasks`, `daily_status` 3개 D1 테이블 사용
   - 새로고침 후에도 Cloudflare D1에 데이터 지속 저장 유지
3. **공정률 자동 산출**:
   - 하위 작업 공정률의 단순 평균으로 프로젝트 전체 공정률 자동 계산 (`sum(task.progress) / task.count`)
4. **고정 스티키 레이아웃**:
   - 좌측 정보 영역과 상단 날짜 헤더 고정 및 가로 스크롤 지원

---

## 🛠 기술 스택

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide Icons
- **Backend / DB**: Cloudflare Worker, Cloudflare D1 (SQLite)
- **Testing & Tools**: Vitest, Wrangler, Zod

---

## 💻 로컬 개발 및 실행 방법

### 1. 패키지 설치
```bash
npm install
```

### 2. D1 로컬 마이그레이션 및 시드 데이터 적용
```bash
# 1) 테이블 생성 마이그레이션 실행
npm run d1:migrate:local

# 2) 초기 테스트 시드 데이터 입력
npm run d1:seed:local
```

### 3. 개발 서버 실행
```bash
# Vite 프론트엔드 및 Worker 통합 서버 구동
npm run dev
```

---

## 🧪 테스트 및 타입 검사

```bash
# TypeScript 타입 체크
npm run typecheck

# Vitest 유닛 테스트 실행
npm run test

# 프로덕션 빌드 테스트
npm run build
```

---

## ☁️ Cloudflare 배포 방법

### 1. Cloudflare D1 데이터베이스 생성
```bash
npx wrangler d1 create concost-db
```
출력된 `database_id`를 `wrangler.jsonc`에 입력합니다.

### 2. 프로덕션 D1 마이그레이션 적용
```bash
npx wrangler d1 migrations apply concost-db --remote
npx wrangler d1 execute concost-db --remote --file=./migrations/0002_seed_data.sql
```

### 3. Cloudflare Worker 배포
```bash
npx wrangler deploy
```
