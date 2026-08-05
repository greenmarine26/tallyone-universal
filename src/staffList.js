// (주)그린마린 직원 명단 — 접속 화이트리스트 + 직책 정보
// 작성: 2026-05-12 / 명단 사진 기준
// 새 직원 추가/퇴사자 삭제 시 이 파일 직접 편집

// TallyUni 0.3-01: 소유자 특례에 필요한 테넌트 설정.
//   ⚠ adminGuard.isOwnerName을 쓰지 않는 이유 — adminGuard가 이 파일(isChief)을 import한다.
//     여기서 adminGuard를 부르면 순환 import가 된다. tenant.js는 아무것도 import하지 않으므로 안전하다.
import { tenant } from './tenant.js';

export const STAFF_LIST = [
  // 임원진
  { name: '최관묵', role: '회장' },
  { name: '신성호', role: '대표이사' },
  { name: '표인수', role: '상무이사' },
  { name: '황창웅', role: '이사' },

  // 실장/부장/차장/과장
  { name: '최장욱', role: '실장' },
  { name: '이현규', role: '부장(수석검수)' },
  { name: '김명보', role: '부장(수석검수)' },
  { name: '권수안', role: '차장' },
  { name: '정영배', role: '차장' },
  { name: '오승택', role: '차장(수석검수)' },
  { name: '성창모', role: '과장(수석검수)' },
  { name: '이강익', role: '과장(수석검수)' },

  // 대리
  { name: '김유신', role: '대리' },
  { name: '김석', role: '대리' },
  { name: '전우수', role: '대리(수석검수)' },
  { name: '김성일', role: '대리(부수석)' },

  // 검수
  { name: '장문영', role: '검수' },
  { name: '김판석', role: '검수' },
  { name: '최관식', role: '검수' },
  { name: '길태윤', role: '검수' },
  { name: '최유택', role: '검수' },
  { name: '김홍규', role: '검수' },
  { name: '천희준', role: '검수' },
  { name: '한성호', role: '검수' },
  { name: '이병진', role: '검수' },
  { name: '오종하', role: '검수' },
  { name: '이인철', role: '검수' },
  { name: '이종부', role: '검수' },
  { name: '최원형', role: '검수' },
];

// 이름만 배열로 (화이트리스트 검사용)
export const STAFF_NAMES = STAFF_LIST.map(s => s.name);

// 이름 → 직책 매핑
export const STAFF_ROLES = Object.fromEntries(STAFF_LIST.map(s => [s.name, s.role]));

// 정규화 (공백/특수문자 제거 후 비교용)
export function isStaff(name) {
  if (!name) return false;
  const norm = String(name).trim().replace(/[,\s\.\-_\/\\]/g, '');
  return STAFF_NAMES.some(n => n === norm || n.replace(/\s/g, '') === norm);
}

// V9.57(B-4 선행): 서버 staffList 직책 캐시 — Firebase 구독(fbSubscribeStaffList) 데이터를
//   구독부(App 등, 연결은 판2)가 setServerRoles로 밀어 넣는다. 모듈 캐시 방식이라 React 의존이 없고
//   getStaffRole/isChief는 순수 함수 형태를 유지한다. 서버 값 우선, 코드 STAFF_ROLES는 폴백.
let SERVER_ROLES = {};
export function setServerRoles(map) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const name = String((v && typeof v === 'object' && v.name) || k).trim();
    const role = typeof v === 'string' ? v.trim() : String((v && v.role) || '').trim();
    if (name && role) out[name] = role;
  }
  SERVER_ROLES = out;
}

export function getStaffRole(name) {
  if (!name) return '';
  const norm = String(name).trim();
  // V9.57: 서버 명단(관리자가 앱에서 추가/변경한 직책) 우선 — 코드 명단은 폴백
  return SERVER_ROLES[norm] || STAFF_ROLES[norm] || '';
}

// TallyUni 0.3-01: 테넌트 소유자인가 (adminGuard.isOwnerName과 같은 판정, 순환 import 회피용 사본).
//   모듈 상수로 굳히지 않고 매번 tenant()를 읽는다 — 첫 실행 마법사 직후에도 최신 값을 본다.
function _isTenantOwner(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  try {
    const o = String((tenant() || {}).owner || '').trim();
    return !!o && o === n;
  } catch { return false; }
}

// 수석검수 여부 (작업 권한) — 수석검수 또는 부수석 포함
export function isChief(name) {
  // ★ TallyUni 0.3-01(부트스트랩 안전망): 소유자는 무조건 수석이다.
  //   왜 — 첫 실행 마법사로 문을 연 테넌트 1호(소유자)는 자기 직책을 자유롭게 입력한다.
  //   '소장'·'대표'처럼 아래 정규식에 안 걸리는 직책을 넣으면 isChief=false가 되고,
  //   App 라우트 게이트(isChief||isOwnerName)는 통과하는데 ChiefDashboard 내부 가드(isChief)에서
  //   막혀 🔒 "수석 검수원 전용" 화면만 보게 된다(홈의 수석 대시보드 버튼도 isChief라 안 보인다).
  //   서버 staffList 구독이 아직 안 왔거나 규칙에 막혀도 같은 잠김이 생긴다.
  //   소유자를 잠그면 직책을 고쳐 줄 사람이 앱 안에 아무도 없다 — 그래서 이름 하나로 단락한다.
  if (_isTenantOwner(name)) return true;
  const role = getStaffRole(name);
  return /수석검수|부수석/.test(role);
}
