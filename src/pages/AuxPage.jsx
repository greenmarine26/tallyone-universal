// TallyOne 1.0: 보조기능 허브(AuxPage) — 사용 매뉴얼·검수 용어집·영어 회화집·맛집 수첩·항차 건강 점검·
//   AI 검색 키 설정·오늘의 브리핑 다시 보기·장비 번호 안내를 카드 그리드 한 화면에 모은 페이지 (판2 팀M 신설).
//   계약 — App이 <AuxPage inspector isChief isOwner voyages collectorHb />로 렌더. 모든 prop 옵셔널 방어.
//   화면 이동은 window.location.hash 직접 변경(#/food, #/health, #/). 라우트 등록(#/aux)은 팀K 소관.
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, BookOpen, Languages, MessageCircle, Dices, Activity,
  Key, Sun, Wrench, Search, X, RefreshCw, NotebookPen } from 'lucide-react';   // TallyOne 1.1: 클로드 메모 아이콘 추가
import HelpModal from '../components/HelpModal.jsx';
import ContainerPhrasebook from '../components/ContainerPhrasebook.jsx';
import GeminiKeyModal from '../components/GeminiKeyModal.jsx';
import ClaudeMemoModal from '../components/ClaudeMemoModal.jsx';   // TallyOne 1.1: 클로드에게 메모 모달
import { HELP_DATA, HELP_COURSE } from '../data/helpData.js';
import { buildGreetingMessage, fetchPyeongtaekWeather } from '../greeting.js';
import { heartbeatState, healthSummary } from '../health.js';
import { equipNumbersForPier, getEquipNumber } from '../utils.js';

// 테일윈드 정적 클래스 (동적 생성 금지 — purge 회피, HelpModal ACCENT 패턴과 동일)
const ACCENT = {
  amber:   { card: 'bg-gradient-to-br from-amber-900/40 to-slate-900 border-amber-700/40 hover:border-amber-500',     icon: 'text-amber-300',   title: 'text-amber-100' },
  emerald: { card: 'bg-gradient-to-br from-emerald-900/40 to-slate-900 border-emerald-700/40 hover:border-emerald-500', icon: 'text-emerald-300', title: 'text-emerald-100' },
  sky:     { card: 'bg-gradient-to-br from-sky-900/40 to-slate-900 border-sky-700/40 hover:border-sky-500',           icon: 'text-sky-300',     title: 'text-sky-100' },
  violet:  { card: 'bg-gradient-to-br from-violet-900/40 to-slate-900 border-violet-700/40 hover:border-violet-500',   icon: 'text-violet-300',  title: 'text-violet-100' },
  teal:    { card: 'bg-gradient-to-br from-teal-900/40 to-slate-900 border-teal-700/40 hover:border-teal-500',         icon: 'text-teal-300',    title: 'text-teal-100' },
  rose:    { card: 'bg-gradient-to-br from-rose-900/40 to-slate-900 border-rose-700/40 hover:border-rose-500',         icon: 'text-rose-300',    title: 'text-rose-100' },
  cyan:    { card: 'bg-gradient-to-br from-cyan-900/40 to-slate-900 border-cyan-700/40 hover:border-cyan-500',         icon: 'text-cyan-300',    title: 'text-cyan-100' },
  orange:  { card: 'bg-gradient-to-br from-orange-900/40 to-slate-900 border-orange-700/40 hover:border-orange-500',   icon: 'text-orange-300',  title: 'text-orange-100' },
  // TallyOne 1.1: 클로드에게 메모 카드용 (정적 문자열 유지 — purge 회피 규칙 동일)
  violetDeep: { card: 'bg-gradient-to-br from-violet-950/60 to-slate-900 border-violet-700/40 hover:border-violet-500', icon: 'text-violet-300', title: 'text-violet-100' },
};

// 시간대별 인사 한 줄 — 상단을 따뜻하게 (greeting.js의 시간대 구분과 같은 기준)
function greetLine(name) {
  const who = name ? `${name} 검수사님` : '검수사님';
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return `${who}, 좋은 아침입니다 ☀️`;
  if (h >= 9 && h < 12) return `${who}, 오전 작업 화이팅입니다 💪`;
  if (h >= 12 && h < 14) return `${who}, 점심은 드셨나요 🍱`;
  if (h >= 14 && h < 18) return `${who}, 오후도 안전하게 부탁드립니다 🌤`;
  if (h >= 18 && h < 22) return `${who}, 오늘도 수고 많으십니다 🌆`;
  return `${who}, 야간 작업은 안전이 최우선입니다 🌙`;
}

// 카드 한 장 — 터치 타깃 충분히(min-h 104px, 전체가 버튼)
function AuxCard({ icon: Icon, accent, title, sub, badge, onClick }) {
  const a = ACCENT[accent] || ACCENT.sky;
  return (
    <button onClick={onClick}
      className={`text-left border-2 rounded-2xl p-3.5 min-h-[104px] flex flex-col transition active:scale-95 ${a.card}`}>
      <div className="flex items-start justify-between">
        <Icon className={`w-7 h-7 mb-2 ${a.icon}`} />
        {badge || null}
      </div>
      <div className={`text-sm font-black leading-snug ${a.title}`}>{title}</div>
      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sub}</div>
    </button>
  );
}

// 서브뷰 공통 헤더 (뒤로 = 카드 그리드로 복귀)
function SubHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <button onClick={onBack} className="p-2.5 -ml-2 hover:bg-slate-800 rounded-lg" aria-label="뒤로">
        <ChevronLeft className="w-5 h-5 text-slate-300" />
      </button>
      <div className="text-base font-black text-slate-100">{title}</div>
    </div>
  );
}

// ── 검수 용어집 전용 뷰 — HelpModal 3단계 깊이의 terms를 1급으로 승격 ────────
function TermsView({ onBack }) {
  const [q, setQ] = useState('');
  const terms = HELP_DATA?.terms || [];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return terms;
    return terms.filter(t =>
      String(t.term || '').toLowerCase().includes(s) || String(t.desc || '').toLowerCase().includes(s));
  }, [q, terms]);
  return (
    <div>
      <SubHeader title="검수 용어집" onBack={onBack} />
      <div className="relative mb-2.5">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="용어 검색 (예. POL, 트윈)"
          className="w-full h-11 pl-9 pr-9 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 focus:outline-none rounded-xl text-sm text-slate-100 placeholder-slate-500" />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400" aria-label="지우기">✕</button>
        )}
      </div>
      <div className="space-y-1.5">
        {list.map((t, i) => (
          <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2.5 flex gap-3">
            <div className="text-sm font-black text-emerald-300 mono shrink-0 min-w-[5.5rem]">{t.term}</div>
            <div className="text-xs sm:text-sm text-slate-300 leading-relaxed">{t.desc}</div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-10">검색 결과가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

// ── 장비 번호 안내 뷰 — Header의 부두별 호기 정보(utils.equipNumbersForPier)를 참고 카드로 ──
function EquipView({ onBack }) {
  const mine = getEquipNumber();   // localStorage — 실패 시 '' (utils 내부에서 방어)
  const piers = [
    { code: 'PCTC', label: 'PCTC (동부두 6~9번선석)', note: '갠트리 4대 운영' },
    { code: 'PNCT', label: 'PNCT (동부두 13~16번선석)', note: '갠트리 5대 운영 — 여객석 RORO 작업으로 1대 더' },
  ];
  return (
    <div>
      <SubHeader title="장비 번호 안내" onBack={onBack} />
      <div className="space-y-2.5">
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-orange-300 shrink-0" />
          <span className="text-xs text-slate-300">
            내가 저장한 호기 — {mine
              ? <b className="text-orange-200">{mine}</b>
              : <span className="text-slate-500">아직 없음 (상단 메뉴에서 선택하면 여기 표시됩니다)</span>}
          </span>
        </div>
        {piers.map(p => (
          <div key={p.code} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-sm font-black text-slate-100">{p.label}</div>
            <div className="text-[11px] text-slate-500 mb-2">{p.note}</div>
            <div className="flex flex-wrap gap-1.5">
              {equipNumbersForPier(p.code).map(n => (
                <span key={n} className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-orange-200 mono">{n}</span>
              ))}
            </div>
          </div>
        ))}
        <div className="text-[10px] text-slate-600 leading-relaxed px-1">
          부두를 모르면 최대 기준(1~5호기)으로 봅니다. 작업 보고·워킹 리포트의 호기 선택과 같은 목록입니다.
        </div>
      </div>
    </div>
  );
}

// ── 오늘의 인사·날씨 브리핑 모달 — greeting.js 재사용, 하루 1회 자동 인사와 무관하게 수동 재열람 ──
function BriefingModal({ inspector, onClose }) {
  const [state, setState] = useState({ loading: true, msg: null, weatherOk: false });
  const load = async () => {
    setState({ loading: true, msg: null, weatherOk: false });
    let weather = null;
    try {
      weather = await fetchPyeongtaekWeather();   // 실패 시 null 반환 (throw 안 함)
    } catch (e) {
      weather = null;
    }
    const msg = buildGreetingMessage(inspector || '', weather);
    setState({ loading: false, msg, weatherOk: !!weather });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const { loading, msg, weatherOk } = state;
  return (
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-sky-700/60 rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-black text-sky-200 flex items-center gap-2"><Sun className="w-5 h-5 text-amber-300" />오늘의 브리핑</div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg" aria-label="닫기">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        {loading ? (
          <div className="text-center text-xs text-slate-500 py-8">평택항 날씨를 조회하는 중...</div>
        ) : (
          <>
            <div className="space-y-1">
              {(msg?.lines || []).map((l, i) => (
                <div key={i} className={`leading-relaxed ${i === 0 ? 'text-base font-bold text-slate-100' : 'text-sm text-slate-200'}`}>{l}</div>
              ))}
            </div>
            {!weatherOk && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg px-3 py-2 text-[11px] text-amber-200 leading-relaxed">
                ⚠ 날씨 조회에 실패했습니다 — 네트워크 확인 후 아래 [다시 조회]를 눌러 주세요.
              </div>
            )}
            {weatherOk && (msg?.workForecast || []).length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                <div className="text-[10px] font-black text-sky-300/80 mb-1">근무 시간대 예보</div>
                {msg.workForecast.map((l, i) => (
                  <div key={i} className="text-xs text-slate-200 mono leading-relaxed">{l}</div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-slate-600">하루 1회 자동 인사와 별개로 언제든 다시 볼 수 있어요.</div>
            <div className="flex gap-2">
              <button onClick={load} className="flex-1 h-11 rounded-lg bg-sky-800 hover:bg-sky-700 text-white text-sm font-bold flex items-center justify-center gap-1.5">
                <RefreshCw className="w-4 h-4" />다시 조회
              </button>
              <button onClick={onClose} className="flex-1 h-11 rounded-lg bg-slate-800 text-slate-300 text-sm font-bold">닫기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuxPage({ inspector, isChief = false, isOwner = false, voyages, collectorHb = null }) {
  const [view, setView] = useState('grid');        // 'grid' | 'terms' | 'equip'
  const [helpOpen, setHelpOpen] = useState(false);
  const [phraseOpen, setPhraseOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);   // TallyOne 1.1: 클로드에게 메모 모달

  // 수집기 하트비트 상태 — 30초마다 경과 재계산 (HomePage와 같은 주기)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const hb = heartbeatState(collectorHb, now);
  const issueCount = useMemo(() => healthSummary(voyages).issueCount, [voyages]);

  const go = (hash) => { try { window.location.hash = hash; } catch (e) { /* SSR·테스트 환경 방어 */ } };

  // 보조기능은 전원 공개 — isChief/isOwner는 인사 옆 역할 표시에만 사용 (권한 게이트 없음)
  const roleTag = isOwner ? '소유자' : (isChief ? '수석' : '');

  const hbBadge = hb.state === 'ok'
    ? <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700/50 text-emerald-300 text-[10px] font-bold shrink-0">수집기 정상</span>
    : hb.state === 'down'
      ? <span className="px-1.5 py-0.5 rounded bg-red-950 border border-red-700/60 text-red-300 text-[10px] font-bold shrink-0">수집기 끊김</span>
      : <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-500 text-[10px] font-bold shrink-0">기록 없음</span>;

  return (
    <div className="max-w-3xl mx-auto px-3 py-3 space-y-3">
      {/* 상단 — 홈 복귀 + 타이틀 */}
      <div className="flex items-center justify-between">
        <button onClick={() => go('#/')} className="flex items-center gap-1 py-2.5 pr-3 text-sm text-slate-400 hover:text-sky-300">
          <ChevronLeft className="w-4 h-4" />홈
        </button>
        <div className="font-black text-slate-100">🧰 보조기능</div>
        <div className="w-12" />
      </div>

      {/* 인사 한 줄 */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-3 flex items-center gap-2">
        <span className="text-sm text-slate-200 leading-relaxed flex-1">{greetLine(inspector)}</span>
        {roleTag && <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700/50 text-amber-300 text-[10px] font-bold shrink-0">{roleTag}</span>}
      </div>

      {view === 'terms' ? (
        <TermsView onBack={() => setView('grid')} />
      ) : view === 'equip' ? (
        <EquipView onBack={() => setView('grid')} />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <AuxCard icon={BookOpen} accent="amber" title="사용 매뉴얼"
            sub={`하루 작업 순서 ${(HELP_COURSE || []).length}단계 + 기능 사전`}
            onClick={() => setHelpOpen(true)} />
          <AuxCard icon={Search} accent="emerald" title="검수 용어집"
            sub={`현장 용어 ${(HELP_DATA?.terms || []).length}개 풀이 · 검색`}
            onClick={() => setView('terms')} />
          <AuxCard icon={Languages} accent="sky" title="영어 회화집"
            sub="외국 선원 응대 표현 · 음성 재생"
            onClick={() => setPhraseOpen(true)} />
          <AuxCard icon={Dices} accent="violet" title="평택항 맛집 수첩"
            sub="주변 식당 · 별점 · 🎰 뭐 먹지 돌림판"
            onClick={() => go('#/food')} />
          <AuxCard icon={Activity} accent="teal" title="항차 건강 점검"
            sub={issueCount ? `⚠ 검증 필요 항차 ${issueCount}건` : '수집기·항차 자료 이상 점검'}
            badge={hbBadge}
            onClick={() => go('#/health')} />
          <AuxCard icon={Key} accent="rose" title="AI 검색 키 설정"
            sub="Gemini 키 입력 · 테스트"
            onClick={() => setKeyOpen(true)} />
          <AuxCard icon={Sun} accent="cyan" title="오늘의 브리핑"
            sub="인사 · 평택항 날씨 다시 보기"
            onClick={() => setBriefOpen(true)} />
          <AuxCard icon={Wrench} accent="orange" title="장비 번호 안내"
            sub="부두별 갠트리 호기 참고표"
            onClick={() => setView('equip')} />
          {/* TallyOne 1.1: 클로드에게 메모 — 발견한 문제·요청 기록, 클로드 세션이 나중에 처리 */}
          <AuxCard icon={NotebookPen} accent="violetDeep" title="클로드에게 메모"
            sub="발견한 문제·요청 기록 → 클로드가 처리"
            onClick={() => setMemoOpen(true)} />
        </div>
      )}

      {view === 'grid' && (
        <div className="text-[10px] text-slate-600 text-center flex items-center justify-center gap-1">
          <MessageCircle className="w-3 h-3" />보조기능은 모든 검수사에게 열려 있습니다
        </div>
      )}

      {/* 모달들 — HelpModal·ContainerPhrasebook은 open prop, GeminiKeyModal은 조건부 마운트 */}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ContainerPhrasebook open={phraseOpen} onClose={() => setPhraseOpen(false)} />
      {keyOpen && <GeminiKeyModal onClose={() => setKeyOpen(false)} />}
      {briefOpen && <BriefingModal inspector={inspector} onClose={() => setBriefOpen(false)} />}
      {/* TallyOne 1.1: 클로드에게 메모 — AuxPage는 route·version prop이 없어 모달 내부 해시 파싱·APP_VERSION 폴백으로 동작 */}
      {memoOpen && <ClaudeMemoModal inspector={inspector} onClose={() => setMemoOpen(false)} />}
    </div>
  );
}
