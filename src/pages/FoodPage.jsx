// 맛집 수첩 + 돌림판 페이지 — 평택항(포승) 주변 식당 공유·별점·한줄평·랜덤 추천 (V8.60).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Phone, MapPin, Plus, Trash2, Star, Dices } from 'lucide-react';
import { FOOD_SEEDS, FOOD_SEEDS_W2, FOOD_SEEDS_W3, mealSlotNow, SLOT_LABEL, filterBySlot, avgRating, pickWheelList, wheelTargetOf, nextRotation, mapUrlOf } from '../foodSpots.js';
import { fbFoodListen, fbAddFoodSpot, fbDeleteFoodSpot, fbRateFoodSpot, fbCommentFoodSpot, fbSeedFoodSpotsOnce } from '../firebase.js';
import { isChief } from '../staffList.js';
import { speak } from '../voice.js';

const TAG_OPTS = ['아침', '점심', '저녁', '야식', '24시', '배달'];
const WHEEL_COLORS = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#ec4899'];

// 돌림판 모달 — 후보 조각 룰렛이 돌고 멈추면 음성으로 발표.
function RouletteModal({ spots, slot, onClose }) {
  // V8.62: 조각 배치는 후보가 준비된 순간 1회 고정 — 스핀마다 재셔플하면 바늘·당첨이 어긋난다.
  const [wheelList, setWheelList] = useState([]);
  const [winner, setWinner] = useState(null);
  const [rot, setRot] = useState(0);
  const [done, setDone] = useState(false);
  const label = SLOT_LABEL[slot] || '식사';
  // V9.00: 폐업 추정(status=closed) 식당은 돌림판 후보에서 제외
  const candidates = useMemo(() => filterBySlot(spots, slot).filter(s => s.status !== 'closed'), [spots, slot]);

  const doSpin = (list = wheelList) => {
    if (!list.length) return;
    const winIdx = Math.floor(Math.random() * list.length);
    setDone(false);
    setWinner(list[winIdx]);
    // 절대 방향각 — 몇 번을 다시 돌려도 당첨 조각 중앙이 정확히 바늘(12시)에 멈춘다.
    setRot(r => nextRotation(r, wheelTargetOf(winIdx, list.length)));
  };
  // 열리면 자동 스핀 — 파이어베이스 로딩보다 먼저 열릴 수 있으므로 후보가 생긴 뒤 1회만.
  const spunRef = useRef(false);
  useEffect(() => {
    if (spunRef.current || !candidates.length) return;
    spunRef.current = true;
    const list = pickWheelList(candidates);
    setWheelList(list);
    const t = setTimeout(() => doSpin(list), 400);
    return () => clearTimeout(t);
  }, [candidates.length]);

  const onEnd = () => {
    if (!winner || done) return;
    setDone(true);
    const r = avgRating(winner);
    speak(`오늘 ${label}은 ${winner.name}${r ? `, 별점 ${r}점` : ''}! 맛있게 드세요.`);
  };

  const n = wheelList.length;
  const seg = n ? 360 / n : 360;
  const grad = n ? `conic-gradient(${wheelList.map((s, i) =>
    `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})` : 'conic-gradient(#334155 0deg 360deg)';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-violet-700 rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-center font-bold text-violet-300">🎰 오늘 {label} 뭐 먹지 돌림판</div>
        <div className="relative mx-auto" style={{ width: 260, height: 260 }}>
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 text-2xl">🔻</div>
          <div className="w-full h-full rounded-full border-4 border-slate-700 relative overflow-hidden"
            style={{ background: grad, transform: `rotate(${rot}deg)`, transition: 'transform 3.2s cubic-bezier(0.15, 0.9, 0.25, 1)' }}
            onTransitionEnd={onEnd}>
            {wheelList.map((s, i) => {
              // V8.62-01: 라벨 중앙 정렬 — 회전 기준점이 휠 중심에서 45px 어긋나 조각 중심선 옆으로 쏠리던 버그.
              //   조각 중앙선을 3시 방향으로 돌린 프레임에서, 중심→림 방향으로 텍스트를 눕혀 선 위에 정확히 얹는다.
              const a = i * seg + seg / 2;
              return (
                <div key={s.name + i} className="absolute inset-0" style={{ transform: `rotate(${a - 90}deg)` }}>
                  <div className="absolute top-1/2 text-[10px] font-bold text-white"
                    style={{ left: '50%', width: 128, paddingLeft: 34, transform: 'translateY(-50%)', textAlign: 'left',
                      textShadow: '0 1px 2px rgba(0,0,0,.8)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {s.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {done && winner && (
          <div className="text-center space-y-2">
            <div className="text-lg font-black text-amber-300">🎉 {winner.name}</div>
            <div className="text-xs text-slate-400">{winner.cat}{winner.area ? ` · ${winner.area}` : ''}{avgRating(winner) ? ` · ★${avgRating(winner)}` : ''}</div>
            <div className="flex gap-2">
              {winner.tel && (
                <a href={`tel:${winner.tel}`} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold text-center">📞 전화</a>
              )}
              <a href={mapUrlOf(winner)} target="_blank" rel="noreferrer" className="flex-1 py-2 rounded-lg bg-sky-700 text-white text-sm font-bold text-center">🗺 지도</a>
              <button onClick={() => doSpin()} className="flex-1 py-2 rounded-lg bg-violet-700 text-white text-sm font-bold">🎲 다시</button>
            </div>
          </div>
        )}
        {!done && <div className="text-center text-xs text-slate-500">두구두구두구...</div>}
        <button onClick={onClose} className="w-full py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">닫기</button>
      </div>
    </div>
  );
}

export default function FoodPage({ inspector, onGoHome }) {
  const [spots, setSpots] = useState(null);           // {id: spot}
  const [slot, setSlot] = useState(() => mealSlotNow());
  const [roulette, setRoulette] = useState(null);     // 열려 있으면 slot 문자열
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', cat: '', tel: '', area: '', note: '', tags: [] });
  const [commentFor, setCommentFor] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [menuFor, setMenuFor] = useState(null);        // V9.00: 메뉴판 펼친 식당 id
  const seededRef = useRef(false);

  useEffect(() => fbFoodListen(setSpots), []);
  // 첫 진입 시 비어 있으면 시드 1회 주입 + 2차 시드(V8.61: 노걸대~다온다 구간)는 기존 DB에도 1회 주입
  useEffect(() => {
    if (spots === null || seededRef.current) return;
    seededRef.current = true;
    if (Object.keys(spots).length === 0) fbSeedFoodSpotsOnce(FOOD_SEEDS);
    fbSeedFoodSpotsOnce(FOOD_SEEDS_W2, '_seeded_w2');
    fbSeedFoodSpotsOnce(FOOD_SEEDS_W3, '_seeded_w3');   // V8.62: 편의점 전체
  }, [spots]);
  // URL ?spin=slot → 돌림판 자동 오픈 (음성 트리거)
  useEffect(() => {
    const m = window.location.hash.match(/[?&]spin=([a-z]+)/);
    if (m) {
      const sl = ['breakfast', 'lunch', 'dinner', 'night'].includes(m[1]) ? m[1] : mealSlotNow();
      setSlot(sl); setRoulette(sl);
      window.history.replaceState(null, '', '#/food');
    }
  }, []);

  const list = useMemo(() => {
    const arr = Object.entries(spots || {}).map(([id, s]) => ({ ...s, id }));
    const f = filterBySlot(arr, slot);
    return f.sort((a, b) => (avgRating(b) || 0) - (avgRating(a) || 0) || (a.name || '').localeCompare(b.name || ''));
  }, [spots, slot]);

  const toggleTag = (t) => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }));
  const submitAdd = async () => {
    if (!form.name.trim()) { alert('식당 이름을 입력하세요'); return; }
    await fbAddFoodSpot({ ...form, name: form.name.trim() }, inspector);
    setForm({ name: '', cat: '', tel: '', area: '', note: '', tags: [] });
    setAddOpen(false);
    speak('맛집 등록 완료');
  };
  const canDelete = (s) => inspector && (s.addedBy === inspector || isChief(inspector));
  const rate = (s, score) => fbRateFoodSpot(s.id, inspector, score);
  const submitComment = async (s) => {
    if (!commentText.trim()) return;
    await fbCommentFoodSpot(s.id, inspector, commentText.trim());
    setCommentText(''); setCommentFor(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        {/* TallyOne 1.0(판2 팀M): 헤더 톤을 보조기능 허브(AuxPage)·건강 점검과 통일 — 스타일만, 동작 불변 */}
        <button onClick={onGoHome} className="flex items-center gap-1 py-2.5 pr-3 text-sm text-slate-400 hover:text-sky-300">
          <ChevronLeft className="w-4 h-4"/>홈
        </button>
        <div className="font-black text-slate-100">🍽 평택항 맛집 수첩</div>
        <button onClick={() => setRoulette(slot)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm font-bold">
          <Dices className="w-4 h-4"/>돌림판
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {['breakfast', 'lunch', 'dinner', 'night', 'any'].map(sl => (
          <button key={sl} onClick={() => setSlot(sl)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${slot === sl
              ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
            {SLOT_LABEL[sl]}{sl === mealSlotNow() ? ' ·지금' : ''}
          </button>
        ))}
      </div>

      {spots === null && <div className="text-center text-xs text-slate-500 py-8">불러오는 중...</div>}

      <div className="space-y-2">
        {list.map(s => {
          const r = avgRating(s);
          const comments = Object.values(s.comments || {}).sort((a, b) => (b.ts || 0) - (a.ts || 0));
          const isClosed = s.status === 'closed';   // V9.00: 일일 점검이 폐업 추정으로 표시한 곳
          return (
            <div key={s.id} className={`bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5 ${isClosed ? 'opacity-55' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-100">{s.name} <span className="text-[11px] font-normal text-slate-400">{s.cat}</span>
                    {isClosed && <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px] font-bold align-middle">⚠ 폐업 추정</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{[s.area, s.hours, s.note].filter(Boolean).join(' · ')}</div>
                </div>
                {canDelete(s) && (
                  <button onClick={() => { if (confirm(`${s.name} 삭제할까요?`)) fbDeleteFoodSpot(s.id); }}
                    className="text-slate-600 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(s.tags || []).map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">{t}</span>)}
                {s.addedBy && s.addedBy !== '시드' && <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px]">{s.addedBy} 추천</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} onClick={() => rate(s, i)} aria-label={`별점 ${i}`}>
                      <Star className={`w-5 h-5 ${(s.ratings?.[inspector] || 0) >= i ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`}/>
                    </button>
                  ))}
                </div>
                <span className="text-xs font-bold text-amber-300">{r ? `★${r} (${Object.keys(s.ratings || {}).length}명)` : '첫 별점을!'}</span>
                <div className="ml-auto flex gap-1.5">
                  {Array.isArray(s.menu) && s.menu.length > 0 && (
                    <button onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold ${menuFor === s.id ? 'bg-amber-700 text-white' : 'bg-amber-900/60 text-amber-300'}`}>
                      🍜 메뉴 {s.menu.length}
                    </button>
                  )}
                  {s.tel && <a href={`tel:${s.tel}`} className="p-1.5 rounded-lg bg-emerald-900/60 text-emerald-300"><Phone className="w-4 h-4"/></a>}
                  <a href={mapUrlOf(s)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg bg-sky-900/60 text-sky-300"><MapPin className="w-4 h-4"/></a>
                </div>
              </div>
              {menuFor === s.id && Array.isArray(s.menu) && (
                <div className="border-t border-slate-800 pt-1.5 space-y-0.5">
                  {s.menu.map((m, i) => (
                    <div key={i} className="flex justify-between text-[12px]">
                      <span className="text-slate-200">{m.n}</span>
                      <span className="text-amber-300 font-bold">{typeof m.p === 'number' ? m.p.toLocaleString() + '원' : (m.p || '')}</span>
                    </div>
                  ))}
                  {s.checkedAt && <div className="text-[10px] text-slate-600 text-right">웹 확인 {new Date(s.checkedAt).toLocaleDateString('ko-KR')} — 가격은 변동될 수 있음</div>}
                </div>
              )}
              {comments.length > 0 && (
                <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-800 pt-1.5">
                  {comments.slice(0, 3).map((c, i) => <div key={i}>💬 {c.text} <span className="text-slate-600">— {c.by}</span></div>)}
                </div>
              )}
              {commentFor === s.id ? (
                <div className="flex gap-1.5">
                  <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitComment(s); }}
                    placeholder="한줄평 (예: 김치찌개 최고)" className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"/>
                  <button onClick={() => submitComment(s)} className="px-2.5 rounded bg-emerald-700 text-white text-xs font-bold">등록</button>
                </div>
              ) : (
                <button onClick={() => { setCommentFor(s.id); setCommentText(''); }} className="text-[11px] text-slate-500 hover:text-slate-300">+ 한줄평</button>
              )}
            </div>
          );
        })}
        {spots !== null && list.length === 0 && <div className="text-center text-xs text-slate-500 py-8">이 시간대 식당이 없습니다 — 아래에서 추가해 주세요.</div>}
      </div>

      {addOpen ? (
        <div className="bg-slate-900 border-2 border-emerald-700 rounded-xl p-3 space-y-2">
          <div className="text-sm font-bold text-emerald-300">새 맛집 추가</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="식당 이름 *" className="col-span-2 bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-100"/>
            <input value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))} placeholder="종류 (국밥 등)" className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-100"/>
            <input value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} placeholder="전화 (선택)" className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-100"/>
            <input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="위치 (만호리 등)" className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-100"/>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="메모 (선택)" className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-slate-100"/>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTS.map(t => (
              <button key={t} onClick={() => toggleTag(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${form.tags.includes(t) ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={submitAdd} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold">등록</button>
            <button onClick={() => setAddOpen(false)} className="px-4 rounded-lg bg-slate-800 text-slate-400 text-sm">취소</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddOpen(true)}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-700 text-slate-400 text-sm font-bold hover:border-emerald-700 hover:text-emerald-300 flex items-center justify-center gap-1">
          <Plus className="w-4 h-4"/>맛집 추가
        </button>
      )}
      <div className="text-[10px] text-slate-600 text-center">시드 정보는 웹 조사 기반 — 전화·영업시간은 확인 후 수정하세요. 삭제는 등록자·수석만 가능.</div>

      {roulette && <RouletteModal spots={Object.entries(spots || {}).map(([id, s]) => ({ ...s, id }))} slot={roulette} onClose={() => setRoulette(null)}/>}
    </div>
  );
}
