// 컨펌용 플랜편집 — V9.07 신규 (V9.07-01에서 '선적 확정 플랜'에서 개칭)
//   일항사와 협의해 확정 플랜을 만드는 전용 화면. 선적(loading) 전용.
//
// 저장 계층 (3단 — 실선적 불가침):
//   planDraft      초안. [저장]으로 보관, 검수사 화면 영향 0
//   ediContainers  [확정] 시에만 갱신 = 이게 검수앱의 선적 플랜이 된다
//   records.bay_actual  실체 위치 — 이 화면이 절대 건드리지 않는다
//
// 이동 가능 = 작업대상(평택 선적화물 + 쉬프팅). 통과 고정분은 잠금. (사용자 확정 2026-07-25)
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { isPyeongtaekPort, isoToLabel, loadSheetJS, fullEdiMapOf } from '../utils.js';
import { fbSavePlanDraft, fbCommitPlan, fbRestorePlanFromEdi } from '../firebase.js';
import { computeShiftingMapCached } from '../utils.js';
import BayGridEditor from './BayGridEditor.jsx';
import PrintableCargoPlanV2 from './PrintableCargoPlanV2.jsx';
import * as P from '../planEditCore.js';

const pad2 = (v) => String(v ?? '').padStart(2, '0');
const cnNorm = (s) => String(s || '').replace(/\s/g, '').toUpperCase();

function download(name, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}

export default function LoadingPlanEdit({ voyage, voyageKey, inspector, onClose }) {
  const [saving, setSaving] = useState(false);
  const [seq, setSeq] = useState(0);
  const [planOpen, setPlanOpen] = useState(false);
  const [live, setLive] = useState(null);          // 편집기 현재 state (내보내기·카고플랜용)

  const sec = voyage?.loading || {};
  // V9.07-03: 통과화물 포함 — 다른 항에서 실린 화물이 안 보이면 이동 가능한 자리인지 분간이 안 된다.
  //   통과화물은 lockedCns 판정으로 회색 잠금이 되어 표시만 되고 움직이지 않는다.
  const ediMap = useMemo(() => fullEdiMapOf(sec),
    [sec?.raw?.edi?.uploadedAt, sec?.raw?.edi?.sizeBytes, sec?.ediContainers]);
  const recMap = sec.records || {};
  const draft = sec.planDraft || null;

  useEffect(() => {
    document.body.classList.toggle('bge-planopen', planOpen);
    return () => document.body.classList.remove('bge-planopen');
  }, [planOpen]);

  // 기준 위치 = 계획(ediContainers). 초안이 있으면 초안 우선.
  const { containers, storageCns } = useMemo(() => {
    const list = [];
    const stg = [];
    for (const e of Object.values(ediMap)) {
      const cn = cnNorm(e.cn);
      const d = draft && draft[cn];
      const unassigned = !!e.plan_unassigned || (d && d.storage);
      if (unassigned) stg.push(cn);
      list.push({
        ...e,
        bay: pad2(d && d.bay ? d.bay : e.bay),
        row: pad2(d && d.row ? d.row : e.row),
        tier: pad2(d && d.tier ? d.tier : e.tier),
        _inList: !!recMap[e.cn],
      });
    }
    return { containers: list, storageCns: stg };
  }, [ediMap, recMap, draft]);

  // 쉬프팅(재적부) — 양하·선적 raw EDI 대조
  const shiftCns = useMemo(() => {
    try { return Object.keys(computeShiftingMapCached(voyageKey, voyage) || {}); } catch (e) { return []; }
  }, [voyageKey, voyage]);

  // 이동 가능 = 평택 선적분(리스트 등록 또는 POL 평택) 또는 쉬프팅. 그 외 통과 고정분.
  const lockedCns = useMemo(() => {
    const shift = new Set(shiftCns.map(cnNorm));
    const s = new Set();
    for (const c of containers) {
      const cn = cnNorm(c.cn);
      const movable = shift.has(cn) || c._inList || isPyeongtaekPort(c.pol);
      if (!movable) s.add(cn);
    }
    return s;
  }, [containers, shiftCns]);

  const editedContainers = useMemo(() => {
    if (!live) return containers.filter((c) => !storageCns.includes(cnNorm(c.cn)));
    const out = [];
    for (const c of containers) {
      const p = live.pos[cnNorm(c.cn)];
      if (!p || p.storage) continue;
      out.push({ ...c, bay: p.bay, row: p.row, tier: p.tier });
    }
    return out;
  }, [containers, live, storageCns]);

  const saveDraft = useCallback(async (state) => {
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    setSaving(true);
    try {
      const d = {};
      for (const c of P.diffChanges(state)) {
        const p = state.pos[c.cn];
        d[c.cn] = p.storage ? { storage: true } : { bay: p.bay, row: p.row, tier: p.tier };
      }
      await fbSavePlanDraft(voyageKey, d, inspector);
      alert(`초안 저장 완료 — ${Object.keys(d).length}건.\n검수사 화면과 실선적에는 아직 반영되지 않습니다.\n[확정]을 눌러야 검수앱 선적 플랜이 됩니다.`);
    } catch (e) { console.error(e); alert('저장 실패: ' + (e?.message || e)); }
    finally { setSaving(false); }
  }, [inspector, voyageKey]);

  const commit = useCallback(async () => {
    if (!live) return;
    if (!inspector) { alert('검수원을 먼저 선택하세요'); return; }
    const changes = P.diffChanges(live);
    if (!changes.length) { alert('변경 내용이 없습니다.'); return; }
    if (!window.confirm(
      `확정하면 이 위치가 검수앱의 선적 플랜이 됩니다.\n\n변경 ${changes.length}건\n\n`
      + '· 검수사 화면·베이플랜·카고플랜에 즉시 반영됩니다\n'
      + '· 실선적 기록(실체 위치)은 바뀌지 않습니다\n'
      + '· EDI 원본은 자동 백업되어 [원본 복원]으로 되돌릴 수 있습니다\n\n확정할까요?')) return;
    setSaving(true);
    try {
      const pos = {};
      for (const c of changes) {
        const p = live.pos[c.cn];
        pos[c.cn] = p.storage ? { storage: true } : { bay: p.bay, row: p.row, tier: p.tier };
      }
      const r = await fbCommitPlan(voyageKey, pos, inspector);
      alert(`확정 완료 — ${r.committed}건 반영 (미배정 ${r.storage}건).\n검수앱 선적 플랜이 갱신되었습니다.`);
      setSeq((n) => n + 1);
    } catch (e) { console.error(e); alert('확정 실패: ' + (e?.message || e)); }
    finally { setSaving(false); }
  }, [live, inspector, voyageKey]);

  const restore = useCallback(async () => {
    if (!window.confirm('확정 내용을 버리고 EDI 원본 계획 위치로 되돌립니다.\n계속할까요?')) return;
    setSaving(true);
    try {
      const n = await fbRestorePlanFromEdi(voyageKey);
      alert(n ? `EDI 원본으로 복원 — ${n}건` : '복원할 백업이 없습니다 (확정 이력 없음).');
      setSeq((k) => k + 1);
    } catch (e) { console.error(e); alert('복원 실패: ' + (e?.message || e)); }
    finally { setSaving(false); }
  }, [voyageKey]);

  const expJson = () => {
    if (!live) return;
    download(`${voyage?.info?.voy_l || voyageKey}_확정플랜_변경내역.json`, JSON.stringify({
      version: 'V9.07', ship: voyage?.info?.vsl || '', voyage: voyage?.info?.voy_l || voyageKey,
      mode: 'loading', exportedAt: new Date().toISOString(),
      summary: P.summarize(live), changes: P.diffChanges(live),
    }, null, 2), 'application/json');
  };
  const expXlsx = async () => {
    if (!live) return;
    const XLSX = await loadSheetJS();
    const rows = P.diffChanges(live).map((c, i) => ({
      번호: i + 1, 컨테이너: c.cn, ISO: c.iso, 규격: isoToLabel(c.iso) || '',
      POL: c.pol, POD: c.pod, 쉬프팅: c.shifting ? 'Y' : '',
      '변경전 위치': c.fromLabel, '변경후 위치': c.toLabel,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '변경표');
    XLSX.writeFile(wb, `${voyage?.info?.voy_l || voyageKey}_확정플랜_변경표.xlsx`);
  };

  // 헤더는 핵심 2개만 — 부가 기능은 옆 패널로 (버튼이 많으면 헤더가 가로로 넘쳐 클릭이 막힌다)
  const headerExtra = (
    <>
      <button className="bge-btn p" onClick={() => setPlanOpen(true)}>🗺 카고플랜</button>
      <button className="bge-btn" style={{ background: '#7c3aed', borderColor: '#7c3aed', color: '#fff' }} onClick={commit} disabled={saving}>✅ 확정</button>
    </>
  );

  const sideExtra = (
    <div style={{ padding: '8px 10px', borderTop: '1px solid #334155', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
      <b style={{ color: '#c4b5fd' }}>컨펌용 플랜편집</b><br />
      <b style={{ color: '#e2e8f0' }}>[초안 저장]</b>은 보관만 합니다.<br />
      <b style={{ color: '#e2e8f0' }}>[확정]</b>을 눌러야 검수앱 선적 플랜이 됩니다.<br />
      실선적 기록은 바뀌지 않습니다.
      <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="bge-btn" onClick={expJson}>JSON</button>
        <button className="bge-btn" onClick={expXlsx}>엑셀</button>
        <button className="bge-btn" onClick={restore} disabled={saving} title="확정 내용을 버리고 EDI 원본 계획 위치로">↩ 원본 복원</button>
      </div>
    </div>
  );

  return (
    <>
      <BayGridEditor
        key={`plan-${seq}`}
        title="📐 컨펌용 플랜편집"
        subtitle={`${voyage?.info?.vsl || voyageKey} · 일항사 협의용`}
        voyageInfo={voyage?.info?.voy_l || voyage?.info?.voy || ''}
        containers={containers}
        storageCns={storageCns}
        lockedCns={lockedCns}
        shiftCns={shiftCns}
        shipImo={voyage?.info?.imo}
        shipName={voyage?.info?.vsl}
        mode="loading"
        lockHint="통과 고정분"
        saving={saving}
        saveLabel="초안 저장"
        onSave={saveDraft}
        onClose={onClose}
        onStateChange={setLive}
        headerExtra={headerExtra}
        sideExtra={sideExtra}
      />
      {planOpen && (
        <PrintableCargoPlanV2
          containers={editedContainers}
          shipImo={voyage?.info?.imo}
          shipName={voyage?.info?.vsl}
          voyNo={voyage?.info?.voy_l || voyage?.info?.voy}
          voyageInfo={voyage?.info}
          mode="loading"
          onClose={() => setPlanOpen(false)}
        />
      )}
    </>
  );
}
