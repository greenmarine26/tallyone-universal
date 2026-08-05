// V37 음성 함수 100% 이식 — 검증된 한 글자씩 한국어 발음
// 숫자: 공/일/이/삼/사/오/육/칠/팔/구
// 알파벳: 에이/비/씨/디/...
// M3.1: speak() 시 좌표 패턴(16-01-86)을 자동으로 한국어로 변환

import { spellPosString } from './utils.js';

// V7.99-15: 가장 자연스러운 한국어 TTS 목소리를 골라 캐시한다.
//   기존엔 u.lang='ko-KR'만 줘서 브라우저가 멋대로 첫 번째(보통 가장 기계적인)
//   목소리를 썼다 — 딱딱함의 주원인. getVoices()에서 향상된/네트워크 음성을 우선 선택.
//   getVoices는 비동기 로드라 onvoiceschanged로 갱신(앱 시작 시 1회 준비).
let _koVoice = null;        // 선택된 한국어 목소리 (없으면 null = 브라우저 기본)
let _koVoiceReady = false;
function pickKoreanVoice() {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const all = window.speechSynthesis.getVoices() || [];
    const ko = all.filter(v => v.lang && v.lang.toLowerCase().startsWith('ko'));
    if (!ko.length) return null;
    // 자연스러움 우선순위: 향상/네트워크 음성 → Google → 그 외 ko → 첫 번째
    const score = (v) => {
      const n = (v.name || '').toLowerCase();
      let s = 0;
      if (/enhanced|premium|natural|neural|wavenet|네트워크|향상/.test(n)) s += 4;
      if (/google/.test(n)) s += 3;            // 안드로이드 Google 한국어가 대체로 부드러움
      if (/yuna|nara|sora|시리|유나/.test(n)) s += 2; // iOS 한국어 음성명
      if (v.localService === false) s += 1;    // 네트워크 음성(대개 더 자연스러움)
      return s;
    };
    return ko.slice().sort((a, b) => score(b) - score(a))[0] || ko[0];
  } catch { return null; }
}
function ensureKoVoice() {
  if (_koVoiceReady) return _koVoice;
  _koVoice = pickKoreanVoice();
  if (_koVoice) _koVoiceReady = true;          // 잡히면 확정, 아니면 다음 호출에 재시도
  return _koVoice;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // 목소리 목록은 비동기로 채워짐 — 준비되면 한 번 더 선택
  try {
    window.speechSynthesis.onvoiceschanged = () => { _koVoiceReady = false; ensureKoVoice(); };
    ensureKoVoice();
  } catch {}
}

const NUM_KO = ['공', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const ALPHA_KO = {
  A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지',
  H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠',
  N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티',
  U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '지',
};

// 한 글자씩 한국어로 풀어 읽기 (공백으로 구분)
export function spellKo(text) {
  if (!text) return '';
  return String(text).toUpperCase().split('').map(ch => {
    if (/\d/.test(ch)) return NUM_KO[parseInt(ch)];
    if (ALPHA_KO[ch]) return ALPHA_KO[ch];
    return ch;
  }).join(' ');
}

// 음성 인식용: 한국어 숫자 → 아라비아
const KOR_DIGITS_RECOGNIZE = [
  ['영','0'],['공','0'],['일','1'],['이','2'],['삼','3'],['사','4'],
  ['오','5'],['육','6'],['칠','7'],['팔','8'],['구','9'],
  ['하나','1'],['둘','2'],['셋','3'],['넷','4'],['다섯','5'],
  ['여섯','6'],['일곱','7'],['여덟','8'],['아홉','9'],['열','']
];

export function parseSpokenDigits(text) {
  if (!text) return '';
  let s = text.toLowerCase();
  const ENG = [['zero','0'],['oh','0'],['one','1'],['two','2'],['three','3'],
               ['four','4'],['five','5'],['six','6'],['seven','7'],['eight','8'],['nine','9']];
  for (const [k, v] of ENG) s = s.split(k).join(v);
  s = s.replace(/\s+/g, '');
  const sorted = [...KOR_DIGITS_RECOGNIZE].sort((a,b) => b[0].length - a[0].length);
  for (const [k, v] of sorted) s = s.split(k).join(v);
  const matches = s.match(/\d+/g);
  if (!matches) return '';
  const allDigits = matches.join('');
  if (allDigits.length >= 4) return allDigits.slice(-4);
  return allDigits;
}

// 일반 텍스트 음성 (디바운스 X — V37처럼 즉시)
// M3.1: 좌표 패턴(16-01-86) 발견 시 "십육번 베이 공일에 팔육"으로 자동 변환
// M5.20: priority='high'면 현재 'high' 음성을 cancel 못 함 (완료 음성 보호용)
//   - speakDone은 priority='high'로 호출 → 진단/검색 음성이 와도 끊기지 않음
//   - 일반 speak (opts 없이)는 기존 동작 그대로 (새 음성이 이전 cancel)
let currentSpeakPriority = null;  // 현재 출력 중인 음성의 priority

export function speak(text, opts = {}) {
  if (!text) return;
  try {
    const isHigh = opts.priority === 'high';
    if (window.speechSynthesis.speaking && !opts.append) {
      // 현재 'high' 음성이 출력 중이고 새 음성은 'high'가 아니면 무시 (높은 우선순위 보호)
      if (currentSpeakPriority === 'high' && !isHigh) {
        return;
      }
      window.speechSynthesis.cancel();
    }
    currentSpeakPriority = isHigh ? 'high' : null;
    // M3.1: 좌표 자동 한국어화 (AI 답변 등 자유 텍스트에서 좌표를 자연스럽게 읽기)
    let spoken = spellPosString(text);
    // V8.13: 붙어 있는 4자리 이상 연속 숫자(컨번호 끝자리)는 한 자 한 자 또박또박 읽는다.
    //   "1250"→"일 이 오 공". 수량(20대)·시각(17시)·온도(18도)·베이(38번)는 1~3자리라 보존.
    //   좌표(spellPosString)가 먼저 처리된 뒤라 좌표 숫자와 충돌 없음.
    spoken = spoken.replace(/\d{4,}/g, m => m.split('').map(d => NUM_KO[parseInt(d)]).join(' '));
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = 'ko-KR';
    // V7.99-15: 골라둔 자연스러운 한국어 목소리 적용 (없으면 브라우저 기본 — 회귀 없음)
    const kov = ensureKoVoice();
    if (kov) u.voice = kov;
    // V7.99-15: 대화 모드 — 검수 호출은 빠르게(기본 1.3), 말 거는 대화는 느긋·부드럽게.
    if (opts.conversational) {
      u.rate = opts.rate || 1.0;
      u.pitch = opts.pitch || 1.08;   // 살짝 높여 덜 무뚝뚝하게
    } else {
      u.rate = opts.rate || 1.3;
      u.pitch = opts.pitch || 1.0;
    }
    u.volume = opts.volume || 1.0;
    u.onend = () => { currentSpeakPriority = null; };
    u.onerror = () => { currentSpeakPriority = null; };
    window.speechSynthesis.speak(u);
  } catch (e) { currentSpeakPriority = null; }
}

// 컨테이너 음성 — V37 speakContainer 100% 이식
// 컨번호, 실번호, 위치, X-RAY 모두 안내
export function speakContainer(c, opts = {}) {
  if (!c) return;
  try {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const cn = c.cn || '';
    const last4 = c.l4 || cn.slice(-4);
    const cnSpoken = spellKo(last4);

    const parts = [];

    // X-RAY 우선 안내
    if (opts.xray) {
      parts.push('엑스레이 대상');
    }

    // 컨번호 끝 4자리
    parts.push(cnSpoken);

    // 위치 (M3.1: 베이는 정수, row/tier는 자릿수별 발음)
    if (c.bay) {
      const bayN = parseInt(c.bay, 10);
      if (!isNaN(bayN)) parts.push(`${bayN}번 베이`);
      if (c.row) parts.push(spellKo(c.row) + '에');
      if (c.tier) parts.push(spellKo(c.tier));
    }

    // 실번호 (있으면)
    if (c.sl && c.sl.trim()) {
      parts.push(`실번호 ${spellKo(c.sl.trim())}`);
    } else if (c.eseal && String(c.eseal).trim().length >= 4) {
      // V9.20-02: 엠티실도 읽어준다 (엠티에 실 붙는 선박 — 사용자 요청)
      parts.push(`엠티실 ${spellKo(String(c.eseal).trim())}`);
    }

    // 특수 화물
    if (c.dg) parts.push(`디지`);
    if (c.mkcon) parts.push('제작 컨테이너');   // V9.23: 컨 자체가 상품(빈 컨)
    if (c.rf && c.rfdry) parts.push('리퍼드라이 넌플러그');   // V9.20-03
    else if (c.rf && c.tmp) parts.push(`리퍼 ${c.tmp}도`);
    else if (c.rf && !c.mkcon) parts.push('리퍼');
    if (c.fr) parts.push('에프알');
    if (c.ot) parts.push('오티');
    if (c.tk) parts.push('탱크');

    // POD (선적 모드일 때 유용)
    if (opts.suffix) parts.push(opts.suffix);

    const text = parts.join(', ');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    const kov = ensureKoVoice();   // V7.99-15: 자연스러운 한국어 목소리 적용
    if (kov) u.voice = kov;
    u.rate = opts.rate || 1.2;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

// 검수 완료 — 짧고 빠르게
// M5.20: priority='high'로 보호 — 진단/검색 등 다른 음성이 와도 끊기지 않음
export function speakDone(c) {
  if (!c) return;
  const last4 = c.l4 || c.cn?.slice(-4) || '';
  speak(`${spellKo(last4)} 완료`, { rate: 1.5, priority: 'high' });
}

// 오류 음성
export function speakError(text) {
  speak(text, { rate: 1.2, pitch: 0.9 });
}

export function stopSpeak() {
  try { window.speechSynthesis.cancel(); } catch {}
}

// 음성인식(STT) 항만 용어 교정 — 크롬 STT가 도메인 단어를 일반어로 오인식하는 것 보정 (V7.56)
//   예: 양하→양아/양화/향하, 선적→성적, 베이→배이. 보수적 치환만 (일반 대화어 오염 금지).
const SPEECH_FIX_MAP = [
  [/양\s*아|양화|향하|얀하/g, '양하'],
  [/성적/g, '선적'],
  [/(\d)\s*번\s*배(?![이가])/g, '$1번 베이'],
  [/배이|배\s*이|베\s*이|뱅이/g, '베이'],
  [/니퍼|리포(?!트)|리퍼드/g, '리퍼'],
  [/엑스래이|엑스 래이/g, '엑스레이'],
  [/콘테이너|컨태이너|컨테이나/g, '컨테이너'],
  [/댁콘|대크콘|덱콘|데크\s+콘/g, '데크콘'],
  [/코끼리\s+콘/g, '코끼리콘'],
  [/홀드\s+콘|홀두콘|올드콘/g, '홀드콘'],
  [/홀두/g, '홀드'],
  [/갑반/g, '갑판'],
  [/앰티|엠\s+티/g, '엠티'],
];
const SPEECH_DOMAIN_WORDS = ['양하','선적','베이','리퍼','엑스레이','위험물','엠티','풀','컨테이너','갑판','홀드','데크콘','코끼리콘','홀드콘','피트','몇','위치','어디','남','모자','전체','완료'];
export function fixSpeechDomain(text) {
  let t = String(text || '');
  for (const [re, to] of SPEECH_FIX_MAP) t = t.replace(re, to);
  return t;
}
// STT 후보들 중 항만 용어가 가장 많이 든 후보 선택 (교정 후 반환)
export function pickSpeechAlternative(alts) {
  const list = (alts || []).filter(Boolean);
  if (!list.length) return '';
  let best = fixSpeechDomain(list[0]), bestScore = -1;
  for (const a of list) {
    const fixed = fixSpeechDomain(a);
    let score = 0;
    for (const w of SPEECH_DOMAIN_WORDS) if (fixed.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = fixed; }
  }
  return best;
}
