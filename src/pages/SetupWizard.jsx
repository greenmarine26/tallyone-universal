// TallyUni 0.2: 첫 실행 마법사 — Firebase 접속 설정·회사 정보·최초 관리자를 받아 테넌트를 만든다.
//   왜: 2판에서 Firebase 하드코딩을 걷어냈다(firebase.js). 설정이 없으면 db=null이라
//   App이 hasFirebase() 게이트에서 이 화면만 그린다(로그인·라우팅 전부 건너뜀).
//   완료 시 ① localStorage 2키 저장 ② 입력한 설정으로 보조 앱('wizard')을 띄워 익명 로그인 후 settings·staffList 시딩(0.3)
//   ③ location.reload() — 리로드해야 firebase.js가 모듈 로드 시점에 새 설정을 읽는다.
import React, { useState } from 'react';
import { Anchor, Database, Building2, UserCog, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { SK } from '../utils.js';
import { TENANT_DEFAULTS } from '../tenant.js';

// Firebase 콘솔이 주는 스니펫을 관용적으로 읽는다.
//   `const firebaseConfig = { apiKey: "...", ... };` (JS 객체 리터럴, 키 따옴표 없음)
//   `{ "apiKey": "...", ... }` (JSON, 키 따옴표 있음)
//   둘 다 같은 정규식으로 값만 뽑는다 — JSON.parse에 기대면 JS 리터럴에서 실패한다.
export const FB_KEYS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
export const FB_REQUIRED = ['apiKey', 'databaseURL', 'projectId'];

export function parseFirebaseConfig(text) {
  const src = String(text || '');
  const out = {};
  for (const k of FB_KEYS) {
    const m = src.match(new RegExp('["\']?' + k + '["\']?\\s*[:=]\\s*["\']([^"\']*)["\']'));
    if (m && m[1]) out[k] = m[1].trim();
  }
  return out;
}

/** 모항 코드(UN/LOCODE 5자)에서 별칭 후보를 만든다. KRPTK → ['KRPTK','PTK'] */
export function homePortAliasesFor(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!c) return [];
  const set = new Set([c]);
  if (c.length === 5) set.add(c.slice(2));
  return [...set];
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
  const [step, setStep] = useState(1);
  const [raw, setRaw] = useState('');
  const [cfg, setCfg] = useState(null);
  const [cfgErr, setCfgErr] = useState('');

  const [company, setCompany] = useState('');
  const [companyEn, setCompanyEn] = useState('');
  const [addressEn, setAddressEn] = useState('');
  const [homePort, setHomePort] = useState('');
  const [homePortName, setHomePortName] = useState('');
  const [appTitle, setAppTitle] = useState('');
  const [logo, setLogo] = useState('');
  const [logoErr, setLogoErr] = useState('');

  const [ownerNameIn, setOwnerNameIn] = useState('');
  const [ownerRole, setOwnerRole] = useState('수석검수사');

  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState('');

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

  const handleLogo = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setLogoErr('');
    try { setLogo(await shrinkLogo(f)); }
    catch (err) { setLogoErr(err.message || '로고를 처리하지 못했습니다.'); }
  };

  const step2Ok = company.trim() && /^[A-Za-z]{5}$/.test(homePort.trim().toUpperCase()) && homePortName.trim();
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
      owner: ownerNameIn.trim(),
    };
    if (logo) t.logo = logo;
    return t;
  };

  const handleFinish = async () => {
    if (!cfg || !step2Ok || !step3Ok || busy) return;
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
    //    이름 붙인 앱('wizard')이라 리로드 후 기본 앱과 충돌하지 않는다.
    try {
      const { initializeApp } = await import('firebase/app');
      const { getDatabase, ref, set } = await import('firebase/database');
      const { getAuth, signInAnonymously } = await import('firebase/auth');
      const wApp = initializeApp(cfg, 'wizard');
      // TallyUni 0.3: 보안 규칙 `auth != null` — 시딩 쓰기 전에 이 보조 앱으로도 익명 로그인한다.
      //   실패하면 아래 catch가 받아 기존 실패 문구 경로로 간다(설정은 이미 localStorage에 저장됨).
      await signInAnonymously(getAuth(wApp));
      const wDb = getDatabase(wApp);
      await set(ref(wDb, 'settings'), tcfg);
      await set(ref(wDb, `staffList/${tcfg.owner}`), { name: tcfg.owner, role: ownerRole.trim() || '수석검수사', addedAt: Date.now() });
    } catch (e) {
      // 조용히 실패 금지 — 사유를 보여 주고, 그래도 진행할 수 있게 한다(설정은 이미 저장됨).
      setBusy(false);
      setSaveErr(`서버에 첫 데이터를 심지 못했습니다: ${e && e.message ? e.message : e}\n설정은 이 기기에 저장됐습니다. 인터넷·데이터베이스 규칙을 확인한 뒤 [그래도 시작]을 누르면 앱은 열립니다.`);
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

        {/* ── 1단계 ── */}
        {step === 1 && (
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
            <button
              disabled={!cfg}
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-lg font-bold bg-blue-700 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 text-white"
            >다음 — 회사 정보</button>
          </div>
        )}

        {/* ── 2단계 ── */}
        {step === 2 && (
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
        {step === 3 && (
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
            {saveErr && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-red-300 text-[12px] flex gap-2 whitespace-pre-line">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div>{saveErr}</div>
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
          설정은 이 브라우저와 데이터베이스에 저장됩니다. 다른 기기에서는 같은 설정을 한 번 더 입력하면 됩니다.
        </div>
      </div>
    </div>
  );
}
