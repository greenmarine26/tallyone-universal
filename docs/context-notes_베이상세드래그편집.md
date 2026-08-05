# 결정 노트 — 베이상세 드래그 편집

- 진입은 3D 아님: 사용자가 "베이 선택 시 굳이 3D 안 보여도 되고 베이상세처럼" 확정.
- 베이상세 = 카고플랜 BayBoxV2 재사용(별도 격자 작성 금지). 페어는 카고플랜처럼 trio.
- 백엔드 신규 없음: fbReassignContainerPosition(voyageKey,mode,cn,newBay,newRow,newTier,by).
    칸 드롭=좌표 지정, 임시창고 드롭=빈 문자열(미배정). swap은 V7.94-24에 이미 구현.
- 선결: computeBayRenderData 셀에 cn 없음(cn:null) → posMap(${bay}|${tier}→{rowLbl→컨})으로 부착.
- rubber-band는 기존에 없음(셀 클릭 토글만) → 신규 추가.
