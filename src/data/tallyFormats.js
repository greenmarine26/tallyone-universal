// 선박별 마감 텔리(DEP.TALLY REPORT) 양식 사전 — V9.19 (2026-07-28)
//   근거: 실물 마감 텔리 233개 분석 (C:\TALLYTEST\마감텔리_양식_카탈로그_2026-07-28.md).
//   ⚠ 선사 순서·포트 순서는 배마다 고정 — 임의 정렬 금지 (사용자 확정: "표기 방법과 순서가 일정해야").
//   여기 없는 선박은 defaultFormat(데이터에서 나온 순서대로)로 생성하되 화면에 '순서 미확정' 경고.

// 시트 변형: damage = 'each'(DAMAGE-EACH) | 'report'(DAMAGE REPORT) | null
//            shifting = SHIFTING 시트 포함 여부(쉬프팅 있을 때만 렌더)
//            performance = Performance 시트 여부
export const TALLY_FORMATS = {
  ATPR: { ops: ['SKR'], ports: ['DLC', 'WEI'], damage: null, shifting: false, performance: true },
  PCSZ: { ops: ['SKR', 'EAS'], ports: ['SHA'], damage: null, shifting: false, performance: true },
  DXQD: { ops: ['DWS', 'EAS'], ports: ['DLC'], damage: 'report', shifting: false, performance: true },
  TMPZ: { ops: ['TJM', 'EAS'], ports: ['NGB', 'SHA'], damage: 'report', shifting: false, performance: true },
  STSE: { ops: ['SIT', 'TJM', 'EAS', 'WDG', 'SKR'], ports: ['TAO', 'SHD'], damage: 'each', shifting: true, performance: false },
  STMJ: { ops: ['SIT', 'TJM', 'EAS', 'WDG', 'SKR'], ports: ['TAO', 'SHD'], damage: 'each', shifting: true, performance: false },
  DJCT: { ops: ['SKR', 'HAS', 'HSL', 'DJS', 'DYS'], ports: ['SHK', 'HPH', 'INC'], damage: null, shifting: true, performance: true },
  YKTD: { ops: ['SKR', 'HAS', 'HSL', 'DJS', 'DYS'], ports: ['INC', 'SHK', 'HPH'], damage: 'each', shifting: false, performance: true },
  SWAT: { ops: ['SKR', 'HAS', 'HSL'], ports: ['PUS', 'KAN', 'SGN', 'LCH', 'BKK'], damage: null, shifting: false, performance: true },
  SWRG: { ops: ['SKR', 'HAS', 'HSL'], ports: ['PUS', 'KAN', 'SGN', 'LCH', 'BKK'], damage: null, shifting: false, performance: true },
  SWSP: { ops: ['SKR', 'HAS', 'HSL'], ports: ['KAN', 'PUS', 'SHA', 'SGN', 'LCH', 'BKK'], damage: null, shifting: true, performance: true },
  SWDN: { ops: ['SKR', 'NSL', 'DJS', 'HAS', 'HSL'], ports: ['INC', 'PUS', 'KAN', 'SGN', 'LCH', 'BKK'], damage: null, shifting: false, performance: true },
  DJCF: { ops: ['SKR', 'NSL', 'DJS', 'HAS', 'HSL'], ports: ['INC', 'PUS', 'KAN', 'SGN', 'LCH', 'BKK'], damage: 'each', shifting: false, performance: true },
  DPRT: { ops: ['SKR', 'NSS', 'DJS', 'HAS', 'HSL', 'KMD'], ports: ['PUS', 'KAN', 'SGN', 'LCH', 'BKK', 'INC'], damage: null, shifting: false, performance: true },
  NSDC: { ops: ['NSL', 'KMD'], ports: ['KAN', 'PUS', 'SHK', 'HKG', 'MNN', 'SGN'], damage: null, shifting: false, performance: true },
  NSFR: { ops: ['NSS', 'KMT', 'DYS'], ports: ['INC', 'XMN', 'SHK', 'HPH', 'HKG'], damage: null, shifting: true, performance: true },
  // OBWH는 바우처형 — variant로 분기 (주간/야간/시간외/휴일 열)
  OBWH: { variant: 'voucher', ops: [], ports: ['YNT'], damage: 'report', shifting: false, performance: false },
};

/** 그 배의 양식. 없으면 null — 호출부가 기본 양식 + 경고 처리 */
export function getTallyFormat(vslCode) {
  return TALLY_FORMATS[String(vslCode || '').toUpperCase().trim()] || null;
}

/** 순서 배열 기준 정렬 인덱스 — 사전에 없는 값은 뒤로(등장 순 유지) */
export function orderIndex(list, v) {
  const i = list.indexOf(v);
  return i === -1 ? 900 + list.length : i;
}
