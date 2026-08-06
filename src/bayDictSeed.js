// 기본 선박 사전 씨앗 읽기 — TallyUni 0.9-01
//
// 왜 있나: 새로 설치한 회사의 베이사전이 텅 비어 있으면 첫 배부터 매트릭스를 처음부터
//   그려야 한다. 검수사 확정 — "현장 정본 앱의 기존 선박 사전을 설치할 때 저장소에 넣는다".
//
// 0.9-01 에서 바뀐 것 — 씨앗 파일은 앱이 스스로 내려받지 않는다.
//   0.9 는 public/seed/ship_bay_dict_seed.json 을 fetch 했다. 그 파일은 회사가 배를 재서
//   만든 자산인데, 공개 저장소와 공개 사이트(Pages)에 그대로 실려 누구나 받을 수 있었다.
//   검수사 확정 = 비공개 전달. 그래서 URL 경로(SEED_PATH·bayDictSeedUrl·fetchBayDictSeed)를
//   통째로 걷어내고, 사람이 고른 파일 하나를 받아 검증·파싱하는 통로만 남긴다.
//   씨앗은 저장소 밖에 보관한다.
//   → 쓰는 곳은 둘뿐이다. 설치 마법사 3단계의 [사전 파일 선택(선택 사항)] ·
//     베이사전 라이브러리의 관리자 [기본 사전 가져오기] 버튼.
//
// 만드는 쪽: tools/make_baydict_seed.cjs (재생성 가능, 출력은 저장소 밖으로).

/** 파일 하나를 글자로 읽는다. Blob.text()가 없는 환경(구형 웹뷰)은 FileReader 로 내려간다. */
function readFileText(file) {
  if (file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'function') {
      reject(new Error('이 브라우저에서는 파일을 읽을 수 없습니다(FileReader 없음).'));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result == null ? '' : fr.result));
    fr.onerror = () => reject(new Error(`파일을 읽지 못했습니다 — ${fr.error && fr.error.message ? fr.error.message : '읽기 오류'}`));
    fr.readAsText(file);
  });
}

/**
 * 고른 씨앗 파일을 읽어 검증한다. 실패는 던진다 — 조용히 빈 객체를 돌려주면
 * "0척 심었다"가 성공처럼 보인다.
 * @param {File|Blob} file  <input type="file"> 에서 받은 파일
 * @returns {Promise<{meta:object, ships:object, codes:string[], withBays:number, fileName:string}>}
 */
export async function readBayDictSeedFile(file) {
  if (!file) throw new Error('사전 파일을 고르지 않았습니다.');
  const name = file.name || '사전 파일';
  if (typeof file.size === 'number' && file.size === 0) throw new Error(`${name} 이(가) 비어 있습니다 (0바이트).`);

  let text;
  try {
    text = await readFileText(file);
  } catch (e) {
    throw new Error(`${name} 을(를) 읽지 못했습니다 — ${(e && e.message) || e}`);
  }
  if (!String(text).trim()) throw new Error(`${name} 이(가) 비어 있습니다.`);

  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`${name} 이(가) JSON 이 아닙니다 — ${(e && e.message) || e}`);
  }

  const ships = doc && doc.ships && typeof doc.ships === 'object' && !Array.isArray(doc.ships) ? doc.ships : null;
  if (!ships) throw new Error(`${name} 의 형식이 다릅니다 — ships 없음. 기본 선박 사전 파일이 맞는지 확인하세요.`);
  const codes = Object.keys(ships);
  if (codes.length === 0) throw new Error(`${name} 에 선박이 한 척도 없습니다.`);

  // 베이 정의가 하나도 없는 파일은 사전이 아니다 — 심어 봐야 빈 껍데기만 늘어난다.
  const withBays = codes.filter((c) => {
    const e = ships[c];
    const bs = e && e.bayDef && e.bayDef.baysSummary;
    return Array.isArray(bs) && bs.length > 0;
  });
  if (withBays.length === 0) throw new Error(`${name} 에 베이 정의(bayDef.baysSummary)를 가진 선박이 없습니다.`);

  return { meta: doc._meta || {}, ships, codes, withBays: withBays.length, fileName: name };
}

/** 사전 맵을 n척씩 끊어 준다 — 한 번에 100척을 던지면 약신호에서 통째로 실패한다. */
export function chunkShips(ships, size = 25) {
  const out = [];
  const codes = Object.keys(ships || {});
  for (let i = 0; i < codes.length; i += size) {
    const part = {};
    for (const c of codes.slice(i, i + size)) part[c] = ships[c];
    out.push(part);
  }
  return out;
}
