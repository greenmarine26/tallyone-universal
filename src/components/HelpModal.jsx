// 사용 매뉴얼 — V9.11 전면 재작성 (사용자 요청 2026-07-26)
//   "검수앱 사용법을 다 지우고 자세히 — 예를 들어 가면서, 일일이 설명 안 해도 되게"
//   구성 ① 하루 작업 순서 코스(HELP_COURSE) — 처음 온 검수사가 따라만 하면 되는 10단계
//        ② 기능 사전(HELP_DATA.usage) — 궁금할 때 찾아보는 기능별 상세 13갈래
//        ③ 검수 용어·회화(HELP_DATA.terms + ContainerPhrasebook) — V8.02부터 유지
//   블록 스키마: { title, step?, where?, lead?, dos?[], says?[{in,out}], warns?[] }
//     화면 위치(📍)와 실제 입력→답변 예시를 항상 같이 보여준다.
import React, { useState } from 'react';
import { X, Search, Mic, MessageCircle, Anchor, Truck, AlertTriangle, Wrench,
  Camera, Bot, CheckCircle2, LayoutGrid, Upload, Printer, Play,
  BookOpen, Languages, ChevronRight, ChevronLeft } from 'lucide-react';
import ContainerPhrasebook from './ContainerPhrasebook.jsx';
import { HELP_DATA, HELP_COURSE } from '../data/helpData.js';

// 기능 사전 카테고리: id → {label, icon, accent, desc} — id는 HELP_DATA.usage 키와 1:1
const USAGE_CATS = [
  { id: 'search',  label: '검색',        icon: Search,        accent: 'sky',     desc: '끝 4자리 · 조건 붙이기 · 결과 카드 읽는 법' },
  { id: 'ask',     label: '물어보기',    icon: MessageCircle, accent: 'violet',  desc: '개수 · 위치 · 남은 것 · 점검 · 끝날 시각' },
  { id: 'voice',   label: '음성',        icon: Mic,           accent: 'rose',    desc: '손 안 쓰고 검색 · 답변 읽어주기' },
  { id: 'guide',   label: '자동 가이드', icon: Bot,           accent: 'indigo',  desc: '다음 컨을 순서대로 받아 확인만' },
  { id: 'confirm', label: '완료 처리',   icon: CheckCircle2,  accent: 'emerald', desc: '실번호 · X-RAY · 온도 · 누락 · 초과' },
  { id: 'twin',    label: '트윈',        icon: Truck,         accent: 'cyan',    desc: '20피트 두 대 한 번에' },
  { id: 'special', label: '특수화물',    icon: AlertTriangle, accent: 'amber',   desc: '리퍼 · 위험물 · X-RAY · FR/OT' },
  { id: 'port',    label: '항구 검색',   icon: Anchor,        accent: 'teal',    desc: '상해에서 온 컨 · 대련행' },
  { id: 'bay',     label: '베이 그림',   icon: LayoutGrid,    accent: 'lime',    desc: '보기 · 자리 옮기기 · 기호 읽기' },
  { id: 'report',  label: '보고 · 사진', icon: Camera,        accent: 'pink',    desc: '작업 보고 · 해치 · 사진 · 마감 점검' },
  { id: 'data',    label: '자료 업로드', icon: Upload,        accent: 'orange',  desc: 'EDI → 리스트 → X-RAY 순서' },
  { id: 'print',   label: '출력',        icon: Printer,       accent: 'blue',    desc: '검수 리스트 · 카고플랜 · 워킹 리포트' },
  { id: 'trouble', label: '안 될 때',    icon: Wrench,        accent: 'red',     desc: '막히는 조건과 푸는 법' },
];

// 테일윈드 정적 클래스 (동적 생성 금지 — purge 회피)
const ACCENT = {
  sky:     { card: 'bg-sky-950/40 border-sky-700/50 hover:border-sky-500',           icon: 'text-sky-300',     title: 'text-sky-200' },
  violet:  { card: 'bg-violet-950/40 border-violet-700/50 hover:border-violet-500',   icon: 'text-violet-300',  title: 'text-violet-200' },
  rose:    { card: 'bg-rose-950/40 border-rose-700/50 hover:border-rose-500',         icon: 'text-rose-300',    title: 'text-rose-200' },
  indigo:  { card: 'bg-indigo-950/40 border-indigo-700/50 hover:border-indigo-500',   icon: 'text-indigo-300',  title: 'text-indigo-200' },
  emerald: { card: 'bg-emerald-950/40 border-emerald-700/50 hover:border-emerald-500', icon: 'text-emerald-300', title: 'text-emerald-200' },
  cyan:    { card: 'bg-cyan-950/40 border-cyan-700/50 hover:border-cyan-500',         icon: 'text-cyan-300',    title: 'text-cyan-200' },
  amber:   { card: 'bg-amber-950/40 border-amber-700/50 hover:border-amber-500',      icon: 'text-amber-300',   title: 'text-amber-200' },
  teal:    { card: 'bg-teal-950/40 border-teal-700/50 hover:border-teal-500',         icon: 'text-teal-300',    title: 'text-teal-200' },
  lime:    { card: 'bg-lime-950/40 border-lime-700/50 hover:border-lime-500',         icon: 'text-lime-300',    title: 'text-lime-200' },
  pink:    { card: 'bg-pink-950/40 border-pink-700/50 hover:border-pink-500',         icon: 'text-pink-300',    title: 'text-pink-200' },
  orange:  { card: 'bg-orange-950/40 border-orange-700/50 hover:border-orange-500',   icon: 'text-orange-300',  title: 'text-orange-200' },
  blue:    { card: 'bg-blue-950/40 border-blue-700/50 hover:border-blue-500',         icon: 'text-blue-300',    title: 'text-blue-200' },
  red:     { card: 'bg-red-950/40 border-red-700/50 hover:border-red-500',            icon: 'text-red-300',     title: 'text-red-200' },
};

// ── 블록 한 장 (코스 단계·사전 항목 공통) ─────────────────────────────
function HelpBlock({ b }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 sm:p-3.5">
      <div className="flex items-start gap-2 mb-1.5">
        {b.step && (
          <span className="shrink-0 text-[10px] font-black bg-amber-600 text-slate-900 rounded px-1.5 py-0.5 mt-0.5">{b.step}</span>
        )}
        <div className="text-sm sm:text-base font-black text-amber-200 leading-snug">{b.title}</div>
      </div>

      {b.where && (
        <div className="text-[11px] sm:text-xs text-sky-300 bg-sky-950/40 border border-sky-800/50 rounded-lg px-2 py-1.5 mb-2 leading-relaxed">
          📍 {b.where}
        </div>
      )}

      {b.lead && (
        <div className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-2">{b.lead}</div>
      )}

      {b.dos && b.dos.length > 0 && (
        <ol className="space-y-1.5 mb-2">
          {b.dos.map((d, i) => (
            <li key={i} className="flex gap-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full bg-slate-700 text-slate-300 text-[10px] font-black flex items-center justify-center">{i + 1}</span>
              <span className="flex-1">{d}</span>
            </li>
          ))}
        </ol>
      )}

      {b.says && b.says.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-black text-cyan-300/80 mb-1">이렇게 치면 (또는 🎤로 말하면)</div>
          <div className="space-y-1">
            {b.says.map((s, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-1 sm:gap-2 py-1 border-b border-slate-700/40 last:border-0">
                <code className="sm:col-span-2 text-xs sm:text-sm font-bold mono text-cyan-300 bg-slate-950/60 px-2 py-1 rounded break-all self-start">
                  {s.in}
                </code>
                <div className="sm:col-span-3 text-[11px] sm:text-sm text-slate-300 leading-relaxed">
                  <span className="text-slate-500">→ </span>{s.out}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {b.warns && b.warns.length > 0 && (
        <div className="space-y-1 mt-2 pt-2 border-t border-slate-700/50">
          {b.warns.map((w, i) => (
            <div key={i} className="flex gap-1.5 text-[11px] sm:text-xs text-amber-100/80 leading-relaxed">
              <span className="shrink-0">⚠</span><span className="flex-1">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpModal({ open, onClose }) {
  // view: 'home' | 'course'(하루 작업 순서) | 'usage'(기능 사전 그리드) | 'cat:<id>' | 'terms'
  const [view, setView] = useState('home');
  const [phraseOpen, setPhraseOpen] = useState(false);
  if (!open) return null;

  const catBlocks = (id) => (HELP_DATA.usage?.[id] || []);

  const Header = ({ title, back }) => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/90 sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        {back && (
          <button onClick={back} className="p-1.5 -ml-1.5 hover:bg-slate-800 rounded-lg shrink-0">
            <ChevronLeft className="w-5 h-5 text-slate-300" />
          </button>
        )}
        <span className="text-base font-black text-slate-100 truncate">{title}</span>
      </div>
      <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg shrink-0">
        <X className="w-5 h-5 text-slate-400" />
      </button>
    </div>
  );

  let body;
  if (view === 'home') {
    body = (
      <>
        <Header title="사용 매뉴얼" />
        <div className="p-4 space-y-3 overflow-y-auto">
          <button onClick={() => setView('course')}
            className="w-full text-left bg-gradient-to-br from-amber-900/50 to-slate-900 border-2 border-amber-600/50 hover:border-amber-400 rounded-2xl p-5 flex items-center gap-4 transition">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <Play className="w-7 h-7 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-amber-100">처음이면 여기부터</div>
              <div className="text-sm text-amber-300/70 mt-0.5">하루 작업 순서 {HELP_COURSE.length}단계 — 이름 고르기부터 마감·인계까지</div>
            </div>
            <ChevronRight className="w-6 h-6 text-amber-400 shrink-0" />
          </button>

          <button onClick={() => setView('usage')}
            className="w-full text-left bg-gradient-to-br from-sky-900/50 to-slate-900 border-2 border-sky-700/40 hover:border-sky-500 rounded-2xl p-5 flex items-center gap-4 transition">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-7 h-7 text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-sky-100">기능 사전</div>
              <div className="text-sm text-sky-300/70 mt-0.5">검색·음성·가이드·완료 처리·보고·출력 — 궁금할 때 찾기</div>
            </div>
            <ChevronRight className="w-6 h-6 text-sky-400 shrink-0" />
          </button>

          <button onClick={() => setView('terms')}
            className="w-full text-left bg-gradient-to-br from-emerald-900/50 to-slate-900 border-2 border-emerald-700/40 hover:border-emerald-500 rounded-2xl p-5 flex items-center gap-4 transition">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Languages className="w-7 h-7 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-emerald-100">검수 용어 · 회화</div>
              <div className="text-sm text-emerald-300/70 mt-0.5">현장 용어 풀이 + 영어 회화집</div>
            </div>
            <ChevronRight className="w-6 h-6 text-emerald-400 shrink-0" />
          </button>
        </div>
      </>
    );
  } else if (view === 'course') {
    body = (
      <>
        <Header title="하루 작업 순서" back={() => setView('home')} />
        <div className="overflow-y-auto">
          <div className="px-3 sm:px-4 pt-3">
            <div className="text-[11px] sm:text-xs text-slate-400 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 leading-relaxed">
              위에서부터 그대로 따라 하면 됩니다. 📍는 화면 어디인지, 파란 글씨는 실제로 쳐 보는 말입니다.
            </div>
          </div>
          <div className="p-3 sm:p-4 space-y-3">
            {HELP_COURSE.map((b, i) => <HelpBlock key={i} b={b} />)}
          </div>
        </div>
      </>
    );
  } else if (view === 'usage') {
    body = (
      <>
        <Header title="기능 사전" back={() => setView('home')} />
        <div className="p-3 sm:p-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5">
            {USAGE_CATS.map((cat) => {
              const Icon = cat.icon;
              const a = ACCENT[cat.accent];
              return (
                <button key={cat.id} onClick={() => setView('cat:' + cat.id)}
                  className={`text-left border-2 rounded-2xl p-3.5 transition ${a.card}`}>
                  <Icon className={`w-7 h-7 mb-2 ${a.icon}`} />
                  <div className={`text-sm font-black ${a.title}`}>{cat.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{cat.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  } else if (view.startsWith('cat:')) {
    const id = view.slice(4);
    const cat = USAGE_CATS.find((c) => c.id === id);
    const blocks = catBlocks(id);
    body = (
      <>
        <Header title={cat ? cat.label : '사용 매뉴얼'} back={() => setView('usage')} />
        <div className="overflow-y-auto">
          <div className="p-3 sm:p-4 space-y-3">
            {blocks.length > 0
              ? blocks.map((b, i) => <HelpBlock key={i} b={b} />)
              : <div className="text-sm text-slate-400 text-center py-8">준비 중입니다.</div>}
          </div>
        </div>
      </>
    );
  } else if (view === 'terms') {
    body = (
      <>
        <Header title="검수 용어 · 회화" back={() => setView('home')} />
        <div className="p-3 sm:p-4 overflow-y-auto space-y-4">
          <button onClick={() => setPhraseOpen(true)}
            className="w-full bg-gradient-to-br from-blue-900/50 to-slate-900 border-2 border-blue-700/40 hover:border-blue-500 rounded-2xl p-4 flex items-center gap-3 transition">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
              <Languages className="w-6 h-6 text-blue-300" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="text-base font-black text-blue-100">영어 회화집 열기</div>
              <div className="text-xs text-blue-300/70">외국 선원·도선사 응대 표현 (음성·즐겨찾기)</div>
            </div>
            <ChevronRight className="w-5 h-5 text-blue-400 shrink-0" />
          </button>

          <div>
            <div className="text-sm font-black text-emerald-200 mb-2 px-1">📖 검수 용어 풀이</div>
            <div className="space-y-1.5">
              {(HELP_DATA.terms || []).map((t, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2.5 flex gap-3">
                  <div className="text-sm font-black text-emerald-300 mono shrink-0 min-w-[5.5rem]">{t.term}</div>
                  <div className="text-xs sm:text-sm text-slate-300 leading-relaxed">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-slate-950 border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {body}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950 text-[10px] text-slate-600 text-center shrink-0">
          여기에 없는 자유 질문은 검색창의 ✨ AI 버튼으로 — 답이 틀리면 ❌ 오답으로 남겨 주세요
        </div>
      </div>
      <ContainerPhrasebook open={phraseOpen} onClose={() => setPhraseOpen(false)} />
    </div>
  );
}
