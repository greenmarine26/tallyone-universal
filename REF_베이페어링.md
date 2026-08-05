# REF — 베이 페어링 (pairEven) 영구 참조

> 데이터로 PASS 검증된 사실만 기록. 다른 Claude는 페어 관련 작업 전 이 문서를 먼저 읽을 것.
> 최초 작성 근거: V7.98-11 카고플랜 페어 "3 (4)5"→"3 5" 붕괴 버그 수정 (node 실함수 시뮬 ALL PASS).

## 1. 페어 저장 모델 (진실)

40ft 컨테이너는 짝수 베이 1개를 차지하고 물리적으로 양옆 홀수 2개 자리를 덮는다. 표기는 "홀 (짝)홀" 트리오(예: "3 (4)5") 또는 "(짝)홀" 페어(예: "(04)05")다.

매트릭스 빌더는 페어를 **홀수 베이 엔트리 1개**로 저장하고, 그 엔트리의 `pairEven` 필드에 짝수 번호를 넣는다. **짝수 베이는 별도 키를 만들지 않는다.**

- 예: "(04)05" → 키 `005`, `pairEven='04'`. `004` 키는 존재하지 않음.
- 트리오 "3 (4)5" → 홀수 `003`(pairEven 없음, top) + 홀수 `005`(pairEven='04'). `004` 없음.

단, .def/v5 PDF 파싱본은 **짝수를 별도 엔트리**(cells 보유)로 갖는 경우가 있다. → 같은 배 안에서도 두 표현(pairEven 흡수 vs 짝수 별도)이 **공존 가능**하며, 이게 "어떤 베이는 페어가 되고 어떤 베이는 안 되던" 비대칭의 근원이다.

## 2. 페어를 다루는 모든 함수 (수정 시 전부 점검)

| 함수 | 파일 | 역할 | pairEven 처리 |
|---|---|---|---|
| `createEmptyBayEntry(bayNum, pairEven)` | shipMatrixBuilder.js | 홀수 엔트리 생성 시 pairEven 저장 | 생성자 (정의처) |
| `matrixToBayDictEntry` | shipMatrixBuilder.js | byBay → baysSummary 직렬화 (`pairEven: e.pairEven \|\| null`) | 전파 ✓ |
| `detectMissingBays` | shipMatrixBuilder.js | 누락 베이 경고. presentSet에 pairEven 짝수를 "존재"로 추가 → 페어 짝수를 누락으로 오탐하지 않음 | 인식 ✓ (M6.94.36) |
| `autoPairBays` | cargoPlanCore.js | 카고플랜 트리오/단독 페어링 | 인식 ✓ (V7.98-11). 짝수-별도 루프 뒤에 pairEven 루프 추가 |
| matrixBays 생성부 | components/PrintableCargoPlanV2.jsx | dict → BayBoxV2 입력 객체 매핑 | 전파 ✓ (V7.98-11). `pairEven: summary?.pairEven \|\| b.pairEven \|\| null` |
| pairEven 리졸버 헬퍼 | cargoPlanCore.js (~880행) | 짝수 bayNum 조회 시 pairEven으로 묶인 홀수 엔트리 반환 | 인식 ✓ |
| `buildBayPages` | components/PrintableBayDetail.jsx, components/PrintableCargoPlan.jsx | 베이상세/카고플랜v1 페이지 분할·제목 "BAY(even)odd" | **(n-1, n) 휴리스틱 — pairEven 미사용, 점검 권장** |
| `splitForeAft` | components/PrintableBayDetail.jsx | [홀,짝,홀] 트리오 fore/aft 분할 | 짝수 별도 존재 기준 — 점검 권장 |
| `getBayPairs` / `findTwinCandidate` | twin.js | 트윈 작업 화면 짝꿍 판정 | **점검 필요** (실데이터 미확인) |

✓ = 코드로 확인됨. "점검" = pairEven 적용 여부 미확인 → 페어 수정 시 반드시 재확인.

## 3. 절대 원칙

1. **페어 함수는 여러 개다. 한 곳만 pairEven 보정하면 비대칭 버그가 재발한다.** (V7.98-11 사례: detectMissingBays는 M6.94.36에서 보정받았으나 autoPairBays는 빠져 있었음 → "7 (8)9"는 되고 "3 (4)5"는 "3 5"로 붕괴.) 페어 관련 수정 시 §2 표 전부를 점검할 것.
2. **짝꿍 판정을 짝수 베이의 EDI 적재 여부에 의존시키지 말 것.** 그 슬롯에 40ft가 안 실린 항차는 EDI/baySet에 짝수가 안 나타나 페어가 붕괴한다. 판정은 **매트릭스 구조 / pairEven** 기준으로만.
3. pairEven은 항상 해당 홀수의 좌측 짝수(= 홀수-1). 트리오의 top(반대편 홀수)은 `짝수-1`.

## 4. 검증 (V7.98-11, node 실함수 시뮬)

- pairEven 저장 페어(`005` pairEven='04') → 트리오 `["03","(04)05"]` 형성. **PASS**
- 짝수-별도 저장(`004`,`008` 엔트리) → `["07","(08)09"]` 형성 불변. **PASS**
- 단독 "03"/"05" 잔존 안 함(붕괴 해소). **PASS**
- generatePdfBays / autoPageLayout 트리오 정상 소비. **PASS**
- 레거시(순수 짝수-별도) 회귀 0, 짝수 양방향 저장 시 중복 트리오 0. **PASS**
