// 항차 건강 점검 — 항차별 EDI/리스트/빈규격/수량불일치와 수집기 qc 플래그를 계산하는 헬퍼(V8.40).
//   규칙은 수집기 v2.15.0 _qc_flags와 동일: ① 빈규격 10% 초과 ② 리스트가 EDI보다 15% 초과 부풂.
//   수집기가 못 보는 수동 업로드 항차도 여기서 같은 규칙으로 검사한다.

const MODES = [
  ['discharge', '양하'],
  ['loading', '선적'],
];

export function voyageHealth(key, v) {
  const rows = [];
  const flags = [];
  for (const [mode, label] of MODES) {
    const sec = v?.[mode];
    if (!sec) continue;
    const edi = sec.ediContainers || {};
    const rec = sec.records || {};
    const ediN = Object.keys(edi).length;
    const recN = Object.keys(rec).length;
    if (!ediN && !recN) continue;
    let noIso = 0;
    for (const c of Object.values(edi)) {
      if (!c || !c.iso) noIso++;
    }
    const modeFlags = [];
    if (ediN && noIso * 10 > ediN) modeFlags.push(`빈규격 ${noIso}/${ediN}`);
    if (ediN && recN && recN * 100 > ediN * 115) modeFlags.push(`수량불일치 EDI ${ediN}·리스트 ${recN}`);
    // 수집기 qc 플래그(원문)도 합침 — 중복 문구는 한 번만.
    for (const f of (v?.qc?.[mode]?.flags || [])) {
      if (!modeFlags.includes(f)) modeFlags.push(f);
    }
    rows.push({ mode, label, ediN, recN, noIso, flags: modeFlags });
    flags.push(...modeFlags.map(f => `${label} ${f}`));
  }
  return {
    key,
    vsl: v?.info?.vsl || '',
    voy: v?.info?.voy || '',
    auto: !!v?.info?.autoRegistered,
    autoStatus: v?.info?.autoStatus || '',
    rows,
    flags,
  };
}

// 전체 항차 요약 — 대시보드 표 + 홈 요약 배지용.
export function healthSummary(voyages) {
  const list = Object.entries(voyages || {}).map(([key, v]) => voyageHealth(key, v));
  list.sort((a, b) => (b.flags.length - a.flags.length) || a.key.localeCompare(b.key));
  return { list, issueCount: list.filter(x => x.flags.length > 0).length };
}

// 하트비트 상태 판정 — 끊김 기준 = 사이클 주기의 2배(사용자 확정 2026-07-03).
export function heartbeatState(hb, now = Date.now()) {
  if (!hb || !hb.at) return { state: 'none', ageMin: null, cycleMin: null };
  const ageMin = Math.max(0, Math.round((now - hb.at) / 60000));
  const cycleMin = Math.max(1, Number(hb.cycleMin) || 5);
  return { state: (now - hb.at) > cycleMin * 2 * 60000 ? 'down' : 'ok', ageMin, cycleMin };
}
