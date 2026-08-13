export type WorklogLanguage = 'ko' | 'vi';

export type WorklogMode = 'MORNING' | 'EOD';

export interface WorklogTask {
  task_id?: string;
  project_id?: string;
  project_name?: string;
  task_name?: string;
  assignment_id?: string;
  assignment_role?: 'PRIMARY' | 'CO_ASSIGNEE' | string;
  official_forecast_start?: string | null;
  official_forecast_end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface WorklogEntryDraft {
  id: string;
  taskId?: string;
  projectId?: string;
  assignmentId?: string;
  assignmentRole?: string;
  projectName?: string;
  taskName?: string;
  category: string;
  relatedProjectId?: string;
  relatedTaskId?: string;
  plannedMinutes: number;
  actualMinutes: number;
  targetProgress: string;
  progressAfter: string;
  remainingMinutes: string;
  completionReported: boolean;
  expectedDeliverable: string;
  workResult: string;
  deliverable: string;
  knownBlocker: string;
  reasonSource: string;
  meetingPurpose: string;
  meetingLocation: string;
  meetingParticipants: string;
  meetingStart: string;
  meetingEnd: string;
  meetingAgenda: string;
  meetingDecision: string;
  meetingFollowUp: string;
  leaveLinkId: string;
}

export const WORKLOG_CATEGORIES = [
  'NORMAL_ASSIGNED_TASK', 'UNPLANNED_SAME_PROJECT_TASK', 'OTHER_PROJECT_TASK',
  'OUTSIDE_WORK_SAME_PROJECT', 'OUTSIDE_WORK_OTHER_PROJECT', 'COMPANY_DUTY',
  'TRAINING', 'MEETING', 'ADMINISTRATION', 'INTERNAL_COMMUNICATION', 'WAITING',
  'NO_WORK_TECHNICAL_BLOCKER', 'NO_WORK_EXTERNAL_DEPENDENCY', 'APPROVED_LEAVE',
  'EMERGENCY_LEAVE',
] as const;

export const GAP_CODES = [
  'ADMINISTRATION', 'INTERNAL_COMMUNICATION', 'WAITING', 'TECHNICAL_BLOCKER',
  'EXTERNAL_DEPENDENCY', 'RECORDING_OMISSION', 'PERSONAL_EXCEPTION', 'OTHER',
] as const;

const KO: Record<string, string> = {
  title: '오늘 업무일지', today: '오늘', history: '최근 업무일지', back: '프로젝트 목록',
  morning: '업무 시작', eod: '업무 마감', status: '현재 상태', employee: '직원', date: '날짜',
  office: 'Office', workHours: '근무시간', lunch: '점심시간', capacity: '오늘 Capacity',
  morningStatus: 'Morning', eodStatus: 'EOD', notCreated: '업무일지 미작성',
  morningSubmitted: '업무 시작 완료', eodRequired: '업무 마감 필요', eodSubmitted: '오늘 업무일지 완료',
  correctionRequested: '수정 요청 중', managerReview: '관리자 확인 필요', late: '지연 작성',
  official: '현재 공식 일정', plan: '오늘 계획', actual: '실제 작업시간', role: '역할',
  primary: '주 담당', support: '지원 담당', currentProgress: '현재 공정률', targetProgress: '오늘 목표',
  remaining: '남은 예상시간', completion: '완료 보고', expectedDeliverable: '예상 산출물',
  workResult: '오늘 수행내용', deliverable: '산출물', blocker: '막힌 사항',
  addWork: '다른 업무 추가', remove: '삭제', category: '업무 분류', task: 'Task', project: '프로젝트',
  supportNoProgress: '지원 담당자는 작업 전체 공정률·남은 예상시간·완료 보고를 입력하지 않습니다.',
  plannedTotal: '총 계획시간', actualTotal: '기록한 실제시간', difference: '차이',
  capacityExceeded: '계획 시간이 오늘 근무 가능 시간을 초과합니다. 제출은 가능하지만 일정을 다시 확인해 주세요.',
  morningMissing: 'Morning 업무계획 미작성 상태입니다. EOD 작성은 계속할 수 있습니다.',
  submitMorning: '오늘 업무계획 제출', submitEod: '오늘 업무 마감', revise: '수정 저장',
  reviewTitle: '제출 전 확인', edit: '수정', confirm: '제출', submitting: '저장 중…',
  taskCount: '작업 건', gap: '미기록 시간', gapReason: '미기록 사유', gapDetail: '사유 상세',
  overtime: '초과근무', overtimeReason: '초과근무 사유', overtimeEvidence: '증빙 또는 설명',
  overtimePending: '초과근무 확인 대기', meeting: '회의 기록', purpose: '목적', location: '장소/방식',
  participants: '참석자', start: '시작', end: '종료', agenda: '주요 논의', decision: '결정사항', followUp: '후속 조치',
  correction: '수정 요청', correctionInfo: '직접 수정 기한이 지났습니다. 관리자에게 수정 요청을 보낼 수 있습니다.',
  correctionReason: '수정 요청 사유', sendRequest: '수정 요청 제출', revisionHistory: '수정 이력',
  revision: 'Revision', reason: '사유', changedAt: '수정 시각', changeType: '수정 종류',
  shadowImpact: '일정 영향', calculating: '일정 영향을 계산하고 있습니다.', shadowDone: '일정 영향 계산 완료',
  shadowFailed: '업무일지는 저장되었지만 일정 영향 계산은 완료되지 않았습니다. 관리자 확인이 필요합니다.',
  officialUnchanged: '공식 일정은 아직 변경되지 않았습니다. 일정 변경안은 관리자 확인 후에만 반영됩니다.',
  approvalRequired: '관리자 확인 필요', blocked: '일정 계산 불가', loading: '업무일지를 불러오는 중…',
  retry: '다시 시도', readOnly: '조회 전용 사용자입니다.', managerReadOnly: '선택한 직원의 업무일지를 조회 중입니다. 대신 작성할 수 없습니다.',
  noTasks: '오늘 공식 일정에 배정된 Task가 없습니다. 필요하면 다른 업무를 추가하세요.',
  saved: '업무일지가 저장되었습니다.', savedDraft: '작성 중인 내용이 이 기기에 저장되었습니다.',
  retryLater: '잠시 후 다시 시도해 주세요.', noHistory: '표시할 최근 업무일지가 없습니다.', details: '상세 보기',
  fullDay: '전일', minutes: '분', worklogSaved: '업무일지가 저장되었습니다.',
};

const VI: Record<string, string> = {
  title: 'Nhật ký công việc hôm nay', today: 'Hôm nay', history: 'Nhật ký gần đây', back: 'Danh sách dự án',
  morning: 'Bắt đầu công việc', eod: 'Kết thúc công việc', status: 'Trạng thái hiện tại', employee: 'Nhân viên', date: 'Ngày',
  office: 'Văn phòng', workHours: 'Giờ làm việc', lunch: 'Giờ nghỉ trưa', capacity: 'Capacity hôm nay',
  morningStatus: 'Morning', eodStatus: 'EOD', notCreated: 'Chưa tạo nhật ký', morningSubmitted: 'Đã bắt đầu công việc',
  eodRequired: 'Cần chốt công việc', eodSubmitted: 'Đã hoàn thành nhật ký hôm nay', correctionRequested: 'Đang yêu cầu chỉnh sửa',
  managerReview: 'Cần quản lý xác nhận', late: 'Nộp muộn', official: 'Lịch chính thức hiện tại', plan: 'Kế hoạch hôm nay',
  actual: 'Thời gian thực tế', role: 'Vai trò', primary: 'Phụ trách chính', support: 'Hỗ trợ',
  currentProgress: 'Tiến độ hiện tại', targetProgress: 'Mục tiêu hôm nay', remaining: 'Thời gian dự kiến còn lại',
  completion: 'Báo hoàn thành', expectedDeliverable: 'Sản phẩm dự kiến', workResult: 'Công việc đã thực hiện',
  deliverable: 'Sản phẩm bàn giao', blocker: 'Vướng mắc', addWork: 'Thêm công việc khác', remove: 'Xóa',
  category: 'Phân loại công việc', task: 'Công việc', project: 'Dự án',
  supportNoProgress: 'Người hỗ trợ không nhập tiến độ tổng, thời gian còn lại hoặc báo hoàn thành của công việc.',
  plannedTotal: 'Tổng thời gian kế hoạch', actualTotal: 'Tổng thời gian đã ghi', difference: 'Chênh lệch',
  capacityExceeded: 'Thời gian kế hoạch vượt quá giờ làm việc hôm nay. Bạn vẫn có thể nộp nhưng hãy kiểm tra lại.',
  morningMissing: 'Chưa có kế hoạch Morning. Bạn vẫn có thể hoàn tất EOD.', submitMorning: 'Nộp kế hoạch hôm nay',
  submitEod: 'Chốt công việc hôm nay', revise: 'Lưu chỉnh sửa', reviewTitle: 'Xác nhận trước khi nộp', edit: 'Chỉnh sửa',
  confirm: 'Nộp', submitting: 'Đang lưu…', taskCount: 'công việc', gap: 'Thời gian chưa ghi nhận',
  gapReason: 'Lý do chưa ghi nhận', gapDetail: 'Chi tiết lý do', overtime: 'Làm thêm giờ', overtimeReason: 'Lý do làm thêm',
  overtimeEvidence: 'Bằng chứng hoặc mô tả', overtimePending: 'Chờ xác nhận làm thêm', meeting: 'Ghi nhận cuộc họp',
  purpose: 'Mục đích', location: 'Địa điểm/Hình thức', participants: 'Người tham dự', start: 'Bắt đầu', end: 'Kết thúc',
  agenda: 'Nội dung chính', decision: 'Quyết định', followUp: 'Việc tiếp theo', correction: 'Yêu cầu chỉnh sửa',
  correctionInfo: 'Đã hết hạn tự chỉnh sửa. Bạn có thể gửi yêu cầu cho quản lý.', correctionReason: 'Lý do yêu cầu chỉnh sửa',
  sendRequest: 'Gửi yêu cầu chỉnh sửa', revisionHistory: 'Lịch sử chỉnh sửa', revision: 'Phiên bản', reason: 'Lý do',
  changedAt: 'Thời điểm chỉnh sửa', changeType: 'Loại chỉnh sửa', shadowImpact: 'Ảnh hưởng lịch trình',
  calculating: 'Đang tính ảnh hưởng lịch trình.', shadowDone: 'Đã tính xong ảnh hưởng lịch trình',
  shadowFailed: 'Nhật ký đã được lưu nhưng việc tính ảnh hưởng lịch trình chưa hoàn tất. Cần quản lý kiểm tra.',
  officialUnchanged: 'Lịch chính thức chưa thay đổi. Đề xuất thay đổi chỉ được áp dụng sau khi quản lý xác nhận.',
  approvalRequired: 'Cần quản lý xác nhận', blocked: 'Không thể tính lịch trình', loading: 'Đang tải nhật ký công việc…',
  retry: 'Thử lại', readOnly: 'Tài khoản chỉ có quyền xem.', managerReadOnly: 'Bạn đang xem nhật ký của nhân viên đã chọn. Không thể nộp thay.',
  noTasks: 'Không có công việc được phân công trong lịch chính thức hôm nay. Có thể thêm công việc khác.',
  saved: 'Nhật ký công việc đã được lưu.', savedDraft: 'Nội dung đang soạn đã được lưu trên thiết bị này.',
  retryLater: 'Vui lòng thử lại sau.', noHistory: 'Không có nhật ký gần đây để hiển thị.', details: 'Xem chi tiết',
  fullDay: 'Cả ngày', minutes: 'phút', worklogSaved: 'Nhật ký công việc đã được lưu.',
};

export function worklogText(language: WorklogLanguage, key: string): string {
  return (language === 'vi' ? VI : KO)[key] || KO[key] || key;
}

export function isPrimary(entry: WorklogEntryDraft): boolean {
  return entry.assignmentRole === 'PRIMARY';
}

export function isTaskScoped(category: string): boolean {
  return ['NORMAL_ASSIGNED_TASK', 'UNPLANNED_SAME_PROJECT_TASK', 'OTHER_PROJECT_TASK', 'OUTSIDE_WORK_SAME_PROJECT', 'OUTSIDE_WORK_OTHER_PROJECT'].includes(category);
}

export function needsMeetingRecord(category: string): boolean {
  return ['MEETING', 'OUTSIDE_WORK_SAME_PROJECT', 'OUTSIDE_WORK_OTHER_PROJECT'].includes(category);
}

export function categoryLabel(language: WorklogLanguage, category: string): string {
  const ko: Record<string, string> = {
    NORMAL_ASSIGNED_TASK: '배정 Task', UNPLANNED_SAME_PROJECT_TASK: '같은 프로젝트 다른 Task', OTHER_PROJECT_TASK: '다른 프로젝트 Task',
    OUTSIDE_WORK_SAME_PROJECT: '같은 프로젝트 외부 업무', OUTSIDE_WORK_OTHER_PROJECT: '다른 프로젝트 외부 업무', COMPANY_DUTY: '회사 업무',
    TRAINING: '교육', MEETING: '회의', ADMINISTRATION: '행정 업무', INTERNAL_COMMUNICATION: '내부 커뮤니케이션', WAITING: '대기',
    NO_WORK_TECHNICAL_BLOCKER: '기술 이슈', NO_WORK_EXTERNAL_DEPENDENCY: '외부 의존성', APPROVED_LEAVE: '승인 휴가', EMERGENCY_LEAVE: '긴급 휴가',
  };
  const vi: Record<string, string> = {
    NORMAL_ASSIGNED_TASK: 'Công việc được phân công', UNPLANNED_SAME_PROJECT_TASK: 'Công việc khác cùng dự án', OTHER_PROJECT_TASK: 'Công việc dự án khác',
    OUTSIDE_WORK_SAME_PROJECT: 'Công việc ngoài dự án hiện tại', OUTSIDE_WORK_OTHER_PROJECT: 'Công việc ngoài dự án khác', COMPANY_DUTY: 'Công việc công ty',
    TRAINING: 'Đào tạo', MEETING: 'Họp', ADMINISTRATION: 'Hành chính', INTERNAL_COMMUNICATION: 'Trao đổi nội bộ', WAITING: 'Chờ',
    NO_WORK_TECHNICAL_BLOCKER: 'Vướng mắc kỹ thuật', NO_WORK_EXTERNAL_DEPENDENCY: 'Phụ thuộc bên ngoài', APPROVED_LEAVE: 'Nghỉ phép đã duyệt', EMERGENCY_LEAVE: 'Nghỉ khẩn cấp',
  };
  return (language === 'vi' ? vi : ko)[category] || category;
}

export function gapLabel(language: WorklogLanguage, code: string): string {
  const ko: Record<string, string> = {
    ADMINISTRATION: '일반 행정업무', INTERNAL_COMMUNICATION: '내부 커뮤니케이션', WAITING: '대기', TECHNICAL_BLOCKER: '기술 이슈',
    EXTERNAL_DEPENDENCY: '외부 의존성', RECORDING_OMISSION: '기록 누락', PERSONAL_EXCEPTION: '개인 사유', OTHER: '기타',
  };
  const vi: Record<string, string> = {
    ADMINISTRATION: 'Hành chính', INTERNAL_COMMUNICATION: 'Trao đổi nội bộ', WAITING: 'Chờ', TECHNICAL_BLOCKER: 'Vướng mắc kỹ thuật',
    EXTERNAL_DEPENDENCY: 'Phụ thuộc bên ngoài', RECORDING_OMISSION: 'Bỏ sót ghi nhận', PERSONAL_EXCEPTION: 'Lý do cá nhân', OTHER: 'Khác',
  };
  return (language === 'vi' ? vi : ko)[code] || code;
}

export function newEntry(task?: WorklogTask): WorklogEntryDraft {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    taskId: task?.task_id,
    projectId: task?.project_id,
    assignmentId: task?.assignment_id,
    assignmentRole: task?.assignment_role,
    projectName: task?.project_name,
    taskName: task?.task_name,
    category: task?.task_id ? 'NORMAL_ASSIGNED_TASK' : 'ADMINISTRATION',
    relatedProjectId: undefined, relatedTaskId: undefined,
    plannedMinutes: 0,
    actualMinutes: 0,
    targetProgress: '',
    progressAfter: '',
    remainingMinutes: '',
    completionReported: false,
    expectedDeliverable: '', workResult: '', deliverable: '', knownBlocker: '', reasonSource: '',
    meetingPurpose: '', meetingLocation: '', meetingParticipants: '', meetingStart: '', meetingEnd: '',
    meetingAgenda: '', meetingDecision: '', meetingFollowUp: '',
    leaveLinkId: '',
  };
}
