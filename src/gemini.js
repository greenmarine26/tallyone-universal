// Gemini API 연동 (M5.80 강화판)
//
// 핵심 변경 vs M5.79:
//   [1] 모델: 2.5 Pro → 2.5 Flash
//       - 응답 3~10초 → 0.5~1.5초
//       - 무료 한도 50회/일 → 1500회/일
//   [2] RAG (검색-증강 생성):
//       - 매 질문마다 1500대 전체 보내지 않음
//       - 질문 키워드(parsed)로 후보 좁히기 (베이/DG/리퍼/POL/POD/컨번호)
//       - 평균 30~50대만 LLM에 전달 → 토큰 90% 절감
//   [3] 멀티턴 대화:
//       - 이전 5턴 메모리 유지 (contents 배열)
//       - 5턴 넘으면 첫 3턴 자동 요약 압축
//   [4] systemInstruction 분리:
//       - 도메인 지식 / 컨텍스트는 systemInstruction에
//       - 매 턴 새로 보내지 않음 (모델 캐시 활용)
//
// 무료 할당량 (Gemini Flash):
//   - 분당 15 RPM
//   - 일일 1500회
//   - 토큰 분당 100만
//   → 검수원 15명 × 하루 50회 = 750회/일, 한도의 50% 사용

import { fmtPos, normalizeBay } from './utils.js';
import { lookupUN } from './dgUnDict.js';

// V9.57(G11): 하드코딩 폴백 키 삭제 — GitHub public repo 노출로 이미 차단된 키였고,
//   소스에 실키를 두는 것 자체가 보안 위반. export 이름은 소비처 6곳(GeminiKeyModal·VoyagePage·
//   MixerUploadModal·PortMisCaptureModal·StowageReviewModal·BulkStowageModal)이 임포트하므로
//   유지하되 빈 문자열 — `_storage.get(SK.geminiKey) || GEMINI_API_KEY` 패턴이 자연히
//   "본인 키 없으면 키 없음" 분기로 흐른다(각 소비처는 키 부재 안내를 이미 갖춤).
export const GEMINI_API_KEY = '';
const GEMINI_MODEL = 'gemini-2.5-flash';   // M5.80: Pro → Flash
// V9.57(G11): 키 부재 공통 안내 문구 — 조용한 실패 금지.
const NO_KEY_MSG = 'Gemini API 키가 없습니다. 헤더 🔑 버튼(설정)에서 AI 키를 등록하세요.';

// M6.14d: 매 호출 시 localStorage에서 검수원 본인 키 우선 사용
//   M5.70에 패턴만 있고 SK 정의/UI 누락되어 실제로는 작동 안 했던 버그 완전 수정.
function getActiveGeminiKey() {
  try {
    return localStorage.getItem('master_gemini_api_key_v1') || '';
  } catch {
    return '';
  }
}
function getActiveGeminiUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getActiveGeminiKey()}`;
}

// ─── 도메인 지식 (systemInstruction에 들어감) ───────────────────────────────
const DOMAIN_KNOWLEDGE = `
[항만 도메인 지식 — 평택항 컨테이너 검수]

■ 항구 코드 (POL=선적항, POD=양하항)
- KRPTK = 평택 (한국, 우리 항구) / KRPUS 부산 / KRINC 인천 / KRKAN 광양
- VNSGN = 호치민 (베트남) / VNHPP 하이퐁
- THLCH = 람차방 (태국) / THBKK 방콕
- JPTYO 도쿄 / JPYOK 요코하마 / CN* 중국 / US* 미국

■ 컨테이너 ISO 규격 (앞 2자리 = 길이/높이, 셋째 자리 = 종류)
- 22GP/22G0/22G1 = 20피트 표준 (20DC) — 끝자리 0=Full 보편, 1=Empty 보편 (양식별 차이)
- 25GP = 20피트 하이큐브
- 22RE/22R0/22R1 = 20피트 리퍼
- 42GP/42G0/42G1 = 40피트 표준 (40DC)
- 45GP/45G0/45G1 = 40피트 하이큐브 (45피트 아님!)
- L5G1 = 진짜 45피트 GP
- 42PC/22PF = 플랫랙 (FR)
- 22UT = 오픈탑 (OT)
- 22TN/22T6 = 탱크 (TK)

■ 상태 (F/E)
- F = Full (적컨, 화물 있음)
- E = Empty (공컨, 빈 컨테이너)

■ 선내 위치 (좌표 BBBRRTT = 베이3+row2+tier2, 또는 BBRRTT 6자리)
- 베이(Bay): 선수→선미. 홀수=20피트 슬롯, 짝수=40피트 슬롯
- 트윈 짝꿍: 짝수 베이 양옆 홀수 베이가 짝. 짝수 없으면 통로(단독)
- Row: 좌우. 00=중앙, 01/03/... 우현, 02/04/... 좌현
- Tier: 높이. ≥80 = DECK 갑판상, <80 = HOLD 화물창

■ 무게/단위
- VGM = Verified Gross Mass (검증된 총중량, 우선 사용)
- WT = Weight (일반 총중량)
- KGM = kg

■ 특수화물 약어
- RF (Reefer) 리퍼 / DG (Dangerous Goods) 위험물
- FR (Flat Rack) / OT (Open Top) / TK (Tank) / OOG (Out Of Gauge)

■ 환적 (M5.79 추가)
- LOC+9 POL / LOC+11 POD / LOC+76 npod (추가 POL)
- LOC+83 tspot (환적항) — 2단 환적 추적용
- LOC+97/98 fpod (최종 목적지)

■ M5.79: 평택 적재 부킹 슬롯
- EDI에 컨번호 빈 칸인 컨테이너 = 부킹 단계 (검수원이 현장에서 채울 슬롯)
- 임시 ID 형식: __BOOK_{bay}_{row}_{tier}
- cn에 __BOOK_ 접두사가 보이면 "컨번호 입력대기"라고 답하세요

■ 검수 워크플로
- 양하 (Discharge): 배에서 내림 (POD=평택)
- 선적 (Loading): 배에 실음 (POL=평택)
- 시프팅: 양하 위에 올라간 컨을 임시로 옮기기
- TWIN: 트윈 트레일러 (20피트 두 개 동시)
- X-RAY: 엑스레이 검사 대상 (세관 지정)
- 실오류: 봉인번호 불일치 (세관 신고)

[IMDG 위험물 격리 규정]

■ 9개 클래스
1 폭발물 / 2 가스(2.1 인화성, 2.2 비독성, 2.3 독성) / 3 인화성 액체
4 가연성 고체(4.1, 4.2 자연발화, 4.3 물반응) / 5 산화성 / 6 독성/감염성
7 방사성 / 8 부식성 / 9 기타 위험물

■ 격리 등급
- 1 Away from (떨어져, 같은 구획 안 분리)
- 2 Separated from (분리, 1컨 거리 또는 다른 격실)
- 3 Separated by complete compartment (격실 완전 분리)
- 4 Separated longitudinally by complete compartment (가장 엄격)

■ 트윈/인접 적재 판단
- Class 1 ↔ 대부분: Separated 이상 → 트윈 불가
- Class 2.1 ↔ Class 3: Separated → 트윈 불가
- Class 3 ↔ Class 5: Separated → 트윈 불가
- Class 4.2 ↔ Class 8: Separated → 트윈 불가
- Class 7 ↔ 거주구역/식품: Separated 이상
- 같은 클래스끼리 일반적으로 OK (1.1, 1.2 등 예외)
- 정확한 격리표는 IMDG Code 7.2.4 참조
`.trim();

const SYSTEM_PROMPT = `당신은 평택항 컨테이너 검수원의 AI 도우미입니다.
주어진 항차 데이터를 기반으로 질문에 정확·간결하게 답하세요.

${DOMAIN_KNOWLEDGE}

[답변 규칙]
1. 데이터에 없는 내용은 절대 추측하지 말고 "데이터에 없음"이라고 답하세요.
2. 답변은 한국어로 짧고 명확하게 (2~4문장 이내, 단 리스트는 더 길어도 됨).
3. 숫자는 정확히 표시하고, 컨번호는 4자리 끝번호 위주로 알려주세요.
4. 위치는 베이-row-tier 형식 (예: 16-01-86, 또는 100-04-82) — 베이는 앞 0 없는 정수.
5. ★ 음성 안내 친화: 위치를 말할 때 "16-01-86"처럼 숫자 형식으로 답하세요 (음성합성기가 자동 변환).
6. 검수원이 손에 폰 들고 빠르게 읽을 수 있도록 핵심만 답하세요.
7. 위험물 트윈 가부 질문 시 IMDG 격리 등급으로 판단하되, "정확한 판단은 IMDG Code 격리표 확인 필요" 한 줄 추가.
8. 베이별/POL/POD별 집계, 무게 합계 등 계산이 필요하면 제공된 데이터로 직접 계산.
9. 베이 번호는 정수("1", "16", "100")이며 앞에 0을 붙이지 마세요.
10. 대화 중 follow-up 질문 ("그 중...", "그 위에...")이 오면 직전 답변의 컨테이너 집합을 기준으로 답하세요.
11. 컨번호 cn이 __BOOK_로 시작하면 "컨번호 입력대기 (부킹 슬롯)"이라고 답하세요.`;

// ─── RAG: 질문 키워드로 후보 컨테이너 좁히기 ───────────────────────────────
//   parsed = parseNaturalQuery 결과
//   - 베이 번호 있으면 그 베이만
//   - DG/리퍼/FR/OT/TK 타입 있으면 해당만
//   - POL/POD 있으면 해당만
//   - 컨번호 끝자리 있으면 그 컨테이너만
//   - 무게 범위 있으면 해당
//   - 아무 조건 없으면 전체 (단 통계+상위 50대만 전달)
//
// 출력: { containers: [...], filterDesc: "베이 16 / 양하" }
export function ragFilter(question, allContainers, parsed = {}) {
  let filtered = allContainers;
  const desc = [];

  // 베이 번호
  if (parsed.bay) {
    const b = String(parsed.bay);
    filtered = filtered.filter(c => normalizeBay(c.bay) === b);
    desc.push(`베이 ${b}`);
  }

  // 타입 (DG/RF/FR/OT/TK/X-RAY)
  if (parsed.type) {
    if (parsed.type === 'dg') {
      filtered = filtered.filter(c => c.dg);
      desc.push('DG');
    } else if (parsed.type === 'rf') {
      filtered = filtered.filter(c => c.rf || (c.iso && c.iso[2] === 'R'));
      desc.push('리퍼');
    } else if (parsed.type === 'fr') {
      filtered = filtered.filter(c => c.fr || /^[24][0245689]P/.test(c.iso || ''));
      desc.push('FR');
    } else if (parsed.type === 'ot') {
      filtered = filtered.filter(c => c.ot);
      desc.push('OT');
    } else if (parsed.type === 'tk') {
      filtered = filtered.filter(c => c.tk);
      desc.push('TK');
    } else if (parsed.type === 'xray') {
      filtered = filtered.filter(c => c._xray);
      desc.push('X-RAY');
    } else if (parsed.type === 'oog') {
      filtered = filtered.filter(c => c.oog);
      desc.push('OOG');
    }
  }

  // F/E
  if (parsed.fe) {
    filtered = filtered.filter(c => c.fe === parsed.fe);
    desc.push(parsed.fe === 'F' ? 'Full' : 'Empty');
  }

  // 사이즈
  if (parsed.size) {
    if (parsed.size === '20') filtered = filtered.filter(c => c.iso && c.iso.startsWith('2'));
    else if (parsed.size === '40') filtered = filtered.filter(c => c.iso && c.iso.startsWith('4'));
    else if (parsed.size === '45') filtered = filtered.filter(c => c.iso && c.iso.startsWith('L'));
    desc.push(`${parsed.size}피트`);
  }

  // POL/POD
  if (parsed.pol) {
    filtered = filtered.filter(c => (c.pol || '').includes(parsed.pol));
    desc.push(`POL ${parsed.pol}`);
  }
  if (parsed.pod) {
    filtered = filtered.filter(c => (c.pod || '').includes(parsed.pod));
    desc.push(`POD ${parsed.pod}`);
  }
  if (parsed.portAny && !parsed.pol && !parsed.pod) {
    filtered = filtered.filter(c =>
      (c.pol || '').includes(parsed.portAny) || (c.pod || '').includes(parsed.portAny)
    );
    desc.push(`항구 ${parsed.portAny}`);
  }

  // 구역
  if (parsed.zone === 'deck') {
    filtered = filtered.filter(c => parseInt(c.tier, 10) >= 80);
    desc.push('갑판');
  } else if (parsed.zone === 'hold') {
    filtered = filtered.filter(c => parseInt(c.tier, 10) < 80);
    desc.push('선창');
  }

  // 컨번호 끝자리
  if (parsed.digits) {
    const d = parsed.digits;
    filtered = filtered.filter(c => {
      const l4 = c.l4 || (c.cn || '').slice(-4);
      return l4.endsWith(d) || (c.cn || '').includes(d);
    });
    desc.push(`끝자리 ${d}`);
  }

  // DG 클래스 / UN
  if (parsed.dgClass) {
    filtered = filtered.filter(c => c.dg && (c.dgc || '').startsWith(parsed.dgClass));
    desc.push(`Class ${parsed.dgClass}`);
  }
  if (parsed.un) {
    filtered = filtered.filter(c => c.dg && (c.un || '') === parsed.un);
    desc.push(`UN ${parsed.un}`);
  }

  // 무게
  if (parsed.weightMin != null) {
    filtered = filtered.filter(c => (parseInt(c.wt, 10) || 0) >= parsed.weightMin);
    desc.push(`${parsed.weightMin / 1000}톤 이상`);
  }
  if (parsed.weightMax != null) {
    filtered = filtered.filter(c => (parseInt(c.wt, 10) || 0) <= parsed.weightMax);
    desc.push(`${parsed.weightMax / 1000}톤 이하`);
  }

  // 모드
  if (parsed.mode) {
    filtered = filtered.filter(c => c._mode === parsed.mode);
    desc.push(parsed.mode === 'discharge' ? '양하' : '선적');
  }

  return {
    containers: filtered,
    filterDesc: desc.length ? desc.join(' / ') : '전체',
    narrowed: filtered.length < allContainers.length,
  };
}

// ─── 컨테이너 압축 (M5.80: tspot/fpod/isBooking 추가) ───────────────────────────────
function compactContainer(c) {
  const o = {
    cn: c.cn,
    p: fmtPos(c),
    iso: c.iso,
    fe: c.fe,
    m: c._mode === 'discharge' ? 'D' : 'L',
  };
  if (c.wt) o.wt = c.wt;
  if (c.pol) o.pol = c.pol;
  if (c.pod) o.pod = c.pod;
  if (c.tspot) o.ts = c.tspot;     // M5.80: 환적항
  if (c.fpod) o.fp = c.fpod;        // M5.80: 최종지
  if (c.sl) o.sl = c.sl;
  if (c._xray) o.x = 1;
  if (c._comp) o.done = 1;
  if (c.rf || (c.iso && c.iso[2] === 'R')) {
    o.rf = 1;
    if (c.tmp) o.tmp = c.tmp;
  }
  if (c.dg) {
    o.dg = 1;
    if (c.dgc) o.dgc = c.dgc;
    if (c.un) {
      o.un = c.un;
      // M5.80: UN 화물명도 함께 (LLM 추론 도움)
      const info = lookupUN(c.un);
      if (info) o.un_name = info.name;
    }
    if (c.pg) o.pg = c.pg;
  }
  if (c.fr || /^[24][0245689]P/.test(c.iso || '')) o.fr = 1;
  if (c.ot) o.ot = 1;
  if (c.tk) o.tk = 1;
  if (c.isBooking) o.booking = 1;   // M5.80: 부킹 슬롯 마커
  return o;
}

// ─── 베이별 통계 ───────────────────────────────
function buildBayStats(allContainers) {
  const bayMap = {};
  allContainers.forEach(c => {
    if (!c.bay) return;
    const b = normalizeBay(c.bay);
    if (!b) return;
    if (!bayMap[b]) {
      bayMap[b] = { total: 0, F: 0, E: 0, deck: 0, hold: 0, wt: 0, rf: 0, dg: 0 };
    }
    bayMap[b].total++;
    if (c.fe === 'F') bayMap[b].F++;
    else if (c.fe === 'E') bayMap[b].E++;
    const tier = parseInt(c.tier, 10) || 0;
    if (tier >= 80) bayMap[b].deck++;
    else bayMap[b].hold++;
    const w = parseInt(c.wt, 10) || 0;
    bayMap[b].wt += w;
    if (c.rf || (c.iso && c.iso[2] === 'R')) bayMap[b].rf++;
    if (c.dg) bayMap[b].dg++;
  });
  return bayMap;
}

function buildPolPodDist(allContainers) {
  const pol = {}, pod = {};
  allContainers.forEach(c => {
    if (c.pol) pol[c.pol] = (pol[c.pol] || 0) + 1;
    if (c.pod) pod[c.pod] = (pod[c.pod] || 0) + 1;
  });
  return { pol, pod };
}

function buildDgList(allContainers) {
  const list = [];
  const byClass = {};
  allContainers.forEach(c => {
    if (!c.dg) return;
    const cls = c.dgc || '?';
    byClass[cls] = (byClass[cls] || 0) + 1;
    const info = lookupUN(c.un);
    list.push({
      cn: c.cn,
      pos: fmtPos(c),
      cls,
      un: c.un || '',
      un_name: info ? info.name : '',
      fe: c.fe,
      pg: c.pg || '',
    });
  });
  return { list, byClass };
}

function buildContext(voyage, allContainers) {
  const stats = {
    total: allContainers.length,
    discharge: allContainers.filter(c => c._mode === 'discharge').length,
    loading: allContainers.filter(c => c._mode === 'loading').length,
    full: allContainers.filter(c => c.fe === 'F').length,
    empty: allContainers.filter(c => c.fe === 'E').length,
    rf: allContainers.filter(c => c.rf || (c.iso && c.iso[2] === 'R')).length,
    dg: allContainers.filter(c => c.dg).length,
    fr: allContainers.filter(c => c.fr || /^[24][0245689]P/.test(c.iso || '')).length,
    ot: allContainers.filter(c => c.ot).length,
    tk: allContainers.filter(c => c.tk).length,
    xray: allContainers.filter(c => c._xray).length,
    completed: allContainers.filter(c => c._comp).length,
    booking: allContainers.filter(c => c.isBooking).length,  // M5.80
  };
  const isoCount = {};
  allContainers.forEach(c => {
    const iso = c.iso || 'unknown';
    isoCount[iso] = (isoCount[iso] || 0) + 1;
  });
  const opCount = {};
  allContainers.forEach(c => {
    if (c.op) opCount[c.op] = (opCount[c.op] || 0) + 1;
  });
  return {
    vsl: voyage?.info?.vsl || '',
    voy: voyage?.info?.voy || '',
    imo: voyage?.info?.imo || '',
    etd: voyage?.info?.etd || '',
    eta: voyage?.info?.eta || '',
    stats,
    isoCount,
    opCount,
  };
}

// ─── 멀티턴 히스토리 압축 ───────────────────────────────
// 5턴 넘으면 첫 3턴을 한 문장으로 요약
//   history = [{role:'user', content:'...'}, {role:'model', content:'...'}, ...]
function compressHistory(history) {
  if (history.length <= 10) return history;   // 5턴 = 10 메시지 (user+model 쌍)
  // 첫 3턴(6메시지) 요약 + 최근 4턴(8메시지) 유지
  const oldMessages = history.slice(0, 6);
  const recentMessages = history.slice(-8);
  const summary = `[이전 대화 요약]\n` +
    oldMessages.map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${(m.content || '').slice(0, 100)}`).join('\n');
  return [
    { role: 'user', content: summary + '\n\n위 내용을 기억하고 이어 답하세요.' },
    { role: 'model', content: '네, 이전 대화 내용 확인했습니다.' },
    ...recentMessages,
  ];
}

// ─── 메인: AI 질의 (M5.80 신규 시그니처) ───────────────────────────────
//
// opts:
//   - history: 멀티턴 대화 히스토리 [{role:'user'|'model', content:'...'}, ...]
//   - shipLib: 선박 라이브러리 (이전 항차 통계)
//   - parsedQuery: parseNaturalQuery 결과 (RAG 필터링용)
//
// 반환: { ok, answer, error, ragInfo }
export async function askGemini(question, voyage, allContainers, opts = {}) {
  // V9.57(G11): 키 없으면 명확한 안내로 즉시 반환 — 빈 키로 fetch해 400을 받는 조용한 실패 방지.
  if (!getActiveGeminiKey()) return { ok: false, error: NO_KEY_MSG };
  const { history = [], shipLib = null, parsedQuery = {} } = opts;

  // === RAG: 질문 키워드로 후보 좁히기 ===
  const ragResult = ragFilter(question, allContainers, parsedQuery);
  const candidates = ragResult.containers;

  // 통계는 전체 기준, 컨테이너 리스트는 RAG 결과 기준
  const ctx = buildContext(voyage, allContainers);
  const bayStats = buildBayStats(allContainers);
  const polPod = buildPolPodDist(allContainers);
  const dgInfo = buildDgList(allContainers);

  // RAG 결과 컨테이너만 압축 (또는 후보 너무 많으면 100대로 자름)
  const MAX_CANDIDATES = 100;
  const sentList = candidates.slice(0, MAX_CANDIDATES).map(compactContainer);
  const truncated = candidates.length > MAX_CANDIDATES;

  const shipLibBlock = shipLib ? `
[선박 라이브러리 (이전 항차 평균)]
${JSON.stringify({
  total_voyages: shipLib.stats?.total_voyages || 0,
  avg_discharge: shipLib.stats?.total_discharge && shipLib.stats?.total_voyages
    ? Math.round(shipLib.stats.total_discharge / shipLib.stats.total_voyages) : 0,
  avg_loading: shipLib.stats?.total_loading && shipLib.stats?.total_voyages
    ? Math.round(shipLib.stats.total_loading / shipLib.stats.total_voyages) : 0,
})}
` : '';

  // 시스템 컨텍스트 (매 턴 같음 — systemInstruction에 캐시 가능)
  const contextBlock = `[항차 정보]
선박: ${ctx.vsl} / 항차: ${ctx.voy} / IMO: ${ctx.imo}
ETD: ${ctx.etd} / ETA: ${ctx.eta}

[전체 통계]
- 총 ${ctx.stats.total}대 (양하 ${ctx.stats.discharge} / 선적 ${ctx.stats.loading})
- Full ${ctx.stats.full} / Empty ${ctx.stats.empty}
- 리퍼 ${ctx.stats.rf} / DG ${ctx.stats.dg} / FR ${ctx.stats.fr} / OT ${ctx.stats.ot} / TK ${ctx.stats.tk}
- X-RAY ${ctx.stats.xray} / 완료 ${ctx.stats.completed}/${ctx.stats.total}
- 부킹 슬롯(컨번호 입력대기) ${ctx.stats.booking}

[ISO 분포] ${JSON.stringify(ctx.isoCount)}
[검수업체] ${JSON.stringify(ctx.opCount)}
[POL 분포] ${JSON.stringify(polPod.pol)}
[POD 분포] ${JSON.stringify(polPod.pod)}

[베이별 통계] (베이: {total/F/E/deck/hold/wt합계kg/rf/dg})
${JSON.stringify(bayStats)}

[위험물 클래스별] ${JSON.stringify(dgInfo.byClass)}
[위험물 리스트] ${JSON.stringify(dgInfo.list)}
${shipLibBlock}`;

  // 첫 턴: 컨텍스트 + 질문
  // 이어지는 턴: history + (좁혀진 컨테이너 + 질문)
  //   - 컨텍스트(전체 통계)는 같으니 systemInstruction에서 다룸
  //   - 매 턴 RAG 결과 컨테이너만 새로 전달

  const ragBlock = ragResult.narrowed
    ? `[RAG 필터링: ${ragResult.filterDesc} → ${candidates.length}대]`
    : `[RAG 필터링: 조건 없음 → 전체 ${candidates.length}대 중 ${sentList.length}대 샘플]`;

  const userContent = `${ragBlock}

[컨테이너 목록 (압축, ${sentList.length}/${candidates.length}대)]
필드 약어: cn=컨번호, p=위치(bay-row-tier), iso=ISO, fe=F/E, m=D양하/L선적,
wt=무게kg, pol=선적항, pod=양하항, ts=환적항(LOC+83), fp=최종지(LOC+97/98),
sl=실번호, x=X-RAY, done=완료, rf=리퍼, tmp=온도,
dg=위험물, dgc=클래스, un=UN번호, un_name=화물명, pg=PG위험등급, fr/ot/tk,
booking=1이면 컨번호 입력대기(부킹 슬롯)
${JSON.stringify(sentList)}
${truncated ? `\n※ ${candidates.length}대 중 상위 ${MAX_CANDIDATES}대만 전달` : ''}

[질문] ${question}`;

  // 멀티턴: 히스토리 + 현재 질문
  const historyCompact = compressHistory(history);
  const contents = [
    // 첫 턴이면 컨텍스트만 한 번
    ...(historyCompact.length === 0 ? [
      { role: 'user', parts: [{ text: contextBlock + '\n\n위 정보를 기억하고 이어지는 질문에 답하세요.' }] },
      { role: 'model', parts: [{ text: '네, 항차 정보 확인했습니다. 질문 주세요.' }] },
    ] : historyCompact.map(m => ({
      role: m.role,
      parts: [{ text: m.content }],
    }))),
    // 현재 질문
    { role: 'user', parts: [{ text: userContent }] },
  ];

  try {
    const res = await fetch(getActiveGeminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
        },
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      console.error('Gemini API error:', errTxt);
      return { ok: false, error: `API 오류 (${res.status}): ${errTxt.slice(0, 100)}` };
    }
    const data = await res.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!answer) return { ok: false, error: '답변이 비어있음' };
    return {
      ok: true,
      answer: answer.trim(),
      ragInfo: {
        filterDesc: ragResult.filterDesc,
        narrowed: ragResult.narrowed,
        candidateCount: candidates.length,
        sentCount: sentList.length,
      },
    };
  } catch (e) {
    console.error('Gemini fetch error:', e);
    return { ok: false, error: `네트워크 오류: ${e.message}` };
  }
}

// 질문이 자유 자연어인지 키워드 검색인지 판단
// V7.80: 음성 오인식 질문 복원 — AI는 답하지 않고 "교정된 질문 한 문장"만 출력 (질문 번역기).
//   복원된 문장은 로컬 파서(nlSearch)에 다시 넣어 데이터로 답함 — 환각 원천 차단.
export async function fixQuestionWithAI(rawText, timeoutMs = 4000) {
  const prompt = `다음은 항만 컨테이너 검수 현장에서 음성인식으로 받아 적은 질문이다. 음성 오인식을 교정해 의도된 질문을 한국어 한 문장으로만 출력하라. 설명·따옴표 금지.
현장 용어: 양하, 선적, 베이, 리퍼, 엠티, 풀, 위험물, 엑스레이, 갑판, 홀드, 컨테이너, 20피트, 40피트, 45피트, 온도, 실번호, 위치, 몇대, 남은거, 완료.
예시: "20번 베이 잇퍼 몇대야" → 20번 베이 리퍼 몇대야 / "양아 컨테이너 매수" → 양하 컨테이너 몇대 / "5번 배 갑반에 풀 며대" → 5번 베이 갑판에 풀 몇대

받아 적은 질문: "${rawText}"`;
  // V9.57(G11): 키 없으면 시도하지 않음 — 호출부는 null이면 로컬 파서로 폴백(기존 계약 유지).
  if (!getActiveGeminiKey()) { console.warn('[gemini] ' + NO_KEY_MSG + ' (음성 교정 생략)'); return null; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(getActiveGeminiUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 60 } }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const out = (j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
      .replace(/^["'「]|["'」]$/g, '').split('\n')[0].trim();
    return out && out.length >= 2 && out.length <= 60 ? out : null;
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

export function isFreeFormQuestion(text) {
  if (!text) return false;
  const t = text.trim();
  if (/^\d+$/.test(t)) return false;
  if (t.length < 4) return false;
  if (/\?|왜|어떻게|뭐|무엇|어디|언제|누가|얼마/.test(t)) return true;
  if (t.length >= 8) return true;
  return false;
}

// ─── M6.14: STOWAGE INSTRUCTION PDF 자동 분석 ──────────────────────────────
// PDF 파일을 application/pdf MIME으로 Gemini에 직접 전송
// 사진 변환 단계 없음 — Gemini가 PDF를 네이티브로 처리
// 다중 페이지/표/도식 모두 한 번에 처리

const STOWAGE_PROMPT = `이 PDF는 컨테이너 선박의 STOWAGE INSTRUCTION (적재/양하 답안지)입니다.
선박의 모든 베이 구조와 적재 현황이 그려져 있습니다.

이 PDF를 분석해서 다음 JSON 형식으로 응답하세요. JSON만 출력, 다른 설명 없음:

{
  "vesselName": "선박명 (PDF 헤더에서 추출, 예: XIN TAI PING)",
  "voyageNo": "항차번호 (예: 458W)",
  "pol": "POL 코드 (예: PTK 또는 KRPTK)",
  "date": "날짜 (YYYY-MM-DD)",
  "bays": [
    {
      "bayNo": 1,
      "bayLabel": "BAY 01 또는 BAY (04) 05",
      "isPair": false,
      "pairEvenNo": null,
      "isStandalone": true,
      "hasHold": true,
      "hasDeck": true,
      "deckTiers": [86, 84, 82],
      "holdTiers": [6, 4, 2],
      "rowMaxEven": 4,
      "rowMaxOdd": 3,
      "extraTier": null,
      "loadCounts": {"_20": 0, "_40": 0, "_45": 0},
      "loadSymbols": ["X", "G", "T"]
    }
  ],
  "totals": {"_20": 0, "_40": 0, "_45": 0}
}

베이 데이터 추출 규칙 (매우 중요):
1. bayNo: 표시된 홀수 베이 번호 (트윈이면 홀수)
2. bayLabel: PDF에 적힌 그대로 (BAY 13 또는 BAY (14) 15)
3. isPair: 짝꿍 짝수가 괄호로 표시되면 true
4. pairEvenNo: 짝꿍 짝수 번호 (단독이면 null)
5. isStandalone: 짝수 짝꿍이 없으면 true
6. hasHold: hold tier(02, 04, 06, 08, 10, 12, 14)가 그려져 있으면 true. 비어있으면 false
7. hasDeck: deck tier(80, 82, 84, 86, 88, 90, 92, 94, 96)가 그려져 있으면 true
8. deckTiers: 베이에 실제 표시된 deck tier만 (높→낮 순)
9. holdTiers: 베이에 실제 표시된 hold tier만 (높→낮 순). 데크 전용이면 []
10. **rowMaxEven**: 베이의 가장 큰 짝수 row 번호 (베이별 답안지에 보이는 그대로)
   - 예: row 표시가 "06 04 02 00 01 03 05" → rowMaxEven=6
   - 예: row 표시가 "04 02 00 01 03" → rowMaxEven=4
   - 예: row 표시가 "08 06 04 02 00 01 03 05 07" → rowMaxEven=8
11. **rowMaxOdd**: 베이의 가장 큰 홀수 row 번호 (베이별 답안지에 보이는 그대로)
   - 예: row 표시가 "06 04 02 00 01 03 05" → rowMaxOdd=5
   - 예: row 표시가 "04 02 00 01 03" → rowMaxOdd=3
   - 예: row 표시가 "08 06 04 02 00 01 03 05 07" → rowMaxOdd=7
12. extraTier: 80 또는 90이 별도 위치에 있으면 그 숫자, 없으면 null
13. loadCounts: 베이 라벨 옆 "0 / 26 / 0" 패턴 → {_20: 0, _40: 26, _45: 0}
14. loadSymbols: 베이 내부에 표시된 마크 종류 (중복 제외)

매우 중요: row 폭은 베이별로 다릅니다.
   - 선수(BOW) 쪽 좁은 베이(예: BAY 01, 03): row 폭 작음 (3-4개씩)
   - 중앙 베이: row 폭 큼 (7-9개씩)
   - 답안지에 그려진 그대로 베이별로 정확히 추출하세요. 다른 베이 값을 복사하지 마세요.

기타:
- 추론하지 말고 PDF에 그려진 그대로만 추출
- 베이가 PDF에 없으면 절대 만들어내지 말 것
- tier 숫자는 PDF에 적힌 그대로 정수 추출
- 데크와 hold 구분: tier >= 80 이면 deck, < 80 이면 hold`;

export async function ocrStowagePdf(file, geminiApiKey) {
  if (!geminiApiKey) throw new Error(NO_KEY_MSG);   // V9.57(G11): 설정 경로까지 안내
  if (!file) throw new Error('PDF 파일 없음');

  // PDF 파일을 base64로 변환 (사진 변환 없음 — 그대로 전송)
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const b64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // 파일 크기 체크 (Gemini inline_data 한도 ~20MB)
  const sizeMB = (file.size / 1024 / 1024).toFixed(2);
  if (file.size > 20 * 1024 * 1024) {
    throw new Error(`PDF 크기 초과: ${sizeMB}MB (한도 20MB)`);
  }

  // M6.14c (핫픽스): Pro → Flash (Pro 무료 할당량 50 RPD 즉시 소진 문제)
  //   Flash: 1500 RPD, 15 RPM — 검수원 15명이 공유해도 충분
  //   PDF 베이 격자 분석은 Flash로도 정확도 확보 가능 (Flash는 PDF 네이티브 지원)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: STOWAGE_PROMPT },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    // M6.14c: 주요 오류는 검수원이 이해하기 쉬운 메시지로 변환
    if (response.status === 429) {
      throw new Error(
        'Gemini 무료 할당량 초과 (분당 15회 또는 일일 1500회).\n' +
        '잠시 후(1~5분) 다시 시도하거나, 내일 다시 시도하세요.\n' +
        '자주 발생하면 관리자에게 빌링 활성화 요청하세요.'
      );
    }
    if (response.status === 400) {
      throw new Error(
        'PDF 형식 오류 또는 너무 큼.\n' +
        '다른 STOWAGE PDF로 재시도하거나 PDF 크기 확인 (한도 20MB).'
      );
    }
    if (response.status >= 500) {
      throw new Error(
        'Gemini 서버 일시 오류. 1~2분 후 재시도하세요.'
      );
    }
    throw new Error(`Gemini API 오류 ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini 응답 비어있음');

  let parsed;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Gemini 응답 JSON 파싱 실패: ${e.message}\n응답: ${text.slice(0, 500)}`);
  }

  return parsed;
}

/**
 * M6.14: Gemini 추출 결과를 shipBayDict_v2 entry 양식으로 변환
 * NBTD/MCSC 양식과 완전 호환 — addToUserBayDict + fbSaveShipBayDict로 저장 가능
 *
 * @param {object} stowageData - ocrStowagePdf 결과
 * @param {string} fileName - 원본 PDF 파일명
 * @param {object} extra - { code, callsign, imo } 사용자 보완 정보
 * @returns {object} entry
 */
export function stowageToBayDictEntry(stowageData, fileName, extra = {}) {
  const bays = Array.isArray(stowageData?.bays) ? stowageData.bays : [];
  const sortedBays = [...bays].sort((a, b) => (a.bayNo || 0) - (b.bayNo || 0));

  const bayList = [];
  const baysSummary = [];
  const pairs = [];
  const standalone = [];
  let section = 1;
  let prevDeckSig = '';
  let prevHoldSig = '';
  let prevExtra = null;

  sortedBays.forEach((b) => {
    const deckTiers = Array.isArray(b.deckTiers) ? b.deckTiers : [];
    const holdTiers = Array.isArray(b.holdTiers) ? b.holdTiers : [];
    const extraTier = b.extraTier || null;
    const hasHold = b.hasHold === true && holdTiers.length > 0;
    const hasDeck = b.hasDeck !== false && deckTiers.length > 0;
    const isStandalone = b.isStandalone === true || !b.isPair;
    // M6.20: 베이별 row 폭 — Gemini가 추출, 없으면 default
    const rowMaxEvenLocal = Number.isFinite(b.rowMaxEven) ? b.rowMaxEven : null;
    const rowMaxOddLocal = Number.isFinite(b.rowMaxOdd) ? b.rowMaxOdd : null;

    // 섹션 자동 분류 (같은 deck/hold/extraTier 패턴이 묶임)
    const deckSig = deckTiers.join(',');
    const holdSig = holdTiers.join(',');
    if (prevDeckSig !== '' && (deckSig !== prevDeckSig || holdSig !== prevHoldSig || extraTier !== prevExtra)) {
      section++;
    }
    prevDeckSig = deckSig;
    prevHoldSig = holdSig;
    prevExtra = extraTier;

    const bayNoStr = String(b.bayNo).padStart(2, '0');

    if (b.isPair && b.pairEvenNo) {
      const evenStr = String(b.pairEvenNo).padStart(2, '0');
      bayList.push(evenStr);
      baysSummary.push({
        bayNo: evenStr,
        section,
        hasHold,
        hasDeck,
        isStandalone: false,
        // M6.19: PrintableCargoPlan(deckTiers/holdTiers) + PrintableBayDetail(deckTiersLocal/holdTiersLocal) 양쪽 호환
        deckTiers,
        holdTiers,
        deckTiersLocal: deckTiers,
        holdTiersLocal: holdTiers,
        // M6.20: 베이별 row 폭
        ...(rowMaxEvenLocal != null ? { rowMaxEvenLocal, rowMaxEven: rowMaxEvenLocal } : {}),
        ...(rowMaxOddLocal != null ? { rowMaxOddLocal, rowMaxOdd: rowMaxOddLocal } : {}),
        ...(extraTier ? { extraTier } : {}),
      });
      pairs.push([b.pairEvenNo, b.bayNo]);
    } else if (isStandalone) {
      standalone.push(b.bayNo);
    }

    bayList.push(bayNoStr);
    baysSummary.push({
      bayNo: bayNoStr,
      section,
      hasHold,
      hasDeck,
      isStandalone,
      // M6.19: 양쪽 호환
      deckTiers,
      holdTiers,
      deckTiersLocal: deckTiers,
      holdTiersLocal: holdTiers,
      // M6.20: 베이별 row 폭
      ...(rowMaxEvenLocal != null ? { rowMaxEvenLocal, rowMaxEven: rowMaxEvenLocal } : {}),
      ...(rowMaxOddLocal != null ? { rowMaxOddLocal, rowMaxOdd: rowMaxOddLocal } : {}),
      ...(extraTier ? { extraTier } : {}),
    });
  });

  // 선박 전역 max
  const allDeck = baysSummary.flatMap(b => b.deckTiers);
  const allHold = baysSummary.flatMap(b => b.holdTiers);
  const allExtra = baysSummary.map(b => b.extraTier).filter(Boolean);
  const deckTiersMax = [...new Set(allDeck)].sort((a, b) => b - a);
  const holdTiersMax = [...new Set(allHold)].sort((a, b) => b - a);
  const extraDeckTier = allExtra.length > 0 ? Math.max(...allExtra) : null;

  const vesselName = stowageData?.vesselName || '';
  const code = (extra.code || vesselName.replace(/\s+/g, '').slice(0, 4)).toUpperCase();
  const callsign = extra.callsign || '';
  const imo = extra.imo || '';

  return {
    code,
    name: vesselName,
    callsign,
    imo,
    caspVersion: '',
    sourceCreatedDate: stowageData?.date?.replace(/-/g, '') || '',
    bayDef: {
      sourceFile: fileName,
      parsedAt: new Date().toISOString(),
      parserVersion: 'M6.14-stowage-pdf-ai',
      methodology: 'STOWAGE_INSTRUCTION_PDF_AI_GEMINI',
      recordCount: bayList.length,
      sectionCount: section,
      blockSize: 0,
      bayList,
      baysSummary,
      rowMaxEven: 8,
      rowMaxOdd: 7,
      deckTiers: deckTiersMax,
      holdTiers: holdTiersMax,
      ...(extraDeckTier ? { extraDeckTier } : {}),
      verified: false,         // 사용자 검토 후 true로 변경
      grade: 'ai-extracted',
      _stowageMeta: {
        voyageNo: stowageData?.voyageNo || '',
        pol: stowageData?.pol || '',
        totals: stowageData?.totals || null,
        pairs,
        standalone,
      },
    },
  };
}

// ── V9.18-01(2026-07-27): 선박 정보 조회 — Google 검색 그라운딩으로 실제 제원을 가져온다.
//   V9.18 초판은 이름 풀이만 했는데 사용자 확정: "선종·IMO·국적·길이·너비·건조년도·선사·항로 같은
//   실제 정보를 출처와 함께" (KMTC OSAKA 예시 제시). Gemini google_search 도구로 웹을 찾아 답하고,
//   groundingMetadata의 출처 링크를 함께 저장한다. 그라운딩 미지원 키면 검색 없이 생성(정확도 주의 표기).
export async function askShipIntro({ name = '', callsign = '', imo = '', carrier = '' }) {
  const shipName = String(name || '').trim();
  if (!shipName) return { ok: false, error: '선박명이 없습니다' };
  if (!getActiveGeminiKey()) return { ok: false, error: NO_KEY_MSG };   // V9.57(G11)
  // V9.18-02: 앱 내부 약자(DXQD 등)로 검색하면 "확인되지 않았습니다"가 나온다(사용자 보고).
  //   IMO·콜사인이 있으면 그것을 우선 검색 키로 쓰고, 이름이 약자일 수 있음을 명시한다.
  const looksCode = /^[A-Z0-9]{2,5}$/.test(shipName);
  const prompt =
    `다음 선박의 실제 정보를 웹에서 찾아 정리하라: 선박명 "${shipName}"` +
    (imo ? `, IMO ${imo}` : '') + (callsign ? `, 콜사인 ${callsign}` : '') +
    (carrier ? `, 선사 코드 ${carrier}` : '') +
    (looksCode ? `.\n주의: "${shipName}"은 사내 약자일 수 있다. ${imo ? `IMO ${imo}` : ''}${imo && callsign ? '와 ' : ''}${callsign ? `콜사인 ${callsign}` : ''}${(imo || callsign) ? '으로 먼저 실제 선박명을 확정한 뒤 정리하라.' : '실제 선박명을 찾지 못하면 첫 줄에 "선박 풀네임이 필요합니다"라고 써라.'}` : '') + `.

한국어로 아래 형식으로 답하라 (마크다운 굵게 금지, 각 줄은 "· 항목: 값"):
첫 줄: 한 문장 소개 (예: "KMTC OSAKA는 고려해운 소속의 파나마 국적 컨테이너선입니다.")

[선박 제원]
· 선박 종류: …
· IMO 번호: …
· 국적(선적국): …
· 길이 × 너비: …
· 건조년도: …
· 총톤수(GT) 또는 TEU: …

[운항 정보]
· 운항 선사: …
· 주요 항로/기항지: …

[이름 이야기]
· 선박명의 뜻·유래를 1~3문장으로. 어느 언어의 무슨 뜻인지(한자 이름이면 한자 풀이), 사람 이름·동물 이름·지명이면 그 배경, 선사의 명명 규칙(같은 계열 자매선 이름 패턴)이 있으면 그것도. 확인되는 재미있는 일화가 있으면 덧붙인다.

규칙: 제원·운항 정보는 검색으로 확인된 값만 적고, 확인 안 되는 항목은 "확인 안 됨"이라고 쓴다. 숫자를 추측하지 마라. 이름 이야기의 언어적 풀이는 지어내지 말고 사전적 사실만.`;

  const call = async (useSearch) => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1100 },
    };
    if (useSearch) body.tools = [{ google_search: {} }];
    const res = await fetch(getActiveGeminiUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return res;
  };

  try {
    let res = await call(true);
    let grounded = true;
    if (!res.ok && (res.status === 400 || res.status === 403)) {
      // 키/모델이 검색 도구를 지원하지 않는 경우 — 검색 없이 폴백
      res = await call(false);
      grounded = false;
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const cand = data?.candidates?.[0];
    let text = cand?.content?.parts?.map(p => p.text).filter(Boolean).join('').trim();
    if (!text) return { ok: false, error: '빈 응답' };
    if (!grounded) text += '\n\n⚠ 웹 검색 없이 생성됨 — 수치는 부정확할 수 있습니다.';
    // 출처 링크 (grounding)
    const sources = [];
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    for (const ch of chunks) {
      const uri = ch?.web?.uri; const title = ch?.web?.title || '';
      if (uri && !sources.some(x => x.uri === uri)) sources.push({ uri, title: String(title).slice(0, 60) });
      if (sources.length >= 5) break;
    }
    return { ok: true, text, sources, grounded };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
