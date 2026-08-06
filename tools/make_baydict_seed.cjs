#!/usr/bin/env node
/**
 * 기본 선박 사전 시드 생성기 — TallyUni 0.9
 *
 * 왜: 새 회사가 앱을 설치하면 베이사전이 텅 비어 있다. 첫 배가 들어오는 날부터
 *     매트릭스를 처음부터 그려야 한다는 뜻이라, 검수사가 "현장 정본 앱의 기존 선박
 *     사전을 앱에 넣어 두었다가 설치하면 저장소에 들어가게" 하라고 확정했다.
 *     이 스크립트가 그 씨앗을 만든다.
 *
 * 무엇을: 현장(그린마린) Firebase 의 ship_bay_dict_v3 를 **읽기 전용 GET** 한 번으로
 *     받아, ① bayDef(baysSummary)가 실제로 있는 항목만 남기고 ② 그 회사에만 해당하는
 *     흔적(검수원 이름·항차·PDF 보관 링크·모항)을 떼고 ③ seed:true 를 찍어
 *     public/seed/ship_bay_dict_seed.json 으로 쓴다.
 *     선박 기하(베이·티어·로우·차단셀·페어)는 어느 항에서 재도 같으므로 그대로 둔다.
 *     정본 표식(_userOwned·source:'user')도 그대로 둔다 — 이 사전은 사람이 배를 재서
 *     만든 정본이고, 그걸 자동본으로 낮추면 받는 쪽에서 v2 자동사전이 덮어쓴다.
 *
 * 실행:
 *   node tools/make_baydict_seed.cjs                    # 현장 DB 에서 GET
 *   node tools/make_baydict_seed.cjs --from <파일.json>  # 내려받은 사본/백업에서
 *   node tools/make_baydict_seed.cjs --out <경로>
 *   node tools/make_baydict_seed.cjs --from <파일> --origin '<출처 표기>'
 *
 * 남기는 것 하나 — bayDef.sourceFile 은 그대로 둔다. 그 매트릭스를 어느 파일에서
 *   해독했는지의 기록이라 지우면 감사 경로가 끊긴다. 두 건(NGTR·STAR)에 옛 모항
 *   토막(PTK/KRPTK)이 파일 이름 안에 들어 있으나, 파일 이름이라는 사실 자체는
 *   바뀌지 않으므로 고쳐 쓰지 않고 남긴다.
 *
 * ⚠ 현장 DB 는 이 GET 외에 절대 건드리지 않는다. 쓰기 없음.
 */
const fs = require('fs');
const path = require('path');

const FIELD_URL = 'https://greenmarinetally-default-rtdb.asia-southeast1.firebasedatabase.app/ship_bay_dict_v3.json';

// 항목에서 떼는 테넌트(회사) 흔적 — 선박 기하와 무관하고 받는 회사에 거짓말이 되는 것들.
const TENANT_FIELDS = ['_inspector', 'editorName', 'updatedBy', 'voy', 'confirmedBy', 'confirmedAt',
                       'pdfUrl', 'pdfPath', 'pdfName', 'pdfUploadedAt'];
// bayDef._stowageMeta 안의 항차/모항/물량 — 그 항차 한 번의 사실이라 씨앗에 들어가면 안 된다.
//   같은 블록의 pairs·standalone·blockSize 는 선박 기하이므로 남긴다.
const STOWAGE_META_TENANT = ['voyageNo', 'pol', 'totals'];

function argv(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function loadSource() {
  const from = argv('--from', null);
  if (from) {
    console.log(`[출처] 파일 ${from}`);
    return { raw: JSON.parse(fs.readFileSync(from, 'utf8')), origin: argv('--origin', `file:${path.basename(from)}`) };
  }
  console.log(`[출처] 현장 Firebase 읽기 전용 GET — ${FIELD_URL}`);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 180000);
  try {
    const res = await fetch(FIELD_URL, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { raw: await res.json(), origin: argv('--origin', 'field-rtdb ship_bay_dict_v3 (GET)') };
  } finally {
    clearTimeout(t);
  }
}

function cleanEntry(code, e) {
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (TENANT_FIELDS.includes(k)) continue;
    out[k] = v;
  }
  if (out.bayDef && typeof out.bayDef === 'object') {
    const bd = { ...out.bayDef };
    for (const k of TENANT_FIELDS) delete bd[k];
    if (bd._stowageMeta && typeof bd._stowageMeta === 'object') {
      const sm = { ...bd._stowageMeta };
      for (const k of STOWAGE_META_TENANT) delete sm[k];
      if (Object.keys(sm).length) bd._stowageMeta = sm; else delete bd._stowageMeta;
    }
    out.bayDef = bd;
  }
  out.code = code;
  out.seed = true;
  return out;
}

(async () => {
  const { raw, origin } = await loadSource();
  if (!raw || typeof raw !== 'object') throw new Error('사전 응답이 객체가 아니다');

  const codes = Object.keys(raw);
  const ships = {};
  let noBayDef = 0, emptySummary = 0;
  for (const code of codes.sort()) {
    const e = raw[code];
    if (!e || typeof e !== 'object') continue;
    if (!e.bayDef) { noBayDef++; continue; }
    const bs = e.bayDef.baysSummary;
    if (!Array.isArray(bs) || bs.length === 0) { emptySummary++; continue; }
    ships[code] = cleanEntry(code, e);
  }

  const kept = Object.keys(ships);
  const bays = kept.reduce((s, c) => s + ships[c].bayDef.baysSummary.length, 0);
  const doc = {
    _meta: {
      note: '기본 선박 베이사전 씨앗 — 설치 마법사/관리자 버튼이 저장소에 심는다. 회사 흔적 제거본.',
      generatedAt: new Date().toISOString(),
      origin,
      sourceCount: codes.length,
      count: kept.length,
      baySlices: bays,
      strippedFields: TENANT_FIELDS,
      strippedStowageMeta: STOWAGE_META_TENANT,
      generator: 'tools/make_baydict_seed.cjs',
    },
    ships,
  };

  const out = argv('--out', path.join(__dirname, '..', 'public', 'seed', 'ship_bay_dict_seed.json'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc));
  const size = fs.statSync(out).size;
  console.log(`[결과] 원본 ${codes.length}척 → 시드 ${kept.length}척 (bayDef 없음 ${noBayDef} · baysSummary 빈 것 ${emptySummary})`);
  console.log(`       베이 단면 합계 ${bays}개 · ${out} · ${(size / 1024).toFixed(1)}KB`);
})().catch((e) => {
  console.error('[실패]', e && e.message ? e.message : e);
  process.exit(1);
});
