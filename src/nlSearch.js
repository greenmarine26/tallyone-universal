// 자연어 검색 파서 (M3.3)
//  - M1.x: 사이즈/F·E/특수화물/온도/통계
//  - M3.2: 베이/POL/POD/구역/무게/UN/Class
//  - M3.3 신규: 베이 용량(capacity), 베이별 분포(bayBreakdown),
//               진행 상황(progress: done/pending),
//               베이 단수(stack), 바닥/꼭대기(bottom/top), 빈자리(vacant)
import { isoToLabel, fmtPos, normalizeBay, formatWt, isReeferContainer, isPyeongtaekPort, APP_VERSION } from './utils.js';

// ─── 항구 코드 매핑 ───
const PORT_KR_TO_CODE = {
  '평택': 'KRPTK', '인천': 'KRINC', '부산': 'KRPUS', '광양': 'KRKAN',
  '울산': 'KRUSN', '여수': 'KRYOS', '군산': 'KRKUV', '목포': 'KRMOK',
  '대련': 'CNDLC', '청도': 'CNQDG', '위해': 'CNWEI', '상해': 'CNSHA',
  '천진': 'CNTSN', '닝보': 'CNNGB', '연태': 'CNYAT', '연운항': 'CNLYG',
  '하문': 'CNXMN', '광주': 'CNCAN', '심천': 'CNSZN', '홍콩': 'HKHKG',
  '도쿄': 'JPTYO', '요코하마': 'JPYOK', '오사카': 'JPOSA', '나고야': 'JPNGO',
  '고베': 'JPUKB', '하카타': 'JPHKT',
  '카오슝': 'TWKHH', '타이베이': 'TWTPE', '키룽': 'TWKEL',
  '싱가포르': 'SGSIN', '호치민': 'VNSGN', '하이퐁': 'VNHPH',
  '방콕': 'THBKK', '레캄방': 'THLCH', '클랑': 'MYPKG',
  '마닐라': 'PHMNL', '자카르타': 'IDJKT',
  '엘에이': 'USLAX', 'la': 'USLAX', 'lax': 'USLAX',
  '롱비치': 'USLGB', '뉴욕': 'USNYC', '시애틀': 'USSEA', '오클랜드': 'USOAK',
  '함부르크': 'DEHAM', '로테르담': 'NLRTM', '안트워프': 'BEANR',
};
const PORT_CODE_TO_KR = Object.fromEntries(
  Object.entries(PORT_KR_TO_CODE).map(([k, v]) => [v, k])
);
const PORT_CODE3_TO_KR = {
  'PTK': '평택', 'INC': '인천', 'PUS': '부산', 'KAN': '광양',
  'DLC': '대련', 'QDG': '청도', 'WEI': '위해', 'SHA': '상해',
  'TSN': '천진', 'NGB': '닝보', 'YAT': '연태', 'LYG': '연운항',
  'XMN': '하문', 'TAO': '청도',
  'TYO': '도쿄', 'YOK': '요코하마', 'OSA': '오사카',
  'KHH': '카오슝', 'SIN': '싱가포르', 'SGN': '호치민',
  'LAX': '엘에이', 'NYC': '뉴욕', 'HAM': '함부르크',
};
function findPortCode(text) {
  const t = String(text).toLowerCase();
  const krSorted = Object.keys(PORT_KR_TO_CODE).sort((a, b) => b.length - a.length);
  for (const kr of krSorted) {
    if (t.includes(kr.toLowerCase())) return PORT_KR_TO_CODE[kr];
  }
  const m5 = String(text).toUpperCase().match(/\b([A-Z]{2}[A-Z]{3})\b/);
  if (m5) return m5[1];
  const m3 = String(text).toUpperCase().match(/\b([A-Z]{3})\b/);
  if (m3 && PORT_CODE3_TO_KR[m3[1]]) return m3[1];
  return null;
}
export function portToKr(code) {
  if (!code) return '';
  const upper = String(code).toUpperCase();
  if (PORT_CODE_TO_KR[upper]) return PORT_CODE_TO_KR[upper];
  const tail3 = upper.slice(-3);
  if (PORT_CODE3_TO_KR[tail3]) return PORT_CODE3_TO_KR[tail3];
  return upper;
}

// ─── 메인 파서 ───
export function parseNaturalQuery(text) {
  const result = {
    digits: '', size: null, fe: null, type: null, temp: null,
    bay: null, pol: null, pod: null, portAny: null, zone: null,
    dgClass: null, un: null,
    weightMin: null, weightMax: null, weightSum: false,
    capacityQuery: false, bayBreakdown: false,
    progressQuery: null,        // 'done' | 'pending'
    tierStackQuery: false,
    bottomQuery: false, topQuery: false,
    vacantQuery: false,
    posQuery: false, listQuery: false, bayDistQuery: false, briefingQuery: false, sealAuditQuery: false,
    bayTrio: null,   // V8.03-01: 짝수 베이+구역 = 트리오(23·24·25) 전체
    introQuery: false, timeQuery: false, weatherQuery: false, schedQuery: false,   // V7.92: 챗봇형 질문
    shipIntroQuery: false,   // V9.18: 선박 소개·이름 유래
    twinCheckQuery: false,   // V7.93: 트윈 작업 가능 여부 (무게)
    tierPlaceCountQuery: null,   // V7.99-10: 'hold'|'deck' — "홀드 몇 개 남았어"(에 없음) = 작업 남은 단(곳) 개수+베이 나열
    tierInContextQuery: null,    // V7.99-10: 'hold'|'deck' — "홀드에 몇 개 남았어"(에 있음) = 현재 작업 중인 단 컨 수
    etaQuery: false,             // V7.99-15: "몇 시에 끝나?" — 완료 페이스로 예상 완료 시각 계산(대화체)
    customsReportQuery: false,   // V7.99-16: "양하신고할까?" — 그날 이상 건(누락/초과/바뀜/리씰/실오류) 정리
    handoverQuery: false,        // V8.00: "인수인계" — 남은 작업+양하신고+특이사항 정리 (되묻기 2단계)
    isAll: false, isStat: false, mode: null,
  };
  if (!text) return result;
  const t = String(text).toLowerCase();

  // 컨텍스트 우선 체크 (digits 추출 제외용)
  const hasTempCtx = /도\s|도$|°|온도|영하|영상|마이너스|temperature|reefer|리퍼|냉장|냉동/i.test(t);
  const hasBayCtx = /베이|bay/i.test(t) || /(?:^|\s)\d{1,2}\s*번(?![호])/.test(t);  // V7.99-13: "N번"도 베이 맥락
  const hasUnCtx = /\bun\s*\d|유엔\s*\d/i.test(t);
  const hasClassCtx = /클래스|class|급/i.test(t);
  const hasSizeCtx = /\d+\s*(피트|hc|ft)/i.test(t);
  const hasWeightCtx = /\d+\s*(톤|t|ton)\s*(?:이상|이하|넘는|미만|초과)/i.test(t);
  const hasStackCtx = /\d+\s*(단|층)/i.test(t);
  const skipDigits = hasTempCtx || hasBayCtx || hasUnCtx || hasClassCtx ||
                     hasSizeCtx || hasWeightCtx || hasStackCtx;
  if (!skipDigits) {
    const digits = String(text).replace(/\D/g, '');
    if (digits.length >= 2) result.digits = digits.slice(-4);
  }

  // 사이즈
  if (/45\s*(피트|hc|ft)/i.test(t)) result.size = '45';
  else if (/40\s*(피트|hc|ft)/i.test(t)) result.size = '40';
  else if (/20\s*(피트|ft)/i.test(t)) result.size = '20';

  // F/E
  if (/풀|적컨|적재|loaded/i.test(t)) result.fe = 'F';
  else if (/\bfull\b/i.test(t)) result.fe = 'F';
  else if (/엠티|공컨|빈\s*컨/i.test(t)) result.fe = 'E';   // V7.91-02: '빈 컨테이너' 추가
  else if (/\bempty\b|\bmt\b/i.test(t)) result.fe = 'E';

  // 특수 화물
  if (/리퍼|reefer|냉장|냉동/i.test(t) || /\brf\b/i.test(t)) result.type = 'rf';
  else if (/위험물|hazmat|imdg/i.test(t) || /\bdg\b/i.test(t)) result.type = 'dg';
  else if (/엑스레이|x[\s.\-]*ray|xray/i.test(t)) result.type = 'xray';
  else if (/탱크|tank/i.test(t) || /\btk\b/i.test(t)) result.type = 'tk';
  else if (/플랫\s*랙|flat\s*rack/i.test(t) || /\bfr\b/i.test(t)) result.type = 'fr';
  else if (/오픈\s*탑|open\s*top/i.test(t) || /\bot\b/i.test(t)) result.type = 'ot';
  else if (/\boog\b|아웃\s*오브\s*게이지/i.test(t)) result.type = 'oog';
  // V9.56: RO/RO 겸용선(RZOR) — 크레인으로 검수하는 건 갠트리(落地) 분뿐이다.
  //   선사 표현 그대로 "갠트리 40van" 이라 부른다. 섀시분은 램프로 굴려 나가 검수 대상이 아니다.
  else if (/갠트리|gantry|락지|落地|크레인\s*작업|로로\s*제외/i.test(t)) result.type = 'lolo';
  else if (/双背|쌍배|2단\s*적재|이단\s*적재/i.test(t)) result.type = 'dbl';

  // 베이 번호
  let bayMatch = t.match(/(\d{1,3})\s*번?\s*베이/);
  if (!bayMatch) bayMatch = t.match(/베이\s*(\d{1,3})/);
  if (!bayMatch) bayMatch = t.match(/\bbay\s*(\d{1,3})/i);
  // V7.99-13: "20번에 몇 개" — '베이' 단어가 없어도 "N번"(1~2자리 + '번')을 베이로 인식.
  //   현장에서 "20번 데크" "18번에" 처럼 '번'만 붙여 묻는 경우가 많음. 3자리 이상은 컨번호 끝자리와
  //   혼동 위험이 있어 2자리까지만(베이는 보통 1~99). 끝4자리 조회는 4자리라 구분됨.
  if (!bayMatch) bayMatch = t.match(/(?:^|\s)(\d{1,2})\s*번(?![호])/);  // "2번" O, "2번호" X(호기)
  if (bayMatch) result.bay = normalizeBay(bayMatch[1]);

  // POL/POD
  let polCode = null, podCode = null, portCode = null;
  if (/(?:\bpol\b|선적항|출발항|출항지)/i.test(t)) {
    polCode = findPortCode(t);
  } else {
    const polMatch = t.match(/([가-힣]{2,4})\s*(?:에서|발(?:\b|\s)|출발)/);
    if (polMatch) polCode = findPortCode(polMatch[1]);
  }
  if (/(?:\bpod\b|양하항|도착항|도착지)/i.test(t)) {
    podCode = findPortCode(t);
  } else {
    const podMatch = t.match(/([가-힣]{2,4})\s*(?:행(?:\b|\s|$)|가는|도착)/);
    if (podMatch) podCode = findPortCode(podMatch[1]);
  }
  if (!polCode && !podCode) portCode = findPortCode(t);
  result.pol = polCode; result.pod = podCode; result.portAny = portCode;

  // 구역
  if (/갑판|데크|deck/i.test(t)) result.zone = 'deck';   // V7.91-02: '데크' 한글 추가
  else if (/창내|선창|hold|홀드/i.test(t)) result.zone = 'hold';

  // V8.03-01 (오답 [5]): "24번 홀드/데크"처럼 짝수 베이 + 구역을 함께 물으면
  //   23·24·25 트리오 전체를 뜻한다(검수사 메모). 홀수(23·25)는 진짜 개별 홀드.
  //   짝수 베이 + zone 명시일 때만 트리오로 확장. (단순 끝4자리 조회와 충돌 없음)
  if (result.bay && result.zone) {
    const b = parseInt(result.bay, 10);
    if (Number.isFinite(b) && b % 2 === 0) {
      result.bayTrio = [String(b - 1).padStart(2, '0'), result.bay, String(b + 1).padStart(2, '0')];
    }
  }

  // DG 클래스 / UN
  const clsMatch = t.match(/(?:클래스|class|급)\s*(\d(?:\.\d)?)/i);
  if (clsMatch) {
    result.dgClass = clsMatch[1];
    if (!result.type) result.type = 'dg';
  }
  const unMatch = t.match(/(?:un|유엔)\s*(\d{3,4})/i);
  if (unMatch) {
    result.un = unMatch[1];
    if (!result.type) result.type = 'dg';
  }

  // M3.3: 용량/수용 (mode 무시)
  const isCapacityQ = /실을\s*수\s*있|싣을\s*수|적재\s*가능|수용|용량|최대\s*적재|얼마나\s*실|몇\s*(개|대)\s*실/i.test(t);
  if (isCapacityQ) result.capacityQuery = true;

  // V8.00: 인수인계 — "인수인계", "인계 자료", "다음 검수사에게 넘겨", "교대"
  //   남은 작업 + (양하 남으면)신고할 것 + 특이사항을 한 화면에. customs보다 먼저.
  if (/인수\s*인계|인계\s*(?:자료|서|할|해|준비|내용)|넘겨야|넘겨\s*줘|교대|다음\s*검수사|다음\s*사람|작업\s*마무리\s*못/i.test(t)) {
    result.handoverQuery = true;
  }

  // V7.99-16: 양하신고 점검 — "양하신고할까?", "신고할까", "세관 신고", "이상 건"
  //   그날 발생한 이상(누락/초과/바뀜/리씰/실오류)을 모아 신고서 작성용으로 정리.
  if (/양하\s*신고|신고\s*(?:할|하|준비|점검|목록|항목)|세관\s*(?:신고|보고)|이상\s*(?:건|사항|있|발생)|특이\s*(?:사항|점|건)\s*(?:있|없|뭐|정리|알려)?|문제\s*(?:있|발생|생긴)|신고\s*리스트|신고서/i.test(t)) {
    result.customsReportQuery = true;
  }

  // V7.99-15: 완료 예정 시각 — "몇 시에 끝나?", "언제 끝나?", "이 속도면 얼마나?"
  //   시간·완료시각 의도가 분명할 때만 (그냥 "몇 개 남았어"는 progress='pending'로 둠).
  //   진행 페이스(완료 타임스탬프)로 남은 시간·완료 시각을 계산해 대화체로 답한다.
  if (/몇\s*시(?:에|쯤|까지|쯤에|즈음)*\s*(?:끝|완료|마|종료)|언제\s*(?:끝|완료|마치|다\s*돼|다\s*해)|끝나(?:는|나|려|)\s*(?:시간|시각|시|때)?|완료\s*(?:예상|예정|시각|시간)|이\s*(?:속도|페이스)|얼마나\s*(?:걸|남았.*끝|더.*걸)|몇\s*시간\s*(?:남|걸|더)|예상\s*(?:완료|종료|시간)|퇴근|점심.*(?:전|까지).*(?:끝|돼)/i.test(t)) {
    result.etaQuery = true;
    result.timeQuery = false;   // V8.03-01: "끝/완료" 의도면 현재 시각이 아니라 종료 추정으로 (오답 [4])
  }

  // M3.3: 진행 상황
  if (/들어갔|들어간|들어가\s*있|실었|실은|올라\s*간|올라간|쌓은|쌓았|쌓았지|완료\s*된|완료된|완료\s*몇|완료\s*된\s*거|완료\s*컨|끝낸|끝난|마친|마쳤|내렸|내린\s*거|다\s*했|다\s*됐|다\s*끝/i.test(t)) {   // V7.91-02: 내렸·다 했 추가
    result.progressQuery = 'done';
  } else if (/남았|남은|안\s*한|안한|더\s*해야|더\s*들어가|더\s*실어|더\s*해|얼마나\s*남|할\s*일|미완료|남아|남나/i.test(t)) {
    result.progressQuery = 'pending';
  }

  // M3.3: 단수
  if (/몇\s*(단|층)|단수|층수|몇\s*(단|층)\s*까지/i.test(t)) result.tierStackQuery = true;

  // M3.3: 바닥/꼭대기
  if (/바닥|맨\s*아래|제일\s*아래|최저\s*단|최저단/i.test(t)) result.bottomQuery = true;
  if (/꼭대기|맨\s*위|제일\s*위|최상\s*단|최상단/i.test(t)) result.topQuery = true;

  // M3.3: 빈자리
  if (/빈\s*자리|빈자리|빈\s*슬롯|빈\s*위치|빈\s*칸|비어\s*있|비어있|비\s*어\s*있|empty\s*slot/i.test(t)) {
    result.vacantQuery = true;
  }

  // 베이별 분포
  if (/베이별|베이\s*마다|베이\s*분포|각\s*베이/i.test(t)) result.bayBreakdown = true;

  // 양하/선적 모드 (capacity/vacant 질문에서는 무시)
  if (!result.capacityQuery && !result.vacantQuery) {
    if (/양하|discharge|내리는|내릴|언로딩/i.test(t)) result.mode = 'discharge';
    else if (/선적|loading|싣는|로딩/i.test(t)) result.mode = 'loading';
    else if (/실을|실은|실었/i.test(t) && !result.progressQuery) {
      result.mode = 'loading';
    }
  }

  // 무게
  const wtGteMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:톤|t|ton)\s*(?:이상|넘는|초과|over)/i);
  if (wtGteMatch) result.weightMin = parseFloat(wtGteMatch[1]) * 1000;
  const wtLteMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:톤|t|ton)\s*(?:이하|미만|under|below)/i);
  if (wtLteMatch) result.weightMax = parseFloat(wtLteMatch[1]) * 1000;
  if (/무게\s*합|총중량|총\s*무게|중량\s*합/i.test(t)) result.weightSum = true;

  // 위치/리스트 의도
  // V7.99-10 (메모6 수동): "홀드/데크" 개수 질문 — "에" 유무로 의미가 갈림.
  //   "홀드에 몇 개" = 현재 작업 중인 단의 컨 수 (tierInContextQuery, 맥락 의존)
  //   "홀드 몇 개"   = 작업 남은 단이 몇 곳인지 + 베이 나열 (tierPlaceCountQuery)
  //   먼저 평가해 bayDist/isStat 등 다른 의도보다 우선. 숫자 베이 명시("20번 홀드")는 제외(기존 처리).
  if (!/\d+\s*번/.test(t) && /(개|군데|곳)/.test(t) && /(남았|남은|남아|남나)/.test(t)) {
    if (/홀드에|홀드\s*에|선창에/.test(t)) result.tierInContextQuery = 'hold';
    else if (/데크에|데크\s*에|갑판에/.test(t)) result.tierInContextQuery = 'deck';
    else if (/홀드|선창/.test(t)) result.tierPlaceCountQuery = 'hold';
    else if (/데크|갑판/.test(t)) result.tierPlaceCountQuery = 'deck';
  }
  // V7.90-02: 베이 분포 질문 — "리퍼가 몇 번 베이에 있어?" / "어디 어디에 있어?" (사용자 현장 제보)
  if (/몇\s*번\s*베이|어느\s*베이|무슨\s*베이|어떤\s*베이|어디\s*어디|베이\s*별/i.test(t)) result.bayDistQuery = true;   // V7.91-02: 어떤 베이
  if (/브리핑|브리핑\s*해|요약\s*해|작업\s*요약/i.test(t)) result.briefingQuery = true;
  // V7.92: 챗봇형 질문 — 자기소개·시간·날씨·입출항 (사용자 요청: "넌 뭐야"에 답하기)
  if (/(?:^|\s)(?:넌|너는|네가|니가|너|당신|당신이)\s*(?:뭐|누구|하는\s*일|할\s*수|어떤\s*일)|누구세요|누구냐|누구니|누구야|자기\s*소개|소개\s*해|무슨\s*(?:일|기능)|뭐\s*(?:하는|할\s*수)|어떤\s*(?:일|기능|걸\s*할)/i.test(t)) result.introQuery = true;
  if (!result.etaQuery && /몇\s*시(?!간)|지금\s*시간|현재\s*시간|시간\s*알려|오늘\s*며칠|며칠이야|무슨\s*요일|오늘\s*날짜|날짜\s*알려/i.test(t)) result.timeQuery = true;
  // V8.60: 맛집/식사 추천 — "점심 뭐 먹을까"·"저녁 먹으러 어디 가지"·"야식 추천" → 돌림판.
  //   ⚠ etaQuery("점심까지 끝나?")와 충돌 금지 — 끝/완료/까지 들어간 문장은 제외.
  if (!result.etaQuery && /뭐\s*먹|먹을\s*까|먹으러|먹으면|맛집|식당\s*추천|배\s*고프|배고파|메뉴\s*추천|야식\s*추천|아침\s*추천|점심\s*추천|저녁\s*추천/i.test(t) && !/끝|완료|까지|남/.test(t)) {
    result.foodQuery = /야식|밤참|심야/.test(t) ? 'night'
      : /저녁|디너/.test(t) ? 'dinner'
      : /아침|조식/.test(t) ? 'breakfast'
      : /점심|런치/.test(t) ? 'lunch' : 'any';
  }
  if (/날씨|기온\s*어때|바람\s*어때|비\s*(와|오나|올까)|눈\s*(와|오나|올까)/i.test(t)) result.weatherQuery = true;
  // V9.18: 선박 소개·이름 유래 — "이 배 뭐야", "선박 소개", "배 이름 뜻/유래", "무슨 배야"
  if (/이\s*배\s*(뭐|무슨|어떤|소개)|선박\s*소개|배\s*소개|(?:배|선박)\s*이름\s*(?:뜻|유래|의미)|무슨\s*배|어떤\s*배(?:야|에요|예요|인가)/i.test(t)) result.shipIntroQuery = true;
  if (/입출항|입항|출항(?!지)|접안|배\s*언제|언제\s*들어오|언제\s*나가/i.test(t)) result.schedQuery = true;
  // V7.93: 트윈 작업 가능 질문 — "20번 베이 트윈 가능해" / "트윈 무게 확인"
  if (/트윈/.test(t) && /가능|되나|되니|돼|될까|불가|체크|점검|확인|문제|무게/i.test(t)) result.twinCheckQuery = true;
  if (/(실\s*번호|씰|실)\s*(점검|검사|오류|확인|체크)|리스트\s*(점검|검사|확인|체크)|점검\s*(?:해|좀|줘|할까)/i.test(t)) result.sealAuditQuery = true;
  if (/위치|어디|어딨|where/i.test(t)) result.posQuery = true;
  if (/리스트|목록|(보여|알려)\s*(줘|주세요|달라|다오)|불러\s*줘|뽑아\s*줘|list/i.test(t)) result.listQuery = true;   // V7.91-02: 주세요·달라·불러줘 등

  // 전체 / 통계
  // V7.91-02: 일상 동의어 확장 — "전체"만 되고 "전부/다/모두"는 안 되던 것 (사용자 요청).
  //   단독 "다"는 토큰으로만 매칭(앞뒤 공백/문장 경계) — "남았다" 속 '다' 오인 방지.
  const allWords = /전체|전부|모두|몽땅|싹\s*다|죄다|도합|통틀어|합쳐서|합치면|다\s*해서|다\s*합(?:쳐|치)|(?:^|\s)다(?=\s|$|[?.!,])/;
  if (/컨테이너|container|all|총\s*개수|총\s*대수|총\s*몇/i.test(t) || allWords.test(t)) result.isAll = true;
  if (/몇\s*(개|대|건)|얼마나|몇\s*이나|개수|대수|수량|총\s*몇/i.test(t)) result.isStat = true;

  // 온도
  if (hasTempCtx) {
    let tempMatch = null;
    let m = t.match(/(?:영하|마이너스|minus)\s*(\d+(?:\.\d+)?)/);
    if (m) tempMatch = -parseFloat(m[1]);
    if (tempMatch === null) {
      m = t.match(/-\s*(\d+(?:\.\d+)?)\s*도?/);
      if (m) tempMatch = -parseFloat(m[1]);
    }
    if (tempMatch === null) {
      m = t.match(/(?:영상|플러스|plus)\s*(\d+(?:\.\d+)?)/);
      if (m) tempMatch = parseFloat(m[1]);
      else {
        m = t.match(/\+\s*(\d+(?:\.\d+)?)\s*도?/);
        if (m) tempMatch = parseFloat(m[1]);
      }
    }
    if (tempMatch === null) {
      m = t.match(/(\d+(?:\.\d+)?)\s*도/);
      if (m) tempMatch = parseFloat(m[1]);
    }
    if (tempMatch !== null && Number.isFinite(tempMatch)) {
      result.temp = tempMatch;
      if (!result.type) result.type = 'rf';
    }
  }

  return result;
}

// ─── 필터 적용 ───
export function applyNLFilter(containers, parsed) {
  let r = containers;
  if (parsed.digits) {
    const d = parsed.digits;
    r = r.filter(c => {
      const last4 = c.l4 || c.cn?.slice(-4) || '';
      if (d.length === 4) return last4 === d;
      return last4.endsWith(d);
    });
  }
  if (parsed.size === '20') r = r.filter(c => /^2[25]/.test(c.iso || '') || (isoToLabel(c.iso) || '').startsWith('20'));
  else if (parsed.size === '40') r = r.filter(c => /^4/.test(c.iso || '') || (isoToLabel(c.iso) || '').startsWith('40'));
  // V7.53 fix: ISO '45xx'는 45피트가 아니라 40ft 하이큐브(첫자리 4=40ft, 둘째 5=9'6").
  //   진짜 45피트는 L5xx (cargoPlanCore 주석: 45GP→40HC, L5G1→45HC). label 기준이 정답.
  else if (parsed.size === '45') r = r.filter(c => /^L5/i.test(c.iso || '') || (isoToLabel(c.iso) || '').startsWith('45'));
  if (parsed.fe) r = r.filter(c => c.fe === parsed.fe);
  if (parsed.type === 'rf') {
    r = r.filter(c => c.rf || (c.iso && c.iso[2] === 'R') || /RF$/.test(isoToLabel(c.iso) || '') || (c.tmp && String(c.tmp).trim() !== '' && String(c.tmp).trim() !== '0'));
  } else if (parsed.type === 'dg') r = r.filter(c => c.dg);
  else if (parsed.type === 'xray') r = r.filter(c => c._xray);
  else if (parsed.type === 'lolo') r = r.filter(c => c.lolo);       // V9.56: 갠트리(落地) 분
  else if (parsed.type === 'dbl') r = r.filter(c => c.dbl);         // V9.56: 双背(2단)
  else if (parsed.type === 'tk') r = r.filter(c => c.tk || /TK$/.test(isoToLabel(c.iso) || ''));
  else if (parsed.type === 'fr') r = r.filter(c => c.fr || /FR$/.test(isoToLabel(c.iso) || ''));
  else if (parsed.type === 'ot') r = r.filter(c => c.ot || /OT$/.test(isoToLabel(c.iso) || ''));
  else if (parsed.type === 'oog') r = r.filter(c => c.oog || c.fr || c.ot);

  if (parsed.bayTrio && parsed.bayTrio.length) {
    const set = new Set(parsed.bayTrio.map(b => normalizeBay(b)));
    r = r.filter(c => set.has(normalizeBay(c.bay)));   // V8.03-01: 짝수 홀드/데크 = 트리오 전체
  } else if (parsed.bay) {
    r = r.filter(c => normalizeBay(c.bay) === parsed.bay);
  }

  const portMatch = (cVal, code) => {
    if (!cVal || !code) return false;
    const v = String(cVal).toUpperCase();
    const k = String(code).toUpperCase();
    if (v === k) return true;
    if (k.length === 3) return v.endsWith(k);
    if (k.length === 5) return v === k || v.endsWith(k.slice(-3));
    return false;
  };
  if (parsed.pol) r = r.filter(c => portMatch(c.pol, parsed.pol));
  if (parsed.pod) r = r.filter(c => portMatch(c.pod, parsed.pod));
  if (parsed.portAny) r = r.filter(c => portMatch(c.pol, parsed.portAny) || portMatch(c.pod, parsed.portAny));

  if (parsed.zone === 'deck') r = r.filter(c => parseInt(c.tier, 10) >= 80);
  else if (parsed.zone === 'hold') r = r.filter(c => {
    const t = parseInt(c.tier, 10);
    return !isNaN(t) && t < 80;
  });

  if (parsed.dgClass) r = r.filter(c => c.dg && String(c.dgc || '').startsWith(parsed.dgClass));
  if (parsed.un) r = r.filter(c => c.dg && String(c.un || '') === parsed.un);
  if (parsed.mode) r = r.filter(c => c._mode === parsed.mode);

  if (parsed.weightMin !== null) r = r.filter(c => (parseInt(c.wt, 10) || 0) >= parsed.weightMin);
  if (parsed.weightMax !== null) r = r.filter(c => (parseInt(c.wt, 10) || 0) <= parsed.weightMax);

  // M3.3 진행 상황
  if (parsed.progressQuery === 'done') r = r.filter(c => !!c._comp);
  else if (parsed.progressQuery === 'pending') r = r.filter(c => !c._comp);

  // M3.3 바닥/꼭대기
  if (parsed.bottomQuery || parsed.topQuery) {
    const groupMap = {};
    r.forEach(c => {
      if (!c.bay || !c.row || !c.tier) return;
      const tn = parseInt(c.tier, 10);
      if (isNaN(tn)) return;
      const zone = tn >= 80 ? 'deck' : 'hold';
      const key = `${normalizeBay(c.bay)}-${c.row}-${zone}`;
      if (!groupMap[key]) groupMap[key] = { min: tn, max: tn };
      else {
        if (tn < groupMap[key].min) groupMap[key].min = tn;
        if (tn > groupMap[key].max) groupMap[key].max = tn;
      }
    });
    if (parsed.bottomQuery) {
      r = r.filter(c => {
        const tn = parseInt(c.tier, 10);
        if (isNaN(tn)) return false;
        const zone = tn >= 80 ? 'deck' : 'hold';
        return groupMap[`${normalizeBay(c.bay)}-${c.row}-${zone}`]?.min === tn;
      });
    } else if (parsed.topQuery) {
      r = r.filter(c => {
        const tn = parseInt(c.tier, 10);
        if (isNaN(tn)) return false;
        const zone = tn >= 80 ? 'deck' : 'hold';
        return groupMap[`${normalizeBay(c.bay)}-${c.row}-${zone}`]?.max === tn;
      });
    }
  }

  // 온도 정확 일치
  if (parsed.temp !== null && Number.isFinite(parsed.temp)) {
    r = r.filter(c => {
      if (!c.tmp) return false;
      const ctmp = parseFloat(String(c.tmp).replace(/[^\d.\-+]/g, ''));
      if (!Number.isFinite(ctmp)) return false;
      return Math.abs(ctmp - parsed.temp) < 0.5;
    });
  }
  return r;
}

// ─── 한국어 설명 ───
export function describeQuery(parsed) {
  const desc = [];
  if (parsed.bay) desc.push(`${parsed.bay}번 베이`);
  if (parsed.zone === 'deck') desc.push('갑판');
  if (parsed.zone === 'hold') desc.push('홀드');
  if (parsed.bottomQuery) desc.push('바닥');
  if (parsed.topQuery) desc.push('꼭대기');
  if (parsed.pol) desc.push(`${portToKr(parsed.pol)}발`);
  if (parsed.pod) desc.push(`${portToKr(parsed.pod)}행`);
  if (parsed.portAny) desc.push(portToKr(parsed.portAny));
  if (parsed.size) desc.push(`${parsed.size}피트`);
  if (parsed.fe === 'F') desc.push('풀');
  if (parsed.fe === 'E') desc.push('엠티');
  if (parsed.type === 'rf') desc.push('리퍼');
  if (parsed.type === 'dg') desc.push('위험물');
  if (parsed.dgClass) desc.push(`클래스 ${parsed.dgClass}`);
  if (parsed.un) desc.push(`UN${parsed.un}`);
  if (parsed.type === 'xray') desc.push('X-RAY');
  if (parsed.type === 'lolo') desc.push('갠트리(落地)');
  if (parsed.type === 'dbl') desc.push('双背 2단');
  if (parsed.type === 'tk') desc.push('탱크');
  if (parsed.type === 'fr') desc.push('FR');
  if (parsed.type === 'ot') desc.push('OT');
  if (parsed.type === 'oog') desc.push('OOG');
  if (parsed.mode === 'discharge') desc.push('양하');
  if (parsed.mode === 'loading') desc.push('선적');
  if (parsed.progressQuery === 'done') desc.push('완료');
  if (parsed.progressQuery === 'pending') desc.push('남은');
  if (parsed.weightMin !== null) desc.push(`${parsed.weightMin / 1000}톤 이상`);
  if (parsed.weightMax !== null) desc.push(`${parsed.weightMax / 1000}톤 이하`);
  if (parsed.temp !== null) {
    if (parsed.temp < 0) desc.push(`영하 ${Math.abs(parsed.temp)}도`);
    else if (parsed.temp > 0) desc.push(`영상 ${parsed.temp}도`);
    else desc.push('0도');
  }
  if (parsed.digits) desc.push(`끝네자리 ${parsed.digits}`);
  if (desc.length === 0 && parsed.isAll) return '전체';
  return desc.join(' ') || '전체';
}

export function hasAnyCondition(parsed) {
  return !!(parsed.digits || parsed.size || parsed.fe || parsed.type ||
            parsed.bay || parsed.pol || parsed.pod || parsed.portAny ||
            parsed.zone || parsed.dgClass || parsed.un || parsed.mode ||
            parsed.weightMin !== null || parsed.weightMax !== null ||
            parsed.isAll || parsed.temp !== null ||
            parsed.capacityQuery || parsed.bayBreakdown ||
            parsed.progressQuery || parsed.tierStackQuery ||
            parsed.bottomQuery || parsed.topQuery || parsed.vacantQuery ||
            parsed.weightSum || parsed.posQuery || parsed.listQuery || parsed.bayDistQuery ||
            parsed.tierPlaceCountQuery || parsed.tierInContextQuery || parsed.etaQuery || parsed.customsReportQuery || parsed.handoverQuery ||
            // V9.14: 챗봇형 의도도 '조건 있음'으로 — 통합검색 무응답·SearchPanel의 8종 수동 나열(구조적 부채) 해소
            parsed.briefingQuery || parsed.sealAuditQuery || parsed.introQuery || parsed.timeQuery ||
            parsed.weatherQuery || parsed.schedQuery || parsed.twinCheckQuery || parsed.foodQuery || parsed.shipIntroQuery);
}

// ─── 베이별 슬롯 맵 (재사용) ───
function buildBaySlotMap(allContainers) {
  const map = {};  // bayN → { cons: [...], slots: Set }
  allContainers.forEach(c => {
    const bn = parseInt(normalizeBay(c.bay), 10);
    if (isNaN(bn)) return;
    if (!map[bn]) map[bn] = { cons: [], slots: new Set() };
    map[bn].cons.push(c);
    if (c.row && c.tier) map[bn].slots.add(`${c.row}-${c.tier}`);
  });
  return map;
}

// ─── 답변 생성기 ───
export function generateLocalAnswer(parsed, results, allContainers, ctx = null) {
  if (!hasAnyCondition(parsed)) return null;
  const desc = describeQuery(parsed);

  // V7.99-16: 양하신고 점검 — 그날 이상 건 정리. 최우선.
  if (parsed.customsReportQuery) {
    return formatCustomsReport(parsed, allContainers, ctx);
  }

  // V7.99-15: 완료 예정 시각 — 진행 페이스로 계산해 대화체로. progress보다 먼저.
  if (parsed.etaQuery) {
    return formatEta(parsed, allContainers, ctx);
  }

  // V7.99-10 (메모6 수동): 홀드/데크 개수 질문 2종.
  //   tierPlaceCountQuery = "홀드 몇 개 남았어" → 작업 남은 단이 몇 곳인지 + 베이 번호 한 번에.
  //   tierInContextQuery  = "홀드에 몇 개 남았어" → 현재 작업 중인(선택한) 단의 컨 수.
  if (parsed.tierPlaceCountQuery) {
    return formatTierPlaceCount(parsed.tierPlaceCountQuery, allContainers, ctx);
  }
  if (parsed.tierInContextQuery) {
    return formatTierInContext(parsed.tierInContextQuery, allContainers, ctx);
  }

  // M3.3 우선순위
  if (parsed.capacityQuery)  return formatCapacity(parsed, allContainers);
  if (parsed.vacantQuery)    return formatVacant(parsed, allContainers);
  if (parsed.bayBreakdown)   return formatBayBreakdown(parsed, allContainers);
  if (parsed.tierStackQuery) return formatStack(parsed, allContainers);
  if (parsed.progressQuery)  return formatProgress(parsed, results, allContainers);

  // 무게 합계
  if (parsed.weightSum) {
    const totalKg = results.reduce((s, c) => s + (parseInt(c.wt, 10) || 0), 0);
    const lines = [`📊 ${desc} 총 ${results.length}대`,
                   `⚖️ 총중량: ${formatWt(totalKg)} (${totalKg.toLocaleString()}kg)`];
    if (results.length > 0 && results.length <= 30) {
      lines.push('', '컨별 무게:');
      results.slice(0, 30).forEach(c => {
        lines.push(`  • ${c.cn?.slice(-4) || '?'} (${fmtPos(c)}): ${formatWt(c.wt || 0)}`);
      });
    }
    return lines.join('\n');
  }

  // V7.90-02: 베이 분포 — 명시 질문이거나, 위치 질문인데 결과가 많으면(개별 나열 무의미) 분포로
  if (parsed.bayDistQuery || (parsed.posQuery && results.length > 5)) return formatBayDist(desc, results, parsed);
  if (parsed.posQuery || parsed.listQuery) return formatLocationList(desc, results);
  if (parsed.isStat) return formatStats(desc, results);

  // 베이 단독 → 베이 통계
  if (parsed.bay) {
    if (results.length === 0) return `📭 ${parsed.bay}번 베이 없음`;
    return formatBayStats(parsed.bay, results);
  }

  // 강한 조건 자동 위치 리스트
  const hasStrong = parsed.pol || parsed.pod || parsed.portAny ||
                    parsed.dgClass || parsed.un || parsed.zone ||
                    (parsed.temp !== null) || parsed.mode ||
                    parsed.weightMin !== null || parsed.weightMax !== null ||
                    (parsed.type && parsed.type !== 'rf');
  if (hasStrong && results.length >= 2) return formatLocationList(desc, results);

  return null;
}

// ─── 헬퍼 함수들 ───

// V7.99-10 (메모6 수동): "홀드 몇 개 남았어" — 작업 남은 단(홀드/데크)이 몇 곳인지 + 베이 번호 한 번에.
//   되묻지 않게 곳수와 베이를 같이: "4, 12, 20 3곳입니다".
function formatTierPlaceCount(tier, allContainers, ctx) {
  const mode = ctx?.mode || 'discharge';
  const bayPairs = ctx?.bayPairs || {};
  const groupCenterOf = (bayStr) => {
    const b = parseInt(bayStr, 10);
    if (!Number.isFinite(b)) return null;
    if (b % 2 === 0) return b;
    const p = bayPairs?.[String(b)];
    if (p) return (b + parseInt(p, 10)) / 2;
    return b;
  };
  const isDeck = (c) => parseInt(c.tier, 10) >= 80;
  const isPtk = (c) => mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol);
  // 작업 남은(미완료·평택분) 컨 중 해당 단에 있는 것 → 그룹(center)별로 모음
  const centers = new Set();
  allContainers.forEach(c => {
    if (!isPtk(c) || c._comp) return;
    if (tier === 'deck' ? !isDeck(c) : isDeck(c)) return;
    const ctr = groupCenterOf(c.bay);
    if (ctr != null) centers.add(ctr);
  });
  const label = tier === 'deck' ? '데크' : '홀드';
  const sorted = [...centers].sort((a, b) => a - b);
  if (sorted.length === 0) return `작업할 ${label}가 남지 않았습니다.`;
  const bayList = sorted.map(c => String(c)).join(', ');
  return `${bayList} ${sorted.length}곳입니다.`;
}

// V7.99-10 (메모6 수동): "홀드에 몇 개 남았어" — 현재 작업 중인(선택한) 단의 남은 컨 수.
//   ctx.selectedGroup·selectedTier 없으면 어느 단인지 안내.
function formatTierInContext(tier, allContainers, ctx) {
  const label = tier === 'deck' ? '데크' : '홀드';
  if (ctx?.selectedGroup == null) {
    return `먼저 작업할 베이와 ${label}를 선택하세요. 그러면 그 ${label}에 남은 개수를 알려드립니다.`;
  }
  const mode = ctx?.mode || 'discharge';
  const bayPairs = ctx?.bayPairs || {};
  const selectedGroup = ctx.selectedGroup;
  const groupCenterOf = (bayStr) => {
    const b = parseInt(bayStr, 10);
    if (!Number.isFinite(b)) return null;
    if (b % 2 === 0) return b;
    const p = bayPairs?.[String(b)];
    if (p) return (b + parseInt(p, 10)) / 2;
    return b;
  };
  const isDeck = (c) => parseInt(c.tier, 10) >= 80;
  const isPtk = (c) => mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol);
  const remain = allContainers.filter(c =>
    isPtk(c) && !c._comp && groupCenterOf(c.bay) === selectedGroup &&
    (tier === 'deck' ? isDeck(c) : !isDeck(c))
  );
  // 베이 라벨
  const bays = [...new Set(remain.map(c => parseInt(c.bay, 10)))].sort((a, b) => a - b);
  const bayLbl = bays.length ? bays.join('·') + '번' : String(selectedGroup) + '번';
  return `${bayLbl} ${label}에 ${remain.length}개 남았습니다.`;
}

function formatStats(desc, results) {
  if (results.length === 0) return `📊 ${desc}: 0대`;
  const fCount = results.filter(c => c.fe === 'F').length;
  const eCount = results.filter(c => c.fe === 'E').length;
  const dCount = results.filter(c => c._mode === 'discharge').length;
  const lCount = results.filter(c => c._mode === 'loading').length;
  const deckCount = results.filter(c => parseInt(c.tier, 10) >= 80).length;
  const holdCount = results.filter(c => {
    const t = parseInt(c.tier, 10);
    return !isNaN(t) && t < 80;
  }).length;
  const lines = [`📊 ${desc}: ${results.length}대`];
  const sub = [];
  if (fCount + eCount > 0) sub.push(`Full ${fCount} / Empty ${eCount}`);
  if (dCount + lCount > 0) sub.push(`양하 ${dCount} / 선적 ${lCount}`);
  if (deckCount + holdCount > 0) sub.push(`갑판 ${deckCount} / 홀드 ${holdCount}`);
  if (sub.length > 0) lines.push(sub.join(' · '));
  return lines.join('\n');
}

function formatBayStats(bay, results) {
  const fCount = results.filter(c => c.fe === 'F').length;
  const eCount = results.filter(c => c.fe === 'E').length;
  const deckCount = results.filter(c => parseInt(c.tier, 10) >= 80).length;
  const holdCount = results.filter(c => {
    const t = parseInt(c.tier, 10);
    return !isNaN(t) && t < 80;
  }).length;
  const totalKg = results.reduce((s, c) => s + (parseInt(c.wt, 10) || 0), 0);
  const rfCount = results.filter(c => c.rf || (c.iso && c.iso[2] === 'R')).length;
  const dgCount = results.filter(c => c.dg).length;
  const compCount = results.filter(c => c._comp).length;

  const lines = [`📊 ${bay}번 베이: 총 ${results.length}대`];
  lines.push(`Full ${fCount} / Empty ${eCount} · 갑판 ${deckCount} / 홀드 ${holdCount}`);
  lines.push(`⚖️ 총중량 ${formatWt(totalKg)}`);
  if (compCount > 0) lines.push(`✅ 완료 ${compCount}/${results.length} (${Math.round(compCount/results.length*100)}%)`);
  if (rfCount > 0 || dgCount > 0) {
    const sp = [];
    if (rfCount > 0) sp.push(`리퍼 ${rfCount}`);
    if (dgCount > 0) sp.push(`위험물 ${dgCount}`);
    lines.push(`특수: ${sp.join(' / ')}`);
  }
  return lines.join('\n');
}

// V7.90-02: 베이 분포 답변 — "리퍼가 몇 번 베이에 있어?" 첫 줄은 음성으로 읽히므로 베이 나열.
// V7.90-05: 실번호 점검 전용 답변 ("실번호 점검" 질문)
export function generateSealAuditAnswer(containers, modeLabel) {
  const audit = auditSeals(containers || []);
  if (!audit.checked) return `📭 ${modeLabel} — 점검할 실번호 데이터가 없습니다 (양하리스트 업로드 필요)`;
  if (!audit.items.length) return `✅ ${modeLabel} 실번호 점검 — ${audit.checked}건 모두 이상 없음`;
  const lines = [`🔍 ${modeLabel} 실번호 주의 ${audit.items.length}건 (점검 ${audit.checked}건 중)`];
  for (const it of audit.items) lines.push(`• ${it.cn} 「${it.seal}」 — ${it.reason}`);
  return lines.join('\n');
}

// V7.90-05: 실번호(씰) 오류 사전 점검 (사용자 요청 — 리스트 단계에서 미리 잡기)
//   ① 중복: 다른 컨테이너인데 같은 실번호  ② 혼입: 실번호 칸에 컨테이너 번호
//   ③ 형식 특이: 특수문자·비정상 짧음  ④ 자리수 부족: 같은 접두 그룹의 다수 길이보다 짧음(엑셀 0 잘림 등)
export function auditSeals(containers) {
  const items = [];   // {cn, seal, field, reason}
  const norm = (s) => String(s || '').toUpperCase().replace(/[\s\-]/g, '');
  const entries = [];
  for (const c of containers || []) {
    for (const [field, label] of [['sl', '풀씰'], ['eseal', '엠티실']]) {
      const raw = c[field];
      if (raw == null || String(raw).trim() === '') continue;
      entries.push({ c, field: label, raw: String(raw).trim(), n: norm(raw) });
    }
  }
  if (!entries.length) return { items, checked: 0 };
  // ① 중복 (같은 정규화 씰, 서로 다른 컨)
  const bySeal = {};
  for (const e of entries) { (bySeal[e.n] = bySeal[e.n] || []).push(e); }
  for (const k in bySeal) {
    const g = bySeal[k];
    const cns = [...new Set(g.map(e => e.c.cn))];
    if (cns.length >= 2) {
      items.push({ cn: cns.map(x => (x || '').slice(-4)).join('·'), seal: g[0].raw, reason: `같은 실번호가 ${cns.length}개 컨테이너에 — 서로 바뀌어 있을 가능성, 양쪽 모두 실물 확인` });
    }
  }
  // ②③④ 개별 점검
  const allCns = new Set((containers || []).map(c => norm(c.cn)).filter(Boolean));
  // 접두 그룹별 숫자부 길이 최빈값 (④용)
  const grpLens = {};
  for (const e of entries) {
    const m = e.n.match(/^([A-Z]*)(\d+)$/);
    if (m) { const g = m[1] || '(숫자만)'; (grpLens[g] = grpLens[g] || []).push(m[2].length); }
  }
  const modeLen = {};
  for (const g in grpLens) {
    if (grpLens[g].length < 3) continue;  // 표본 적으면 판단 보류
    const cnt = {};
    for (const L of grpLens[g]) cnt[L] = (cnt[L] || 0) + 1;
    const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    if (cnt[top] >= grpLens[g].length * 0.7) modeLen[g] = +top;  // 70% 이상이 같은 길이일 때만
  }
  const seen = new Set();
  for (const e of entries) {
    const key = (e.c.cn || '') + '|' + e.n;
    if (seen.has(key)) continue; seen.add(key);
    const last4 = (e.c.cn || '').slice(-4);
    // ② 컨번호 혼입: ISO 컨번호 형식이거나, 이 항차의 어떤 컨번호를 포함
    if (/^[A-Z]{4}\d{6,7}$/.test(e.n)) {
      items.push({ cn: last4, seal: e.raw, reason: `${e.field}이 컨테이너 번호 형식` }); continue;
    }
    const cnDigits = norm(e.c.cn).slice(4);
    if (cnDigits.length >= 6 && e.n.includes(cnDigits)) {
      items.push({ cn: last4, seal: e.raw, reason: `${e.field}에 자기 컨번호 숫자 포함` }); continue;
    }
    let hit = null;
    if (e.n.length >= 10) { for (const cn of allCns) { if (cn && e.n.includes(cn)) { hit = cn; break; } } }
    if (hit) { items.push({ cn: last4, seal: e.raw, reason: `${e.field}에 컨테이너 번호(${hit.slice(-4)}) 포함` }); continue; }
    // ③ 형식 특이
    if (/[^A-Z0-9]/.test(e.n)) { items.push({ cn: last4, seal: e.raw, reason: `${e.field}에 특수문자` }); continue; }
    if (e.n.length < 4) { items.push({ cn: last4, seal: e.raw, reason: `${e.field} 자리수 비정상(${e.n.length}자)` }); continue; }
    // ④ 그룹 대비 자리수 부족
    const m = e.n.match(/^([A-Z]*)(\d+)$/);
    if (m) {
      const g = m[1] || '(숫자만)';
      if (modeLen[g] != null && m[2].length < modeLen[g]) {
        items.push({ cn: last4, seal: e.raw, reason: `${e.field} 자리수 부족 — 같은 형식 대부분 ${modeLen[g]}자리, 이 건 ${m[2].length}자리 (앞자리 누락 의심)` });
      }
    }
  }
  return { items, checked: entries.length };
}

// V7.90-04: 작업 브리핑 (사용자 요청) — 검수 시작·중간에 현재 작업 핵심을 한눈에.
//   첫 줄은 음성으로 읽히는 한 문장 요약. 이후 화면용 상세.
export function generateBriefing(containers, modeLabel, mode = 'discharge', pairsMap = null, pier = '') {   // V7.93: pairsMap·pier — 트윈 무게 예견
  // V7.90-07 재구성 (사용자 피드백): ① 평택분(작업 대상)만 집계 — 통과화물 포함 금지(7.1)
  //   ② 일반 통계 나열 대신 "검수원이 인지해야 할 특이사항" 중심, 행동 지향 문구.
  const all = containers || [];
  const isPtk = (c) => mode === 'discharge' ? isPyeongtaekPort(c.pod) : isPyeongtaekPort(c.pol);
  const cs = all.filter(isPtk);
  const transit = all.filter(c => !isPtk(c));
  if (!cs.length) return `📋 ${modeLabel} 브리핑 — 평택분 컨테이너가 없습니다`;
  const szOf = (c) => {
    const lbl = isoToLabel(c.iso) || '';
    if (/^45/.test(lbl)) return '45'; if (/^40/.test(lbl)) return '40'; if (/^20/.test(lbl)) return '20';
    const f = (c.iso || '')[0];
    return f === '2' ? '20' : f === '4' ? '40' : (f === 'L' || f === '9') ? '45' : '?';
  };
  const total = cs.length;
  const done = cs.filter(c => c._comp).length;
  const sz = {}; let F = 0, E = 0, deck = 0, hold = 0;
  const rf = [], dg = [], xr = [], fr = [], ot = [], tk = [], oog = [], noTmp = [];
  const bays = new Set();
  for (const c of cs) {
    const s = szOf(c); sz[s] = (sz[s] || 0) + 1;
    if (c.fe === 'E') E++; else F++;
    const b = parseInt(c.bay, 10); if (Number.isFinite(b)) bays.add(b);
    const t = parseInt(c.tier, 10);
    if (Number.isFinite(t)) { if (t >= 80) deck++; else hold++; }
    if (isReeferContainer(c)) { rf.push(c); if (c.fe !== 'E' && !c.rfdry && !c.mkcon && (c.tmp == null || String(c.tmp).trim() === '')) noTmp.push(c); }
    if (c.dg) dg.push(c);
    if (c._xray) xr.push(c);
    if (c.fr || /FR$/.test(isoToLabel(c.iso) || '')) fr.push(c);
    if (c.ot || /OT$/.test(isoToLabel(c.iso) || '')) ot.push(c);
    if (c.tk || /TK$/.test(isoToLabel(c.iso) || '')) tk.push(c);
    if (c.oog) oog.push(c);
  }
  const bayArr = [...bays].sort((a, b) => a - b);
  const baysOf = (arr) => {
    const bs = [...new Set(arr.map(c => parseInt(c.bay, 10)).filter(Number.isFinite))].sort((a, b) => a - b);
    return bs.length ? `베이 ${bs.join(', ')}` : '';
  };
  // ── 주의사항 수집 (일반적이지 않은 것만)
  const warns = [];
  if (rf.length) {
    const tail = noTmp.length ? ` · ⚠ 온도 미입력 ${noTmp.length}대 — 조회 시 온도 입력` : ' — 조회 시 온도 확인';
    warns.push({ k: `리퍼 ${rf.length}`, line: `❄ 리퍼 ${rf.length}대 (${baysOf(rf)})${tail}` });
  }
  if (dg.length) {
    const cls = {};
    for (const c of dg) { const cl = c.dgc || '?'; (cls[cl] = cls[cl] || []).push(parseInt(c.bay, 10)); }
    const detail = Object.keys(cls).sort().map(cl => `cl.${cl} 베이${[...new Set(cls[cl])].filter(Number.isFinite).sort((a,b)=>a-b).join('·')}`).join(' / ');
    warns.push({ k: `위험물 ${dg.length}`, line: `☣ 위험물 ${dg.length}대 — ${detail} — 별도 취급` });
  }
  if (xr.length && mode === 'discharge') {
    warns.push({ k: `엑스레이 ${xr.length}`, line: `🩻 X-RAY 대상 ${xr.length}대 (${baysOf(xr)}) — ${xr.slice(0, 8).map(c => c.cn?.slice(-4)).join(', ')} — 양하 후 별도 처리` });
  }
  if (fr.length) warns.push({ k: `FR ${fr.length}`, line: `⊞ FR ${fr.length}대 (${baysOf(fr)}) — 치수·고박 확인` });
  if (ot.length) warns.push({ k: `OT ${ot.length}`, line: `△ O/T ${ot.length}대 (${baysOf(ot)}) — 상부 확인` });
  if (tk.length) warns.push({ k: `탱크 ${tk.length}`, line: `🛢 탱크 ${tk.length}대 (${baysOf(tk)})` });
  if (oog.length) warns.push({ k: `OOG ${oog.length}`, line: `📐 OOG ${oog.length}대 (${baysOf(oog)}) — 규격 외 치수 확인` });
  // V7.93: 트윈 무게 예견 — 합계 55톤 초과(불가)·무게 불균형(수평 주의). pairsMap 있을 때만.
  if (pairsMap) {
    const limit = twinDiffLimit(pier);
    const tw = analyzeTwinPairs(buildTwinPairs(cs, pairsMap), limit);
    const posOf = (arr) => arr.slice(0, 6).map(p => `${fmtPos(p.a)}↔${fmtPos(p.b)}`).join(', ') + (arr.length > 6 ? ' 외' : '');
    if (tw.over.length) warns.push({ k: `트윈초과 ${tw.over.length}`, line: `🏗 트윈 무게 초과 ${tw.over.length}쌍 (합계 55톤↑): ${posOf(tw.over)} — 트윈 불가, 싱글 작업 검토` });
    if (tw.diff.length) warns.push({ k: `트윈무게차 ${tw.diff.length}`, line: `⚖ 트윈 무게차 초과 ${tw.diff.length}쌍 (한계 ${(limit / 1000)}톤↑): ${posOf(tw.diff)} — 수평 불가, 싱글 작업 검토` });
  }
  const audit = auditSeals(cs);
  if (audit.items.length) {
    const kinds = [...new Set(audit.items.map(it => it.reason.split(' — ')[0].replace(/^(풀씰|엠티실)\s*/, '')))].slice(0, 2).join(', ');
    warns.push({ k: `실번호 ${audit.items.length}건`, line: `🔍 실번호 의심 ${audit.items.length}건 (${kinds}${audit.items.length > 2 ? ' 등' : ''}) — "실번호 점검"으로 상세 확인` });
  }
  if (transit.length) {
    const tb = [...new Set(transit.map(c => parseInt(c.bay, 10)).filter(b => Number.isFinite(b) && bays.has(b)))].sort((a, b) => a - b);
    if (tb.length) warns.push({ k: null, line: `🔁 통과화물이 작업 베이(${tb.join(', ')})에 혼재 — ${mode === 'discharge' ? '내리지 말 것' : '자리 주의'}` });
  }
  // V8.06-02: LOLO 선박(베이 없는 IFCSUM) 리스트 검증 — 작업 시작 전 확인 메시지.
  //   추측·자동변환 대신 검수사가 현장에서 직접 확인하도록 브리핑에 띄운다(사용자 원칙: 데이터·사람이 확정).
  const isLoloBrief = cs.length > 0 && cs.every(c => !c.bay && !c.row && !c.tier);
  if (isLoloBrief) {
    // ① 45HC 규격 확인 — 45HC는 진짜 45피트(L5)이나 표기/해석이 40HC로 흔들릴 수 있음.
    const hc45 = cs.filter(c => {
      const e = String(c.ediIso || '').toUpperCase();
      const lbl = isoToLabel(c.iso) || '';
      return e === '45HC' || /^45/.test(lbl);
    });
    if (hc45.length) {
      // V8.07: 부드러운 음성 안내 — 컨번호 끝4자리를 한 글자씩(공백 구분) 읽도록.
      const cnList = hc45.map(c => (c.cn || '').slice(-4).split('').join(' ')).join(', ');
      warns.push({ k: `45피트 ${hc45.length}`, line: `📏 45피트가 ${hc45.length}대 실려 있습니다. 컨넘버 ${cnList} 규격을 확인해 주세요.` });
    }
    // ② 실번호 형식 비정상 — 여러 실번호 연결/과다 길이(컨테이너 화물 등). 매칭 시 주의.
    const weirdSeal = cs.filter(c => c.fe !== 'E' && c.sl && c.sl.replace(/\s/g, '').length > 15);
    if (weirdSeal.length) {
      const cnList = weirdSeal.slice(0, 4).map(c => (c.cn || '').slice(-4).split('').join(' ')).join(', ');
      warns.push({ k: `실번호확인 ${weirdSeal.length}`, line: `🔖 실번호가 특이한 컨테이너가 ${weirdSeal.length}대 있습니다. 컨넘버 ${cnList} 세관 리스트와 대조해 주세요.` });
    }
  }
  // ── 음성 첫 줄: 평택분 + 주의 핵심
  const keyWarns = warns.filter(w => w.k).map(w => w.k).slice(0, 3);
  const head = `📋 ${modeLabel} 평택 ${total}대` +
    (warns.length ? ` — 주의 ${warns.length}건${keyWarns.length ? ' (' + keyWarns.join(', ') + ')' : ''}` : ' — 특이사항 없음') +
    (done > 0 ? `, 잔여 ${total - done}` : '');
  const szStr = ['20', '40', '45'].filter(s => sz[s]).map(s => `${s}ft ${sz[s]}`).join(', ');
  const lines = [head];
  // V8.06-02: LOLO 선박(베이 없음)은 베이/갑판/홀드 표기 생략 — undefined·0 표시 방지.
  if (isLoloBrief) {
    lines.push(`📌 작업: ${total}대 (Full ${F} / Empty ${E} · ${szStr}) · LOLO(리스트 검수)`);
  } else {
    lines.push(`📌 작업: ${total}대 (Full ${F} / Empty ${E} · ${szStr}) · 베이 ${bayArr[0]}~${bayArr[bayArr.length - 1]} (${bayArr.length}개) · 갑판 ${deck} / 홀드 ${hold}`);
  }
  if (done > 0) lines.push(`📈 진행: 완료 ${done} / 잔여 ${total - done} (${Math.round(done / total * 100)}%)`);
  if (warns.length) {
    lines.push(`⚠ 주의사항`);
    for (const w of warns) lines.push(`  ${w.line}`);
  } else {
    lines.push(`✅ 특이사항 없음 — 일반 화물만`);
  }
  return lines.join('\n');
}

// V7.90-03: 베이 분포 상세 확장 (사용자 요청 — 검수 실무 정보 전반)
//   공통: 규격(20/40/45)·갑판/홀드. 리퍼: 온도 분포. XRAY: 컨번호 끝4. DG: 클래스.
function formatBayDist(desc, results, parsed = {}) {
  if (results.length === 0) return `📭 ${desc} 없음`;
  const byBay = {};
  const sizeOf = (c) => {
    const lbl = isoToLabel(c.iso) || '';
    if (/^45/.test(lbl)) return '45';
    if (/^40/.test(lbl)) return '40';
    if (/^20/.test(lbl)) return '20';
    const f = (c.iso || '')[0];
    return f === '2' ? '20' : f === '4' ? '40' : (f === 'L' || f === '9') ? '45' : '?';
  };
  for (const c of results) {
    const b = parseInt(c.bay, 10);
    const k = Number.isFinite(b) ? b : '?';
    const v = byBay[k] = byBay[k] || { n: 0, deck: 0, hold: 0, sz: {}, temps: {}, l4: [], dgc: {} };
    v.n++;
    const t = parseInt(c.tier, 10);
    if (Number.isFinite(t)) { if (t >= 80) v.deck++; else v.hold++; }
    const s = sizeOf(c); v.sz[s] = (v.sz[s] || 0) + 1;
    if (c.rf || parsed.type === 'rf') {
      const tp = (c.tmp != null && String(c.tmp).trim() !== '') ? String(c.tmp).trim() : '미입력';
      v.temps[tp] = (v.temps[tp] || 0) + 1;
    }
    if (parsed.type === 'xray' || parsed.type === 'dg' || parsed.type === 'fr' || parsed.type === 'ot' || parsed.type === 'tk') {
      v.l4.push(c.cn ? c.cn.slice(-4) : '?');
    }
    if (c.dg) { const cl = c.dgc || '?'; v.dgc[cl] = (v.dgc[cl] || 0) + 1; }
  }
  const bays = Object.keys(byBay).filter(k => k !== '?').map(Number).sort((a, b) => a - b);
  const head = bays.length <= 8
    ? `📍 ${desc} ${results.length}대 — 베이 ${bays.join(', ')}`
    : `📍 ${desc} ${results.length}대 — ${bays.length}개 베이`;
  const lines = [head];
  const fmtSz = (sz) => ['20', '40', '45'].filter(s => sz[s]).map(s => `${s}ft ${sz[s]}`).join('/');
  for (const b of bays) {
    const v = byBay[b];
    const parts = [];
    if (v.deck + v.hold > 0) parts.push(`갑판 ${v.deck}/홀드 ${v.hold}`);
    const szs = fmtSz(v.sz); if (szs) parts.push(szs);
    const tk = Object.keys(v.temps);
    if (tk.length) parts.push(tk.sort().map(tp => `${tp === '미입력' ? '온도미입력' : tp + '°C'}×${v.temps[tp]}`).join(' '));
    const dk = Object.keys(v.dgc);
    if (dk.length) parts.push(dk.sort().map(cl => `cl.${cl}×${v.dgc[cl]}`).join(' '));
    if (v.l4.length && v.l4.length <= 6) parts.push(v.l4.join(', '));
    lines.push(`${String(b).padStart(2, '0')}번 베이 ${v.n}대${parts.length ? ' · ' + parts.join(' · ') : ''}`);
  }
  if (byBay['?']) lines.push(`위치미상 ${byBay['?'].n}대`);
  return lines.join('\n');
}

function formatLocationList(desc, results) {
  if (results.length === 0) return `📭 ${desc} 없음`;
  const lines = [`📍 ${desc} 총 ${results.length}대`];
  if (results.length > 5) {
    const fCount = results.filter(c => c.fe === 'F').length;
    const eCount = results.filter(c => c.fe === 'E').length;
    const dCount = results.filter(c => c._mode === 'discharge').length;
    const lCount = results.filter(c => c._mode === 'loading').length;
    const sub = [];
    if (fCount + eCount > 0) sub.push(`F ${fCount} / E ${eCount}`);
    if (dCount + lCount > 0) sub.push(`양하 ${dCount} / 선적 ${lCount}`);
    if (sub.length > 0) lines.push(sub.join(' · '));
  }
  const max = 50;
  const list = results.slice(0, max);
  list.forEach((c, i) => {
    const tag = [];
    if (c.fe) tag.push(c.fe);
    if (c.rf && c.tmp) tag.push(`${c.tmp}°C`);
    if (c.dg) tag.push(`DG${c.dgc || ''}${c.un ? ' UN' + c.un : ''}`);
    if (c._xray) tag.push('X-RAY');
    if (c.lolo) tag.push('🏗갠트리');
    if (c.dbl) tag.push('⇅2단');
    if (c._comp) tag.push('✅');
    const tagStr = tag.length ? ` [${tag.join(' ')}]` : '';
    lines.push(`${i + 1}. ${c.cn?.slice(-4) || '?'} @ ${fmtPos(c) || '위치미상'}${tagStr}`);
  });
  if (results.length > max) lines.push(`(${results.length - max}대 더 있음)`);
  return lines.join('\n');
}

// M3.3: 베이 용량/짝꿍 분석
function formatCapacity(parsed, allContainers) {
  const baySlot = buildBaySlotMap(allContainers);
  if (parsed.bay) {
    const bayN = parseInt(parsed.bay, 10);
    if (isNaN(bayN)) return `📭 베이 인식 실패`;
    const isEven = bayN % 2 === 0;
    const sizeLabel = isEven ? '40피트' : '20피트';
    const pairBays = isEven ? [bayN - 1, bayN + 1].filter(n => n > 0) : [];

    const main = baySlot[bayN] || { cons: [], slots: new Set() };
    const mainCur = main.cons.length;
    const mainCap = main.slots.size;
    const mainFree = Math.max(0, mainCap - mainCur);

    const lines = [`📊 ${bayN}번 베이 (${sizeLabel}) 적재 분석`];
    lines.push(`현재 적재: ${mainCur}대`);
    if (mainCap > 0) {
      lines.push(`관측 슬롯: ${mainCap}개 (이번 항차 기준)`);
      lines.push(`빈 슬롯: ${mainFree}개`);
    } else {
      lines.push(`(이번 항차에 ${bayN}번 베이 데이터 없음)`);
    }
    const dC = main.cons.filter(c => c._mode === 'discharge').length;
    const lC = main.cons.filter(c => c._mode === 'loading').length;
    if (dC + lC > 0) lines.push(`└ 양하 ${dC} / 선적 ${lC}`);

    if (pairBays.length > 0) {
      lines.push('', `🔗 짝꿍 베이 (트윈 가능):`);
      let totalCur = mainCur, totalCap = mainCap;
      pairBays.forEach(pn => {
        const p = baySlot[pn] || { cons: [], slots: new Set() };
        const pCur = p.cons.length, pCap = p.slots.size, pFree = Math.max(0, pCap - pCur);
        totalCur += pCur; totalCap += pCap;
        if (pCur > 0 || pCap > 0) {
          lines.push(`  • ${pn}번 (20피트): 현재 ${pCur}대 / 슬롯 ${pCap} / 빈 ${pFree}`);
        } else {
          lines.push(`  • ${pn}번 (20피트): 데이터 없음 (통로일 가능성)`);
        }
      });
      lines.push(`📦 합산 (${bayN}+${pairBays.join('/')}): 현재 ${totalCur} / 슬롯 ${totalCap} / 빈 ${Math.max(0, totalCap - totalCur)}`);
    }
    lines.push('', `※ 슬롯 수는 이번 항차에 컨이 있는 위치 기준`,
                   `   실제 선박 최대 용량은 도면 참고`);
    return lines.join('\n');
  }

  // 전체 빈 슬롯 분포
  let totalCons = 0, totalSlots = 0;
  const free = [];
  Object.entries(baySlot).forEach(([bn, v]) => {
    totalCons += v.cons.length;
    totalSlots += v.slots.size;
    const f = v.slots.size - v.cons.length;
    if (f > 0) free.push({ bay: parseInt(bn, 10), free: f });
  });
  const lines = [`📊 전체 적재 분석`,
                 `현재 ${totalCons}대 / 관측 슬롯 ${totalSlots}개`,
                 `빈 슬롯 합계: ${Math.max(0, totalSlots - totalCons)}개`];
  if (free.length > 0) {
    free.sort((a, b) => b.free - a.free);
    lines.push('', `🟢 빈 슬롯 많은 베이 TOP 10:`);
    free.slice(0, 10).forEach(({ bay, free: f }) => lines.push(`  • ${bay}번: ${f}개`));
  }
  lines.push('', `※ 정확한 베이별: "[베이번호]번 베이 실을 수 있어"`);
  return lines.join('\n');
}

// M3.3: 빈자리 (= 슬롯 - 적재)
function formatVacant(parsed, allContainers) {
  // capacity와 같은 원리지만 빈자리 위주로
  const baySlot = buildBaySlotMap(allContainers);
  if (parsed.bay) {
    const bayN = parseInt(parsed.bay, 10);
    const v = baySlot[bayN] || { cons: [], slots: new Set() };
    const cap = v.slots.size, cur = v.cons.length, free = Math.max(0, cap - cur);
    const lines = [`📊 ${bayN}번 베이 빈 슬롯: ${free}개`];
    lines.push(`현재 적재 ${cur}대 / 관측 슬롯 ${cap}개`);
    return lines.join('\n');
  }
  // 바닥 빈자리 (zone+bottom 결합 시 row별 최저 tier가 비어있는 곳)
  if (parsed.bottomQuery) {
    return formatBottomVacant(parsed, allContainers);
  }
  // 전체 빈자리
  let totalCons = 0, totalSlots = 0;
  const free = [];
  Object.entries(baySlot).forEach(([bn, v]) => {
    totalCons += v.cons.length;
    totalSlots += v.slots.size;
    const f = v.slots.size - v.cons.length;
    if (f > 0) free.push({ bay: parseInt(bn, 10), free: f });
  });
  const lines = [`📊 전체 빈 슬롯: ${Math.max(0, totalSlots - totalCons)}개`];
  if (free.length > 0) {
    free.sort((a, b) => b.free - a.free);
    lines.push('', `빈 슬롯 많은 베이 TOP 10:`);
    free.slice(0, 10).forEach(({ bay, free: f }) => lines.push(`  • ${bay}번: ${f}개`));
  }
  return lines.join('\n');
}

// M3.3: 바닥 빈자리 — row별 최저 tier가 비어있는 위치
function formatBottomVacant(parsed, allContainers) {
  // row별로 그 row에 등장한 모든 tier를 수집 → 그 row의 최저 tier가 적재되지 않은 경우
  const rowTiers = {};  // "bay-row-zone" → Set of tiers
  allContainers.forEach(c => {
    if (!c.bay || !c.row || !c.tier) return;
    const tn = parseInt(c.tier, 10);
    if (isNaN(tn)) return;
    if (parsed.zone === 'deck' && tn < 80) return;
    if (parsed.zone === 'hold' && tn >= 80) return;
    if (parsed.bay && normalizeBay(c.bay) !== parsed.bay) return;
    const zone = tn >= 80 ? 'deck' : 'hold';
    const key = `${normalizeBay(c.bay)}-${c.row}-${zone}`;
    if (!rowTiers[key]) rowTiers[key] = new Set();
    rowTiers[key].add(tn);
  });
  // 각 row의 최저 tier
  const occupiedAtBottom = new Set();
  allContainers.forEach(c => {
    if (!c.bay || !c.row || !c.tier) return;
    const tn = parseInt(c.tier, 10);
    if (isNaN(tn)) return;
    const zone = tn >= 80 ? 'deck' : 'hold';
    const key = `${normalizeBay(c.bay)}-${c.row}-${zone}`;
    if (!rowTiers[key]) return;
    const minTier = Math.min(...rowTiers[key]);
    if (tn === minTier) occupiedAtBottom.add(`${key}-${tn}`);
  });
  // 비어있는 바닥 = rowTiers에는 있지만 occupiedAtBottom에 없는 row의 최저 tier
  const vacantBottoms = [];
  Object.entries(rowTiers).forEach(([key, tiers]) => {
    const minTier = Math.min(...tiers);
    if (!occupiedAtBottom.has(`${key}-${minTier}`)) {
      const [bay, row, zone] = key.split('-');
      vacantBottoms.push({ bay, row, tier: String(minTier).padStart(2, '0'), zone });
    }
  });

  const desc = (parsed.zone === 'hold' ? '홀드 ' : parsed.zone === 'deck' ? '갑판 ' : '') + '바닥';
  const lines = [`📊 ${desc} 빈자리: ${vacantBottoms.length}개`];
  if (vacantBottoms.length > 0) {
    // 베이별로 정리
    const byBay = {};
    vacantBottoms.forEach(v => {
      if (!byBay[v.bay]) byBay[v.bay] = [];
      byBay[v.bay].push(v);
    });
    Object.entries(byBay)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .slice(0, 30)
      .forEach(([bay, list]) => {
        const positions = list.map(v => `row${v.row}-t${v.tier}`).join(', ');
        lines.push(`  • ${bay}번 베이 (${list.length}개): ${positions}`);
      });
  }
  lines.push('', `※ 바닥 = 각 row의 최저 tier 위치`);
  return lines.join('\n');
}

// M3.3: 베이별 분포
function formatBayBreakdown(parsed, allContainers) {
  // 다른 조건이 있으면 먼저 필터
  let filtered = allContainers;
  const tmpParsed = { ...parsed, bayBreakdown: false, isStat: false };
  if (parsed.fe || parsed.type || parsed.mode || parsed.zone ||
      parsed.dgClass || parsed.un || parsed.weightMin !== null || parsed.weightMax !== null) {
    filtered = applyNLFilter(allContainers, tmpParsed);
  }
  const map = {};
  filtered.forEach(c => {
    const bn = parseInt(normalizeBay(c.bay), 10);
    if (isNaN(bn)) return;
    if (!map[bn]) map[bn] = { total: 0, F: 0, E: 0, comp: 0 };
    map[bn].total++;
    if (c.fe === 'F') map[bn].F++;
    else if (c.fe === 'E') map[bn].E++;
    if (c._comp) map[bn].comp++;
  });
  const desc = describeQuery({ ...parsed, bayBreakdown: false, isStat: false });
  const lines = [`📊 ${desc || '전체'} 베이별 분포 (총 ${filtered.length}대)`];
  const sorted = Object.entries(map).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  sorted.forEach(([bn, v]) => {
    const compStr = v.comp > 0 ? ` ✅${v.comp}` : '';
    lines.push(`  • ${bn}번: ${v.total}대 (F${v.F}/E${v.E})${compStr}`);
  });
  if (sorted.length === 0) lines.push('  (데이터 없음)');
  return lines.join('\n');
}

// M3.3: 단수 분석 (progress 무시 — 모든 컨 기준)
function formatStack(parsed, allContainers) {
  let filtered = allContainers;
  if (parsed.bay || parsed.zone) {
    // progressQuery / tierStackQuery / isStat 모두 빼고 베이/구역만 적용
    const tmpParsed = {
      ...parsed,
      tierStackQuery: false, isStat: false, progressQuery: null,
      capacityQuery: false, vacantQuery: false, posQuery: false, listQuery: false,
    };
    filtered = applyNLFilter(allContainers, tmpParsed);
  }
  // 베이+row별 tier 종류 = 단수
  const stackMap = {};  // "bay-row" → Set of tiers
  filtered.forEach(c => {
    if (!c.bay || !c.row || !c.tier) return;
    const tn = parseInt(c.tier, 10);
    if (isNaN(tn)) return;
    const key = `${normalizeBay(c.bay)}-${c.row}`;
    if (!stackMap[key]) stackMap[key] = new Set();
    stackMap[key].add(tn);
  });
  // 베이별 평균 단수
  const bayStacks = {};  // bay → [stackCount per row]
  Object.entries(stackMap).forEach(([key, tiers]) => {
    const [bay] = key.split('-');
    if (!bayStacks[bay]) bayStacks[bay] = [];
    bayStacks[bay].push(tiers.size);
  });

  const lines = [];
  if (parsed.bay) {
    const stacks = bayStacks[parsed.bay] || [];
    if (stacks.length === 0) return `📭 ${parsed.bay}번 베이 단수 데이터 없음`;
    const max = Math.max(...stacks);
    const min = Math.min(...stacks);
    const avg = (stacks.reduce((a, b) => a + b, 0) / stacks.length).toFixed(1);
    // 가장 높이 쌓인 tier
    const allTiers = [];
    Object.entries(stackMap).forEach(([key, tiers]) => {
      if (key.startsWith(`${parsed.bay}-`)) tiers.forEach(t => allTiers.push(t));
    });
    const highestTier = allTiers.length > 0 ? Math.max(...allTiers) : 0;
    lines.push(`📊 ${parsed.bay}번 베이 단수`);
    lines.push(`row별 단수: 최소 ${min} / 최대 ${max} / 평균 ${avg}단`);
    lines.push(`가장 높이 쌓인 tier: ${String(highestTier).padStart(2, '0')}`);
    return lines.join('\n');
  }

  // 전체 베이의 단수 분포
  const overall = Object.values(bayStacks).flat();
  if (overall.length === 0) return `📭 단수 데이터 없음`;
  const maxStack = Math.max(...overall);
  const avgStack = (overall.reduce((a, b) => a + b, 0) / overall.length).toFixed(1);
  lines.push(`📊 전체 단수 분석`);
  lines.push(`평균 ${avgStack}단 / 최대 ${maxStack}단`);
  lines.push('', `베이별 최대 단수 TOP 10:`);
  Object.entries(bayStacks)
    .map(([bn, arr]) => ({ bay: parseInt(bn), max: Math.max(...arr) }))
    .sort((a, b) => b.max - a.max)
    .slice(0, 10)
    .forEach(({ bay, max }) => lines.push(`  • ${bay}번: ${max}단`));
  return lines.join('\n');
}

// M3.3: 진행 상황
function formatProgress(parsed, results, allContainers) {
  // 진행 상황 자체는 desc에서 빼고 깔끔하게
  const baseDesc = describeQuery({ ...parsed, progressQuery: null }) || '전체';

  const baseParsed = { ...parsed, progressQuery: null };
  const baseResults = applyNLFilter(allContainers, baseParsed);
  const totalCount = baseResults.length;
  const doneCount = baseResults.filter(c => c._comp).length;
  const pendingCount = totalCount - doneCount;
  const pct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

  const lines = [];
  if (parsed.progressQuery === 'done') {
    lines.push(`✅ ${baseDesc} 완료: ${doneCount}대 / 전체 ${totalCount}대 (${pct}%)`);
    lines.push(`남은 작업: ${pendingCount}대`);
  } else {
    lines.push(`⏳ ${baseDesc} 남은 작업: ${pendingCount}대 / 전체 ${totalCount}대`);
    lines.push(`완료: ${doneCount}대 (${pct}%)`);
  }

  if (results.length > 0 && results.length <= 50) {
    lines.push('', `${parsed.progressQuery === 'done' ? '완료된' : '남은'} 컨 (${Math.min(results.length, 10)}대):`);
    results.slice(0, 10).forEach((c, i) => {
      const tag = [];
      if (c.fe) tag.push(c.fe);
      if (c.rf && c.tmp) tag.push(`${c.tmp}°C`);
      if (c.dg) tag.push(`DG${c.dgc || ''}`);
      lines.push(`  ${i + 1}. ${c.cn?.slice(-4) || '?'} @ ${fmtPos(c) || '?'}${tag.length ? ' [' + tag.join(' ') + ']' : ''}`);
    });
    if (results.length > 10) lines.push(`  ... 외 ${results.length - 10}대`);
  }
  return lines.join('\n');
}

// ─── V7.99-15: 완료 예정 시각 (대화체) ───
//   데이터에 이미 있는 완료 타임스탬프(c._comp.at)로 실제 작업 페이스를 직접 계산한다.
//   사용자가 속도를 말해줄 필요 없음. AI도 필요 없음 — 순수 로컬 계산.
//   검수사가 종일 단조로운 작업 중이라, 숫자만 던지지 않고 동료처럼 한마디 거든다.
function formatEta(parsed, allContainers, ctx) {
  // allContainers는 호출부에서 이미 평택분만 넘어옴(SearchPanel _ptk 필터).
  //   반환은 다른 답변과 동일하게 '문자열' — 첫 줄이 음성으로 읽히므로 첫 줄에 대화체 한 문장.
  const total = allContainers.length;
  const doneAts = allContainers
    .map(c => (c._comp && typeof c._comp === 'object' ? c._comp.at : null))
    .filter(at => typeof at === 'number' && at > 0)
    .sort((a, b) => a - b);
  const doneCount = allContainers.filter(c => !!c._comp).length;
  const remain = Math.max(0, total - doneCount);

  if (total > 0 && remain === 0) {
    return `작업 다 끝났어요. 수고 많으셨습니다.\n🎉 평택분 ${total}대 전부 완료했어요.`;
  }
  if (doneCount === 0) {
    return `아직 시작 전이에요. 평택분 ${total}대 남았어요.\n몇 대 진행되면 페이스를 보고 완료 시각을 알려드릴게요.`;
  }
  if (doneAts.length < 2) {
    return `${remain}대 남았어요. 조금 더 진행되면 끝날 시각을 알려드릴게요.\n완료 ${doneCount}대 · 남은 ${remain}대 — 아직 페이스를 잴 기록이 부족해요.`;
  }

  // 최근 페이스 우선 — 최근 20개(없으면 전체) 완료 간격으로 시간당 처리량.
  const recent = doneAts.slice(-Math.min(20, doneAts.length));
  const spanMs = recent[recent.length - 1] - recent[0];
  const perHour = spanMs > 0 ? (recent.length - 1) / (spanMs / 3600000) : 0;
  if (!(perHour > 0)) {
    return `${remain}대 남았어요.\n완료 간격이 너무 짧아 페이스를 계산하기 어려워요. 조금 더 진행되면 다시 물어봐 주세요.`;
  }

  const remainMin = Math.round((remain / perHour) * 60);
  const eta = new Date(Date.now() + remainMin * 60000);
  const hh = eta.getHours(), mm = eta.getMinutes();
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const etaStr = `${ampm} ${h12}시 ${String(mm).padStart(2, '0')}분`;
  const etaShort = mm === 0 ? `${h12}시` : `${h12}시 ${String(mm).padStart(2, '0')}분`;
  const rate = Math.round(perHour);

  const hPart = Math.floor(remainMin / 60), mPart = remainMin % 60;
  let durKo = hPart > 0 && mPart > 0 ? `약 ${hPart}시간 ${mPart}분`
            : hPart > 0 ? `약 ${hPart}시간` : `약 ${mPart}분`;

  let cheer = '';
  if (remain <= 10) cheer = ' 거의 다 왔어요.';
  else if (remain <= total * 0.25) cheer = ' 막바지네요, 조금만 더.';
  else if (remain >= total * 0.75) cheer = ' 차근차근 가요.';

  // 첫 줄 = 음성용 대화 문장. 이후 = 화면 상세.
  return (
    `${remain}대 남았어요. 지금 페이스면 ${durKo}, ${etaShort}쯤 끝나겠네요.${cheer}\n` +
    `⏱ 예상 완료: ${etaStr}쯤\n` +
    `남은 작업: ${remain}대 (완료 ${doneCount} / 전체 ${total})\n` +
    `현재 페이스: 시간당 약 ${rate}대 (최근 ${recent.length}대 기준)\n` +
    `남은 시간: ${durKo}`
  );
}

// ─── V7.99-16: 양하신고 점검 ───
//   "양하신고할까?" → 그날 발생한 이상 건을 신고 리스트(세관 신고) 기준으로 정리.
//   판별(데이터 기반, 추측 없음):
//     누락 = flag 'missing'(선박에 없어 완료) + 보조: 리스트에 있으나 미완료(작업 종료 시 안 내려진 것)
//     초과 = flag 'extra'(리스트에 없는데 내림) + 보조: _src==='edi'(리스트 밖)인데 완료된 것
//     바뀜 = flag 'swapped'(다른 번호가 옴)
//     리씰 = sl_orig ≠ 현재 sl (현장에서 실을 다시 단 것)
//     실오류 = auditSeals (중복·혼입·자리수)
//   allContainers는 평택분(SearchPanel _ptk 필터). 각 컨은 _comp(={at,flag,note}|null), _src, sl, sl_orig 보유.
function formatCustomsReport(parsed, allContainers, ctx) {
  const cs = allContainers || [];
  const compInfo = (c) => (c._comp && typeof c._comp === 'object') ? c._comp : (c._comp ? {} : null);
  const last4 = (c) => (c.cn || '').slice(-4) || '?';
  const onList = (c) => c._src === 'list' || c._src === 'both';  // 신고 리스트에 있음

  // 1) 누락 — 명시 flag + 보조(리스트에 있는데 미완료)
  const missingFlagged = cs.filter(c => compInfo(c)?.flag === 'missing');
  const pendingOnList = cs.filter(c => onList(c) && !c._comp);  // 작업 종료 전이면 정상, 종료 후면 누락 의심
  // 2) 초과 — 명시 flag + 보조(리스트 밖인데 완료)
  const extraFlagged = cs.filter(c => compInfo(c)?.flag === 'extra');
  const extraImplied = cs.filter(c => c._src === 'edi' && c._comp && compInfo(c)?.flag !== 'extra');
  // 3) 바뀜
  const swapped = cs.filter(c => compInfo(c)?.flag === 'swapped');
  // 4) 리씰 (원본 실번호와 현재가 다름)
  const norm = (s) => String(s || '').toUpperCase().replace(/[\s\-]/g, '');
  const reseal = cs.filter(c => c.sl_orig && c.sl && norm(c.sl_orig) !== norm(c.sl));
  // 5) 실오류
  const audit = auditSeals(cs);
  const sealErrs = audit.items || [];

  // 중복 제거 헬퍼
  const uniq = (arr) => { const seen = new Set(); return arr.filter(c => { if (seen.has(c.cn)) return false; seen.add(c.cn); return true; }); };
  const missing = uniq(missingFlagged);
  const extra = uniq([...extraFlagged, ...extraImplied]);

  const totalIssues = missing.length + extra.length + swapped.length + reseal.length + sealErrs.length;

  // 음성용 첫 줄 (요약 한 문장)
  const sumParts = [];
  if (missing.length) sumParts.push(`누락 ${missing.length}건`);
  if (extra.length) sumParts.push(`초과 ${extra.length}건`);
  if (swapped.length) sumParts.push(`바뀜 ${swapped.length}건`);
  if (reseal.length) sumParts.push(`리씰 ${reseal.length}건`);
  if (sealErrs.length) sumParts.push(`실오류 ${sealErrs.length}건`);

  const lines = [];
  if (totalIssues === 0) {
    lines.push('이상 건 없습니다. 신고 리스트 그대로 신고하시면 돼요.');
    lines.push('📋 양하신고 점검 — 이상 없음');
    if (pendingOnList.length) {
      lines.push('', `※ 아직 완료 안 된 컨 ${pendingOnList.length}대 있어요. 작업이 끝난 게 맞다면 누락일 수 있으니 확인하세요.`);
    }
    return lines.join('\n');
  }

  lines.push(`신고 전 확인하세요. 이상 ${totalIssues}건 — ${sumParts.join(', ')}.`);
  lines.push('📋 양하신고 점검 결과');

  if (missing.length) {
    lines.push('', `🚫 누락 ${missing.length}건 (선박에 없음 / 신고 리스트에서 빼거나 사고 보고):`);
    missing.slice(0, 20).forEach((c, i) => {
      const n = compInfo(c)?.note;
      lines.push(`  ${i + 1}. ${last4(c)}  ${c.cn || ''}${n ? ' — ' + n : ''}`);
    });
  }
  if (extra.length) {
    lines.push('', `➕ 초과 ${extra.length}건 (리스트에 없는데 내려짐 / 신고에 추가):`);
    extra.slice(0, 20).forEach((c, i) => {
      const n = compInfo(c)?.note;
      lines.push(`  ${i + 1}. ${last4(c)}  ${c.cn || ''} @ ${fmtPos(c) || '위치미상'}${n ? ' — ' + n : ''}`);
    });
  }
  if (swapped.length) {
    lines.push('', `🔄 컨테이너 바뀜 ${swapped.length}건 (신고 번호와 다른 컨이 옴):`);
    swapped.slice(0, 20).forEach((c, i) => {
      const n = compInfo(c)?.note;
      lines.push(`  ${i + 1}. 실제 ${last4(c)}  ${c.cn || ''}${n ? ' (신고: ' + n + ')' : ''}`);
    });
  }
  if (reseal.length) {
    lines.push('', `🔒 리씰 ${reseal.length}건 (현장에서 실번호 변경 — 신고서 실번호 반영):`);
    reseal.slice(0, 20).forEach((c, i) => {
      lines.push(`  ${i + 1}. ${last4(c)}  ${c.sl_orig} → ${c.sl}`);
    });
  }
  if (sealErrs.length) {
    lines.push('', `⚠ 실번호 오류 ${sealErrs.length}건 (점검 권장):`);
    sealErrs.slice(0, 20).forEach((e, i) => {
      lines.push(`  ${i + 1}. ${e.cn}  ${e.seal || ''} — ${e.reason}`);
    });
  }
  if (pendingOnList.length) {
    lines.push('', `※ 아직 완료 안 된 컨 ${pendingOnList.length}대. 작업이 끝났다면 누락 여부 확인하세요.`);
  }
  return lines.join('\n');
}

// ─── V8.00: 인수인계서 생성 ───
//   "인수인계 자료 만들어줘" → 남은 작업 + (양하 남으면)양하신고할 것 + 특이사항을 한 화면에.
//   2단계 대화: SearchPanel이 이 함수로 초안 생성 → 검수사에게 "특이사항/더 전달할 것" 되물음 →
//   답을 extraNote로 받아 다시 호출하면 메모가 합쳐진 최종본.
//   allContainers는 평택분(_ptk). 양하·선적 둘 다 _mode로 구분해 집계.
//   handoverInfo: { byInspector, voyageLabel, shipName, extraNote } (선택)
export function generateHandover(allContainers, handoverInfo = {}) {
  const cs = allContainers || [];
  const compInfo = (c) => (c._comp && typeof c._comp === 'object') ? c._comp : (c._comp ? {} : null);
  const last4 = (c) => (c.cn || '').slice(-4) || '?';

  const disch = cs.filter(c => c._mode === 'discharge');
  const load = cs.filter(c => c._mode === 'loading');
  const dischDone = disch.filter(c => c._comp).length;
  const loadDone = load.filter(c => c._comp).length;
  const dischPend = disch.length - dischDone;
  const loadPend = load.length - loadDone;

  const lines = [];
  const now = new Date();
  const hh = now.getHours(), mm = now.getMinutes();
  const ts = `${now.getMonth() + 1}/${now.getDate()} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  // 헤더
  lines.push(`📋 인수인계서  (${ts} 작성${handoverInfo.byInspector ? ' · ' + handoverInfo.byInspector : ''})`);
  if (handoverInfo.shipName || handoverInfo.voyageLabel) {
    lines.push(`선박/항차: ${handoverInfo.shipName || ''} ${handoverInfo.voyageLabel || ''}`.trim());
  }

  // 1) 남은 작업
  lines.push('', '━━ 남은 작업 ━━');
  if (disch.length) {
    lines.push(`⬇ 양하: 남은 ${dischPend}대 / 전체 ${disch.length}대 (완료 ${dischDone})`);
  }
  if (load.length) {
    lines.push(`⬆ 선적: 남은 ${loadPend}대 / 전체 ${load.length}대 (완료 ${loadDone})`);
  }
  if (!disch.length && !load.length) lines.push('작업 데이터 없음.');

  // 남은 작업 베이 분포 (어디가 남았는지 한눈에)
  const pendBays = (arr) => {
    const set = new Set();
    arr.forEach(c => { if (!c._comp && c.bay != null) { const b = parseInt(normalizeBay(c.bay), 10); if (!isNaN(b)) set.add(b); } });
    return [...set].sort((a, b) => a - b);
  };
  if (dischPend > 0) {
    const bs = pendBays(disch);
    if (bs.length) lines.push(`  · 양하 남은 베이: ${bs.join(', ')}`);
  }
  if (loadPend > 0) {
    const bs = pendBays(load);
    if (bs.length) lines.push(`  · 선적 남은 베이: ${bs.join(', ')}`);
  }

  // 2) 양하신고할 것 (양하분이 있으면) — formatCustomsReport와 같은 판별
  if (disch.length) {
    const norm = (s) => String(s || '').toUpperCase().replace(/[\s\-]/g, '');
    const onList = (c) => c._src === 'list' || c._src === 'both';
    const missing = disch.filter(c => compInfo(c)?.flag === 'missing');
    const extra = disch.filter(c => compInfo(c)?.flag === 'extra' || (c._src === 'edi' && c._comp));
    const swapped = disch.filter(c => compInfo(c)?.flag === 'swapped');
    const reseal = disch.filter(c => c.sl_orig && c.sl && norm(c.sl_orig) !== norm(c.sl));
    const audit = auditSeals(disch);
    const sealErrs = audit.items || [];
    const uniq = (arr) => { const s = new Set(); return arr.filter(c => { if (s.has(c.cn)) return false; s.add(c.cn); return true; }); };
    const mU = uniq(missing), eU = uniq(extra);
    const totalIssues = mU.length + eU.length + swapped.length + reseal.length + sealErrs.length;

    lines.push('', '━━ 양하신고 (인계 시 처리/공유) ━━');
    if (totalIssues === 0) {
      lines.push('이상 건 없음.');
    } else {
      if (mU.length) lines.push(`🚫 누락 ${mU.length}: ${mU.slice(0, 10).map(last4).join(', ')}`);
      if (eU.length) lines.push(`➕ 초과 ${eU.length}: ${eU.slice(0, 10).map(last4).join(', ')}`);
      if (swapped.length) lines.push(`🔄 바뀜 ${swapped.length}: ${swapped.slice(0, 10).map(last4).join(', ')}`);
      if (reseal.length) lines.push(`🔒 리씰 ${reseal.length}: ${reseal.slice(0, 10).map(c => `${last4(c)}(${c.sl_orig}→${c.sl})`).join(', ')}`);
      if (sealErrs.length) lines.push(`⚠ 실오류 ${sealErrs.length}: ${sealErrs.slice(0, 10).map(e => e.cn).join(', ')}`);
    }
  }

  // 3) 특이사항 — 데이터로 잡히는 것 (리퍼 온도 미입력, 위험물, XRAY 미처리 등)
  const special = [];
  const reefers = cs.filter(c => isReeferContainer(c) && !c._comp);
  const reeferNoTmp = reefers.filter(c => !c.tmp && c.fe !== 'E' && !c.rfdry && !c.mkcon);
  if (reeferNoTmp.length) special.push(`냉동 온도 미입력 ${reeferNoTmp.length}대 (조회 시 입력 필요)`);
  const dg = cs.filter(c => c.dg && !c._comp);
  if (dg.length) special.push(`위험물 ${dg.length}대 — 별도 취급`);
  const fr = cs.filter(c => (c.fr || c.ot) && !c._comp);
  if (fr.length) special.push(`FR/OT ${fr.length}대 — 적재 제약 주의`);
  const mk = cs.filter(c => c.mkcon && !c._comp);
  if (mk.length) special.push(`제작컨테이너 ${mk.length}대 — 컨 자체가 상품(빈 컨), 온도 없음 정상`);
  if (special.length) {
    lines.push('', '━━ 특이사항 ━━');
    special.forEach(s => lines.push(`· ${s}`));
  }

  // 4) 검수사 직접 메모 (되묻기로 받은 것)
  if (handoverInfo.extraNote && handoverInfo.extraNote.trim()) {
    lines.push('', '━━ 인계 메모 (검수사 직접 전달) ━━');
    lines.push(handoverInfo.extraNote.trim());
  }

  return lines.join('\n');
}
export function generateIntroAnswer(shipName) {
  const ship = shipName ? `지금은 ${shipName} 작업 자료로 답하고 있습니다.` : '작업 선박을 선택하면 그 자료로 답합니다.';
  return [
    `저는 탤리맨 마스터, 평택항 컨테이너 검수 도우미입니다.`,
    `${ship} (${APP_VERSION})`,
    '',
    '이렇게 물어보세요.',
    '  • "리퍼 몇 대" / "5번 베이" / "엑스레이 어디"',
    '  • "브리핑" / "실번호 점검" / "남은 거 몇 대"',
    '  • "입항 언제" / "지금 몇 시" / "날씨"',
  ].join('\n');
}

export function generateTimeAnswer(now) {
  const d = now instanceof Date ? now : new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const h24 = d.getHours();
  const ampm = h24 < 12 ? '오전' : '오후';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `지금은 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일, ${ampm} ${h12}시 ${d.getMinutes()}분입니다.`;
}

// ─── V7.93: 트윈 작업 무게 점검 (사용자 도메인: 합계 55톤 초과 = 트윈 불가) ───
//   불균형 기준(TWIN_DIFF_WARN_KG)은 임시 10톤 — 크레인 실제 기준 확정 시 이 상수만 변경.
//   짝 규칙은 twin.js getBayPairs(pairsMap)를 주입받음 — 트윈 작업 화면과 동일 규칙 보장.
export const TWIN_MAX_TOTAL_KG = 55000;
// V7.93-02: 무게차 한계는 부두별 (사용자 확정) — 동방아이포트(PNCT) 14톤, 평택컨테이너터미널(PCTC) 20톤.
//   차이 초과 = 수평이 안 맞아 트윈 불가 (주의가 아니라 불가). 부두 미상이면 보수적으로 14톤.
export const TWIN_DIFF_LIMITS = { PNCT: 14000, PCTC: 20000 };
export function twinDiffLimit(pier) {
  return TWIN_DIFF_LIMITS[String(pier || '').toUpperCase().trim()] || 14000;
}

function is20ft(c) {
  return /^2/.test(c.iso || '') || (isoToLabel(c.iso) || '').startsWith('20');
}

// 20ft 컨테이너들을 트윈 쌍으로 묶기 — 홀수 베이 + pairsMap 짝꿍 베이 + 같은 row/tier/모드
export function buildTwinPairs(containers, pairsMap) {
  const c20 = containers.filter(c => is20ft(c) && c.bay && c.row && c.tier);
  const byPos = new Map();
  c20.forEach(c => byPos.set(`${c._mode}|${parseInt(c.bay, 10)}|${c.row}|${c.tier}`, c));
  const used = new Set();
  const out = [];
  c20.forEach(a => {
    if (used.has(a.cn)) return;
    const b1 = parseInt(a.bay, 10);
    if (!Number.isFinite(b1) || b1 % 2 === 0) return;
    const pb = pairsMap?.[String(b1)];
    if (!pb) return;
    const b = byPos.get(`${a._mode}|${parseInt(pb, 10)}|${a.row}|${a.tier}`);
    if (!b || used.has(b.cn) || b.cn === a.cn) return;
    used.add(a.cn); used.add(b.cn);
    out.push([a, b]);
  });
  return out;
}

// 쌍 분석: ok / over(55톤 초과) / imbal(차이 큼) / noWt(무게 미상)
export function analyzeTwinPairs(pairs, diffLimitKg = 14000) {
  const r = { ok: [], over: [], diff: [], noWt: [] };
  for (const [a, b] of pairs) {
    const wa = parseInt(a.wt, 10) || 0, wb = parseInt(b.wt, 10) || 0;
    if (!wa || !wb) { r.noWt.push({ a, b, wa, wb }); continue; }
    const total = wa + wb, diff = Math.abs(wa - wb);
    if (total > TWIN_MAX_TOTAL_KG) r.over.push({ a, b, wa, wb, total, diff });
    else if (diff > diffLimitKg) r.diff.push({ a, b, wa, wb, total, diff });
    else r.ok.push({ a, b, wa, wb, total, diff });
  }
  return r;
}

const t1 = (kg) => (kg / 1000).toFixed(1).replace(/\.0$/, '');
const pairPos = (p) => `${fmtPos(p.a)} ↔ ${fmtPos(p.b)}`;
const pairCn = (p) => `${p.a.cn?.slice(-4) || '?'}·${p.b.cn?.slice(-4) || '?'}`;

export function generateTwinCheckAnswer(parsed, containers, pairsMap, pier = '') {
  // 베이 지정: "20번 베이 트윈" — 짝수로 물어도 양옆 홀수 쌍 포함 (N-1·N·N+1)
  let pool = containers;
  let scope = '전체';
  if (parsed.bay) {
    const n = parseInt(parsed.bay, 10);
    pool = containers.filter(c => Math.abs(parseInt(c.bay, 10) - n) <= 1);
    scope = `${n}번 베이`;
  }
  const pairs = buildTwinPairs(pool, pairsMap);
  if (!pairs.length) return `${scope} 트윈 쌍이 없습니다. (단독 베이이거나 같은 열·단의 20피트 짝이 없음)`;
  const limit = twinDiffLimit(pier);
  const pierLabel = TWIN_DIFF_LIMITS[String(pier || '').toUpperCase().trim()] ? String(pier).toUpperCase() : '부두 미상·보수 기준';
  const r = analyzeTwinPairs(pairs, limit);
  const bad = r.over.length + r.diff.length;
  const lines = [];
  // 첫 줄 = 음성용 한 문장
  if (bad) lines.push(`${scope} 트윈 불가 ${bad}쌍 — ${[r.over.length ? '무게 초과' : null, r.diff.length ? '무게차 초과' : null].filter(Boolean).join('·')}. 위치 확인하세요.`);
  else if (r.noWt.length && !r.ok.length) lines.push(`${scope} 트윈 ${pairs.length}쌍 — 무게 정보가 없어 판단 불가.`);
  else lines.push(`${scope} 트윈 ${pairs.length}쌍 모두 가능합니다.`);
  if (r.over.length) {
    lines.push('', `🚫 무게 초과 (합계 55톤↑) — 트윈 불가, 싱글 작업:`);
    r.over.forEach(p => lines.push(`  • ${pairPos(p)} — 합계 ${t1(p.total)}톤 (${t1(p.wa)}+${t1(p.wb)}) ${pairCn(p)}`));
  }
  if (r.diff.length) {
    lines.push('', `🚫 무게차 초과 (${pierLabel} 한계 ${t1(limit)}톤↑) — 수평 불가, 싱글 작업:`);
    r.diff.forEach(p => lines.push(`  • ${pairPos(p)} — 차이 ${t1(p.diff)}톤 (${t1(p.wa)}/${t1(p.wb)}) ${pairCn(p)}`));
  }
  if (r.noWt.length) {
    lines.push('', `❓ 무게 미상 ${r.noWt.length}쌍 — EDI 무게 확인 필요:`);
    r.noWt.slice(0, 6).forEach(p => lines.push(`  • ${pairPos(p)} ${pairCn(p)}`));
  }
  if (r.ok.length) {
    const maxOk = Math.max(...r.ok.map(p => p.total));
    lines.push('', `✅ 가능 ${r.ok.length}쌍 (최대 합계 ${t1(maxOk)}톤)`);
  }
  return lines.join('\n');
}


// V8.60: 맛집 돌림판 안내 답변 — 첫 줄은 음성으로 읽힌다.
export function generateFoodAnswer(slot) {
  const label = { breakfast: '아침', lunch: '점심', dinner: '저녁', night: '야식', any: '식사' }[slot] || '식사';
  return `🎰 ${label} 뭐 먹을지 돌림판으로 정해 드릴게요!\n\n음성이면 잠시 후 돌림판이 자동으로 열립니다. 아래 버튼으로 바로 돌릴 수도 있어요.\n(홈 화면 🍽 맛집 메뉴에서 식당 추가·별점도 가능합니다.)`;
}
