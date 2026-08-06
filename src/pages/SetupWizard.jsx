// TallyUni 0.2: 첫 실행 마법사 — Firebase 접속 설정·회사 정보·최초 관리자를 받아 테넌트를 만든다.
//   왜: 2판에서 Firebase 하드코딩을 걷어냈다(firebase.js). 설정이 없으면 db=null이라
//   App이 hasFirebase() 게이트에서 이 화면만 그린다(로그인·라우팅 전부 건너뜀).
//   완료 시 ① localStorage 2키 저장 ② 입력한 설정으로 보조 앱을 띄워 익명 로그인 후 settings·staffList 시딩(0.3)
//   ③ location.reload() — 리로드해야 firebase.js가 모듈 로드 시점에 새 설정을 읽는다.
// TallyUni 0.4: 두 번째 기기 흐름 — 1단계에서 설정을 읽자마자 그 프로젝트의 settings 노드를 먼저 조회한다.
//   이미 다른 기기가 마법사를 마친 회사면 2·3단계를 다시 받을 이유가 없다(회사명·모항·로고를 또 입력하면
//   기기마다 값이 어긋난다). 있으면 DB의 settings를 그대로 tenantCfg로 받아 저장하고 바로 시작한다.
//   이 경로에서는 staffList를 건드리지 않는다 — 두 번째 기기가 기존 소유자의 직책을 덮어쓰면 안 되기 때문.
// TallyUni 0.5: 2단계에서 터미널 목록을 받는다. 그 전까지 터미널은 tenant.js 기본값(PCTC·PNCT)에
//   묶여 있어, 다른 항만 회사가 마법사를 마쳐도 PORT-MIS 화면에 평택 부두 이름이 나왔다.
// TallyUni 0.6: QR 링크(?cfg=)로 접속 설정이 먼저 들어올 수 있다 — 그 결과를 첫 렌더에서 읽는다.
//   관용 파서·보조 앱(FB_KEYS·FB_REQUIRED·parseFirebaseConfig·withWizardApp) 정의는 linkCfg.js로 옮겼다.
//   부팅 게이트(main.jsx)가 마법사보다 먼저 그것들을 써야 해서다 — 내용·동작은 0.5와 같다.
// TallyUni 0.9: 설치가 끝나면 서버가 텅 비어 있지 않다 — 매트릭스 권한자 명단(최초 관리자 1인)과
//   기본 선박 베이사전 씨앗을 함께 심는다. 두 번째 기기 경로(handleUseExisting)는 아무것도
//   심지 않는다 — 그 회사 서버엔 이미 들어 있다.
// TallyUni 0.9-01: 씨앗은 앱이 내려받지 않는다. 회사 자산이라 공개 사이트에 둘 수 없다(검수사 확정).
//   3단계에 [사전 파일 선택(선택 사항)]을 두고, 파일을 고른 그 순간에만 심는다.
//   고르지 않아도 설치는 그대로 끝나며, 사전은 나중에 관리자 버튼으로 심을 수 있다.
import React, { useState } from 'react';
import { Anchor, Database, Building2, UserCog, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { SK } from '../utils.js';
import { TENANT_DEFAULTS } from '../tenant.js';
import { FB_KEYS, FB_REQUIRED, parseFirebaseConfig, withWizardApp, getLinkBoot } from '../linkCfg.js';

// 옛 import 경로(SetupWizard.jsx)를 그대로 두기 위한 재수출 — 단일 소스는 linkCfg.js다.
export { FB_KEYS, FB_REQUIRED, parseFirebaseConfig, withWizardApp };

/** 모항 코드(UN/LOCODE 5자)에서 별칭 후보를 만든다. KRPTK → ['KRPTK','PTK'] */
export function homePortAliasesFor(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!c) return [];
  const set = new Set([c]);
  if (c.length === 5) set.add(c.slice(2));
  return [...set];
}

/** TallyUni 0.5: 터미널 한 줄 입력 → tenantCfg.terminals 배열.
 *   "PCTC, PNCT" → [{ code:'PCTC', name:'PCTC', berths:[] }, { code:'PNCT', ... }]
 *   쉼표로 나누고 · 앞뒤 공백을 버리고 · 대문자로 올리고 · 빈칸과 중복(먼저 쓴 것 유지)을 뺀다.
 *   berths(부두 번호대)는 이번 판에서 비워 둔다 — 지금 소비처(PortMisCaptureModal)는 code·name만 쓴다.
 *   ⚠ RTDB는 빈 배열을 저장하지 않는다. 서버에 심긴 settings.terminals의 각 항목은 berths 없이
 *     {code, name}만 남고, 두 번째 기기는 그걸 그대로 불러온다(칩 렌더는 code·name만 보므로 결과 동일). */
export function parseTerminals(text) {
  const out = [];
  const seen = new Set();
  for (const part of String(text || '').split(',')) {
    const code = part.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: code, berths: [] });
  }
  return out;
}

// 로고를 canvas로 축소해 dataURL로. 150KB를 넘으면 크기·품질을 낮춰 다시 시도.
function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지로 열지 못했습니다.'));
      img.onload = () => {
        try {
          let max = 512;
          let q = 0.9;
          let url = '';
          for (let i = 0; i < 6; i++) {
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * scale));
            cv.height = Math.max(1, Math.round(img.height * scale));
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            url = cv.toDataURL('image/png');
            if (url.length > 150 * 1024) url = cv.toDataURL('image/jpeg', q);
            if (url.length <= 150 * 1024) break;
            max = Math.round(max * 0.75);
            q = Math.max(0.5, q - 0.1);
          }
          resolve(url);
        } catch (e) { reject(e); }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const IN = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-blue-600';
const LB = 'block text-[12px] font-bold text-slate-400 mb-1';

export default function SetupWizard() {
  // TallyUni 0.6: 부팅 게이트(linkCfg.js)가 QR 링크에서 읽어 둔 결과.
  //   step 2 = 설정은 링크로 받았으니 붙여넣기를 건너뛰고 회사 정보부터.
  //   error   = 링크의 설정을 못 읽었다는 한국어 문구 → 1단계에 그대로 띄운다(조용한 실패 금지).
  //   링크가 없던 종전 흐름에서는 step 0 · cfg null · error '' 라 아래 초기값이 0.5와 완전히 같다.
  const lb = getLinkBoot();
  const [step, setStep] = useState(lb.step === 2 ? 2 : 1);
  const [raw, setRaw] = useState(lb.cfg ? JSON.stringify(lb.cfg, null, 2) : '');
  const [cfg, setCfg] = useState(lb.cfg || null);
  const [cfgErr, setCfgErr] = useState(lb.error || '');

  const [company, setCompany] = useState('');
  const [companyEn, setCompanyEn] = useState('');
  const [addressEn, setAddressEn] = useState('');
  const [homePort, setHomePort] = useState('');
  const [homePortName, setHomePortName] = useState('');
  const [appTitle, setAppTitle] = useState('');
  // TallyUni 0.5: 기본값을 미리 채워 둔다 — 그대로 두면 PCTC·PNCT 두 곳으로 시작한다.
  const [terminalsIn, setTerminalsIn] = useState(TENANT_DEFAULTS.terminals.map((t) => t.code).join(', '));
  const [logo, setLogo] = useState('');
  const [logoErr, setLogoErr] = useState('');

  const [ownerNameIn, setOwnerNameIn] = useState('');
  const [ownerRole, setOwnerRole] = useState('수석검수사');

  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  // TallyUni 0.9: 사전 시딩 진행 문구 — 96척을 심는 동안 화면이 멈춘 것처럼 보이면 안 된다.
  const [seedMsg, setSeedMsg] = useState('');
  // TallyUni 0.9-01: 고른 사전 파일을 그 자리에서 읽어 검증해 둔다(설치 버튼을 누른 뒤에
  //   "파일이 깨졌다"를 알게 되면 늦다). seedDoc 이 null 이면 사전 없이 설치가 끝난다.
  const [seedDoc, setSeedDoc] = useState(null);
  const [seedFileErr, setSeedFileErr] = useState('');
  const [seedReading, setSeedReading] = useState(false);

  // TallyUni 0.4: 1단계에서 서버를 먼저 들여다본 결과.
  //   found = DB에 이미 있는 settings(= 다른 기기가 마친 회사 설정), null이면 처음 여는 프로젝트.
  const [probing, setProbing] = useState(false);
  const [probeErr, setProbeErr] = useState('');
  const [found, setFound] = useState(null);

  // ── 1단계: Firebase 설정 붙여넣기 ──
  const handleParse = (text) => {
    setRaw(text);
    setSaveErr('');
    if (!text.trim()) { setCfg(null); setCfgErr(''); return; }
    const c = parseFirebaseConfig(text);
    const missing = FB_REQUIRED.filter((k) => !c[k]);
    if (missing.length > 0) {
      setCfg(null);
      setCfgErr(`필수 항목을 찾지 못했습니다: ${missing.join(', ')}`);
      return;
    }
    setCfg(c);
    setCfgErr('');
  };

  // TallyUni 0.4: 1단계 → 다음. 회사 정보를 받기 전에 그 프로젝트에 settings가 이미 있는지 본다.
  const handleStep1Next = async () => {
    if (!cfg || probing) return;
    setProbing(true);
    setProbeErr('');
    let existing = null;
    try {
      existing = await withWizardApp(cfg, async (wApp) => {
        const { getDatabase, ref, get } = await import('firebase/database');
        const snap = await get(ref(getDatabase(wApp), 'settings'));
        return snap.exists() ? snap.val() : null;
      });
    } catch (e) {
      // 조용히 넘어가면 "회사 정보를 왜 또 묻지" 상태가 된다 — 사유를 보여 주고 새로 설정할 길을 남긴다.
      setProbing(false);
      setProbeErr(`데이터베이스를 확인하지 못했습니다: ${e && e.message ? e.message : e}`);
      return;
    }
    setProbing(false);
    // 회사명이 있어야 사람이 알아볼 수 있는 설정이다. 껍데기만 있으면 처음 여는 것으로 본다.
    if (existing && typeof existing === 'object' && String(existing.company || '').trim()) setFound(existing);
    else setStep(2);
  };

  // TallyUni 0.4: [불러오고 시작] — DB의 settings를 그대로 이 기기의 tenantCfg로 삼는다(로고 포함).
  //   staffList는 손대지 않는다(기존 소유자·직책 보존).
  const handleUseExisting = () => {
    if (!cfg || !found || busy) return;
    setBusy(true);
    setSaveErr('');
    try {
      localStorage.setItem(SK.fbCfg, JSON.stringify(cfg));
      localStorage.setItem(SK.tenantCfg, JSON.stringify(found));
    } catch (e) {
      setBusy(false);
      setSaveErr(`브라우저 저장에 실패했습니다(${e.message}). 시크릿 모드라면 일반 창에서 다시 시도하세요.`);
      return;
    }
    location.reload();
  };

  // TallyUni 0.9-01: 사전 파일을 고른 즉시 읽어 본다. 깨진 파일·빈 파일·다른 JSON 은
  //   여기서 사유가 그대로 드러나고, 심기는 시작조차 하지 않는다(조용한 실패 금지).
  const handleSeedFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    setSeedDoc(null);
    setSeedFileErr('');
    if (!f) return;
    setSeedReading(true);
    try {
      const { readBayDictSeedFile } = await import('../bayDictSeed.js');
      const doc = await readBayDictSeedFile(f);
      setSeedDoc(doc);
    } catch (err) {
      setSeedFileErr((err && err.message) ? err.message : String(err));
    } finally {
      setSeedReading(false);
    }
  };

  const handleLogo = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setLogoErr('');
    try { setLogo(await shrinkLogo(f)); }
    catch (err) { setLogoErr(err.message || '로고를 처리하지 못했습니다.'); }
  };

  // TallyUni 0.5: 터미널은 최소 한 곳. 빈 배열로 저장하면 RTDB가 그 키를 통째로 지워
  //   두 번째 기기는 기본값(PCTC·PNCT)을 불러오게 된다 — 기기마다 부두가 달라지는 사고를 입구에서 막는다.
  const termsParsed = parseTerminals(terminalsIn);
  const step2Ok = company.trim() && /^[A-Za-z]{5}$/.test(homePort.trim().toUpperCase()) && homePortName.trim() && termsParsed.length > 0;
  const step3Ok = /^[가-힣a-zA-Z0-9]{2,10}$/.test(ownerNameIn.trim());

  const buildTenantCfg = () => {
    const port = homePort.trim().toUpperCase();
    const t = {
      company: company.trim(),
      companyEn: (companyEn.trim() || company.trim()).toUpperCase(),
      addressEn: (addressEn.trim() || `${homePortName.trim()}, KOREA`).toUpperCase(),
      appTitle: appTitle.trim() || TENANT_DEFAULTS.appTitle,
      homePort: port,
      homePortAliases: homePortAliasesFor(port),
      homePortName: homePortName.trim(),
      terminals: termsParsed,          // TallyUni 0.5: 마법사 입력이 단일 소스(기본값 PCTC·PNCT)
      owner: ownerNameIn.trim(),
    };
    if (logo) t.logo = logo;
    return t;
  };

  const handleFinish = async () => {
    // TallyUni 0.9-01: 사전 파일을 읽는 중이면 기다린다 — 다 읽기 전에 설치를 끝내면 조용히 안 심긴다.
    if (!cfg || !step2Ok || !step3Ok || busy || seedReading) return;
    setBusy(true);
    setSaveErr('');
    const tcfg = buildTenantCfg();
    // ① localStorage 먼저 — 서버 시딩이 실패해도 앱은 이 설정으로 뜬다(오프라인 허용).
    try {
      localStorage.setItem(SK.fbCfg, JSON.stringify(cfg));
      localStorage.setItem(SK.tenantCfg, JSON.stringify(tcfg));
    } catch (e) {
      setBusy(false);
      setSaveErr(`브라우저 저장에 실패했습니다(${e.message}). 시크릿 모드라면 일반 창에서 다시 시도하세요.`);
      return;
    }
    // ② 입력한 설정으로 보조 앱을 띄워 서버에 첫 데이터를 심는다.
    //    기본 앱과 다른 이름이라 리로드 후 충돌하지 않는다. 끝나면 withWizardApp이 세션을 정리한다(0.4).
    //    TallyUni 0.9: 여기서 베이사전 씨앗까지 심는다. 씨앗 실패는 설치를 막지 않는다(아래 seedWarn).
    let seedWarn = '';
    try {
      await withWizardApp(cfg, async (wApp) => {
        const { getDatabase, ref, set, update } = await import('firebase/database');
        const wDb = getDatabase(wApp);
        setSeedMsg('회사 설정을 심는 중…');
        await set(ref(wDb, 'settings'), tcfg);
        // TallyUni 0.4: set → update. set은 그 사람 노드를 통째로 갈아엎어서, 앱 안에서 붙은
        //   다른 필드(직책 변경·부가 정보)가 마법사를 다시 돌릴 때마다 사라졌다.
        await update(ref(wDb, `staffList/${tcfg.owner}`), { name: tcfg.owner, role: ownerRole.trim() || '수석검수사', addedAt: Date.now() });
        // TallyUni 0.9 ⓐ: 매트릭스 권한자 명단을 최초 관리자로 명시 시딩.
        //   전까지는 명단 노드가 없어 fbGetMatrixEditors가 tenant().owner로 늦게 시딩했고,
        //   그 사이 화면들은 폴백 판정으로 돌았다. 설치 순간 명단이 있는 편이 분명하다.
        await set(ref(wDb, 'matrix_editors'), [tcfg.owner]);
        // TallyUni 0.9 ⓑ: 기본 선박 사전(씨앗)을 ship_bay_dict_v3에 심는다.
        //   TallyUni 0.9-01: 3단계에서 파일을 고른 경우에만. 안 골랐으면 그냥 건너뛴다 —
        //   설치를 막지 않고, 사전은 나중에 [선박] 탭 → 베이사전 라이브러리 →
        //   🌱 기본 사전 가져오기 로 심을 수 있다.
        if (seedDoc) {
          try {
            const { chunkShips } = await import('../bayDictSeed.js');
            const parts = chunkShips(seedDoc.ships, 25);
            let done = 0;
            for (const part of parts) {
              await update(ref(wDb, 'ship_bay_dict_v3'), part);
              done += Object.keys(part).length;
              setSeedMsg(`기본 선박 사전 심는 중… ${done}/${seedDoc.codes.length}척`);
            }
            setSeedMsg(`기본 선박 사전 ${done}척 등록 완료`);
          } catch (se) {
            seedWarn = (se && se.message) ? se.message : String(se);
            console.warn('[SetupWizard] 베이사전 씨앗 심기 실패 — 설치는 계속한다', se);
            setSeedMsg('');
          }
        }
      });
    } catch (e) {
      // 조용히 실패 금지 — 사유를 보여 주고, 그래도 진행할 수 있게 한다(설정은 이미 저장됨).
      setBusy(false);
      setSeedMsg('');
      setSaveErr(`서버에 첫 데이터를 심지 못했습니다: ${e && e.message ? e.message : e}\n설정은 이 기기에 저장됐습니다. 인터넷·데이터베이스 규칙을 확인한 뒤 [그래도 시작]을 누르면 앱은 열립니다.`);
      return;
    }
    if (seedWarn) {
      // 설치는 끝났다. 다만 사전이 비었다는 사실을 감추지 않는다.
      setBusy(false);
      setSaveErr(`설치는 끝났습니다. 다만 기본 선박 사전을 심지 못했습니다: ${seedWarn}\n[그래도 시작]을 누르면 앱은 정상으로 열립니다. 사전은 나중에 [선박] 탭 → 베이사전 라이브러리 → 🌱 기본 사전 가져오기 로 심을 수 있습니다.`);
      return;
    }
    location.reload();
  };

  const StepDot = ({ n, label, icon: Icon }) => (
    <div className={`flex items-center gap-1.5 ${step === n ? 'text-blue-300' : step > n ? 'text-emerald-400' : 'text-slate-600'}`}>
      {step > n ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      <span className="text-[11px] font-bold">{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md flex-1 flex flex-col">
        <div className="flex flex-col items-center mb-5 mt-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-800 to-blue-950 border border-blue-600/50 flex items-center justify-center shadow-lg shadow-blue-950/60 mb-3">
            <Anchor className="w-9 h-9 text-blue-300" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-blue-100">첫 실행 설정</h1>
          <div className="text-[12px] text-slate-400 mt-1">이 앱을 우리 회사 것으로 만듭니다 · 한 번만 하면 됩니다</div>
        </div>

        <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 mb-4">
          <StepDot n={1} label="데이터베이스" icon={Database} />
          <StepDot n={2} label="회사 정보" icon={Building2} />
          <StepDot n={3} label="최초 관리자" icon={UserCog} />
        </div>

        {/* ── TallyUni 0.4: 이미 있는 회사 설정을 찾은 경우 — 2·3단계를 건너뛰는 갈림길 ── */}
        {found && (
          <div className="space-y-3">
            <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-3">
              <div className="text-emerald-300 font-bold text-[13px] mb-1">기존 회사 설정을 찾았습니다</div>
              <div className="text-slate-200 text-[15px] font-black">{found.company}</div>
              <div className="text-[11px] text-slate-400 mt-2 space-y-0.5">
                {found.homePortName && <div>모항 · {found.homePortName} ({found.homePort})</div>}
                {found.appTitle && <div>앱 이름 · {found.appTitle}</div>}
                {found.owner && <div>소유자 · {found.owner}</div>}
              </div>
              {found.logo && <img src={found.logo} alt="회사 로고" className="mt-2 h-14 object-contain bg-slate-900 rounded border border-slate-800 p-1" />}
            </div>
            <div className="text-[12px] text-slate-400 leading-relaxed bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              다른 기기에서 이미 설정을 마친 회사입니다. 불러오면 회사 정보·모항·로고를 다시 입력하지 않아도 되고,
              직원 명단도 그대로 씁니다.
            </div>
            {saveErr && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-red-300 text-[12px] flex gap-2 whitespace-pre-line">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div>{saveErr}</div>
              </div>
            )}
            <button disabled={busy} onClick={handleUseExisting}
                    className="w-full py-3 rounded-lg font-bold bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-white">
              {busy ? '불러오는 중…' : '불러오고 시작'}
            </button>
            <button onClick={() => { setFound(null); setStep(2); }}
                    className="w-full py-2 rounded-lg font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-[12px]">
              새로 설정 — 회사 정보를 다시 입력합니다
            </button>
          </div>
        )}

        {/* ── 1단계 ── */}
        {!found && step === 1 && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-400 leading-relaxed bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              Firebase 콘솔 → 프로젝트 설정 → 내 앱 → <b className="text-slate-200">firebaseConfig</b> 부분을 통째로 복사해 아래에 붙여넣으세요.
              <br />Realtime Database를 만들어 둬야 <b className="text-amber-300">databaseURL</b>이 나옵니다.
            </div>
            <textarea
              className={`${IN} h-44 font-mono text-[11px] leading-relaxed`}
              placeholder={'const firebaseConfig = {\n  apiKey: "AIza...",\n  authDomain: "myco.firebaseapp.com",\n  databaseURL: "https://myco-default-rtdb.firebasedatabase.app",\n  projectId: "myco",\n  storageBucket: "myco.firebasestorage.app",\n  messagingSenderId: "1234567890",\n  appId: "1:1234:web:abcd"\n};'}
              value={raw}
              onChange={(e) => handleParse(e.target.value)}
            />
            {cfgErr && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-red-300 text-[12px] flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div>{cfgErr}</div>
              </div>
            )}
            {cfg && (
              <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-3 text-[11px] font-mono space-y-0.5">
                <div className="text-emerald-300 font-bold font-sans text-[12px] mb-1">✓ 읽었습니다</div>
                {FB_KEYS.filter((k) => cfg[k]).map((k) => (
                  <div key={k} className="text-slate-400 truncate">
                    <span className="text-slate-500">{k}</span> : <span className="text-slate-200">{k === 'apiKey' ? `${cfg[k].slice(0, 8)}…` : cfg[k]}</span>
                  </div>
                ))}
              </div>
            )}
            {probeErr && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-red-300 text-[12px] flex gap-2 whitespace-pre-line">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div>{probeErr}</div>
              </div>
            )}
            <button
              disabled={!cfg || probing}
              onClick={handleStep1Next}
              className="w-full py-3 rounded-lg font-bold bg-blue-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 text-white"
            >{probing ? '데이터베이스 확인 중…' : '다음 — 회사 정보'}</button>
            {probeErr && (
              <button onClick={() => { setProbeErr(''); setStep(2); }}
                      className="w-full py-2 rounded-lg font-bold bg-amber-800 hover:bg-amber-700 text-amber-100 text-[12px]">
                그래도 계속 — 새로 설정하기
              </button>
            )}
          </div>
        )}

        {/* ── 2단계 ── */}
        {!found && step === 2 && (
          <div className="space-y-3">
            <div>
              <label className={LB}>회사명 (한글) *</label>
              <input className={IN} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예: 그린마린" />
            </div>
            <div>
              <label className={LB}>회사명 (영문) — 보고서 머리글</label>
              <input className={IN} value={companyEn} onChange={(e) => setCompanyEn(e.target.value)} placeholder="예: GREEN MARINE CO., LTD." />
            </div>
            <div>
              <label className={LB}>주소 (영문) — 보고서 머리글</label>
              <input className={IN} value={addressEn} onChange={(e) => setAddressEn(e.target.value)} placeholder="예: PYEONGTAEK, KOREA" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LB}>모항 코드 (UN/LOCODE 5자) *</label>
                <input className={`${IN} uppercase font-mono`} maxLength={5} value={homePort}
                       onChange={(e) => setHomePort(e.target.value.toUpperCase())} placeholder="KRPTK" />
              </div>
              <div>
                <label className={LB}>모항 이름 *</label>
                <input className={IN} value={homePortName} onChange={(e) => setHomePortName(e.target.value)} placeholder="평택" />
              </div>
            </div>
            <div>
              <label className={LB}>터미널 (쉼표로 구분) *</label>
              <input className={`${IN} uppercase`} value={terminalsIn}
                     onChange={(e) => setTerminalsIn(e.target.value)} placeholder="PCTC, PNCT" />
              <div className="text-[11px] mt-1 leading-relaxed">
                <span className="text-slate-500">우리 회사가 검수하는 부두·터미널 이름입니다. PORT-MIS 화면의 부두별 집계에 씁니다.</span>
                {termsParsed.length > 0
                  ? <span className="text-slate-400"> — {termsParsed.length}곳: {termsParsed.map((t) => t.code).join(' · ')}</span>
                  : <span className="text-amber-400"> — 한 곳 이상 입력하세요.</span>}
              </div>
            </div>
            <div>
              <label className={LB}>앱 이름 — 화면 상단·제목</label>
              <input className={IN} value={appTitle} onChange={(e) => setAppTitle(e.target.value)} placeholder={TENANT_DEFAULTS.appTitle} />
            </div>
            <div>
              <label className={LB}>회사 로고 (선택)</label>
              <label className="flex items-center gap-2 bg-slate-900 border border-slate-700 border-dashed rounded-lg px-3 py-3 cursor-pointer hover:border-slate-600">
                <ImageIcon className="w-4 h-4 text-slate-500" />
                <span className="text-[12px] text-slate-400">{logo ? '로고 바꾸기' : '이미지 선택 (512px로 자동 축소)'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              </label>
              {logo && <img src={logo} alt="로고 미리보기" className="mt-2 h-16 object-contain bg-slate-900 rounded border border-slate-800 p-1" />}
              {logoErr && <div className="text-[11px] text-red-400 mt-1">{logoErr}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="px-4 py-3 rounded-lg font-bold bg-slate-800 hover:bg-slate-700 text-slate-200">뒤로</button>
              <button disabled={!step2Ok} onClick={() => setStep(3)}
                      className="flex-1 py-3 rounded-lg font-bold bg-blue-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 text-white">
                다음 — 최초 관리자
              </button>
            </div>
          </div>
        )}

        {/* ── 3단계 ── */}
        {!found && step === 3 && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-400 leading-relaxed bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              앱의 <b className="text-slate-200">소유자</b>가 될 사람입니다. 권한을 회수할 수 없고, 직원 명단·매트릭스 권한을 관리합니다.
              나머지 직원은 이 사람이 앱 안에서 추가합니다.
            </div>
            <div>
              <label className={LB}>이름 *</label>
              <input className={IN} value={ownerNameIn} onChange={(e) => setOwnerNameIn(e.target.value)} placeholder="한글/영문 2~10자" />
            </div>
            <div>
              <label className={LB}>직책</label>
              <input className={IN} value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} placeholder="수석검수사" />
            </div>
            {/* TallyUni 0.9-01: 기본 선박 사전 파일 — 회사 자산이라 앱이 내려받지 않는다. 받은 파일을 여기서 고른다. */}
            <div>
              <label className={LB}>기본 선박 사전 파일 (선택 사항)</label>
              <label className="flex items-center gap-2 bg-slate-900 border border-slate-700 border-dashed rounded-lg px-3 py-3 cursor-pointer hover:border-slate-600">
                <Database className="w-4 h-4 text-slate-500" />
                <span className="text-[12px] text-slate-400">
                  {seedReading ? '사전 파일을 읽는 중…' : seedDoc ? `사전 파일 바꾸기 — ${seedDoc.fileName}` : '사전 파일 선택 (ship_bay_dict_seed.json)'}
                </span>
                <input type="file" accept=".json,application/json" className="hidden" onChange={handleSeedFile} />
              </label>
              {seedDoc && (
                <div className="text-[11px] text-emerald-300 mt-1">
                  ✓ 선박 {seedDoc.codes.length}척 확인 (베이 정의 있는 것 {seedDoc.withBays}척) — 설치할 때 저장소에 심습니다.
                </div>
              )}
              {seedFileErr && (
                <div className="text-[11px] text-red-400 mt-1 whitespace-pre-line">⛔ {seedFileErr}</div>
              )}
              {!seedDoc && !seedFileErr && (
                <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  회사가 따로 받은 기본 선박 사전 파일입니다. <b className="text-slate-400">고르지 않아도 설치는 끝납니다</b> — 나중에
                  [선박] 탭 → 베이사전 라이브러리 → 🌱 기본 사전 가져오기 에서 심을 수 있습니다.
                </div>
              )}
            </div>
            {saveErr && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-red-300 text-[12px] flex gap-2 whitespace-pre-line">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div>{saveErr}</div>
              </div>
            )}
            {seedMsg && (
              <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-3 text-emerald-300 text-[12px]">
                {seedMsg}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="px-4 py-3 rounded-lg font-bold bg-slate-800 hover:bg-slate-700 text-slate-200">뒤로</button>
              <button disabled={!step3Ok || busy} onClick={handleFinish}
                      className="flex-1 py-3 rounded-lg font-bold bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-white">
                {busy ? '설정 저장 중…' : '설정 마치고 시작'}
              </button>
            </div>
            {saveErr && (
              <button onClick={() => location.reload()} className="w-full py-2 rounded-lg font-bold bg-amber-800 hover:bg-amber-700 text-amber-100 text-[12px]">
                그래도 시작 (이 기기 설정으로 열기)
              </button>
            )}
          </div>
        )}

        <div className="mt-auto pt-6 text-center text-[10px] text-slate-600 leading-relaxed">
          설정은 이 브라우저와 데이터베이스에 저장됩니다. 다른 기기에서는 1단계의 Firebase 설정만 붙여넣으면 나머지는 서버에서 불러옵니다.
        </div>
      </div>
    </div>
  );
}
