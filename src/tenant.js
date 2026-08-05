// 테넌트 설정 단일 소스 — 회사·모항·터미널. 기본값=그린마린(테넌트1), 오버라이드=window.__TENANT_OVERRIDE (판2 마법사·시뮬용)
export const TENANT_DEFAULTS = {
  company: '그린마린',
  companyEn: 'GREEN MARINE CO., LTD.',
  addressEn: 'PYEONGTAEK, KOREA',
  appTitle: 'TallyOne',
  homePort: 'KRPTK',
  homePortAliases: ['KRPTK', 'PTK'],
  homePortName: '평택',
  terminals: [
    { code: 'PCTC', name: 'PCTC', berths: [6, 7, 8, 9] },
    { code: 'PNCT', name: 'PNCT', berths: [13, 14, 15, 16] },
  ],
};
export function tenant() {
  const o = (typeof window !== 'undefined' && window.__TENANT_OVERRIDE) || (typeof globalThis !== 'undefined' && globalThis.__TENANT_OVERRIDE) || null;
  return o ? { ...TENANT_DEFAULTS, ...o } : TENANT_DEFAULTS;
}
