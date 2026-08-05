import React, { useState, useEffect, useMemo } from 'react';

// ============================================================================
// 데이터 (p = 단일 문장 / q = 선원질문+답변옵션)
// ============================================================================
const DATA = [
  {
    id: 'boarding', label: '승선/사다리', icon: '🪜',
    items: [
      { type: 'p', ko: '갱웨이를 내려 주세요.', en: 'Please lower the gangway.' },
      { type: 'p', ko: '사다리를 내려 주실 수 있을까요?', en: 'Could you lower the gangway, please?' },
      { type: 'p', ko: '갱웨이는 어느 쪽에 있습니까?', en: 'Which side is the gangway?' },
      { type: 'p', ko: '좌현쪽에 갱웨이를 내려 주세요.', en: 'Please lower the gangway on the port side.' },
      { type: 'p', ko: '우현쪽에 갱웨이를 내려 주세요.', en: 'Please lower the gangway on the starboard side.' },
      { type: 'p', ko: '승선해도 됩니까?', en: 'May I come aboard?' },
      { type: 'p', ko: '안녕하세요. 검수원입니다.', en: 'Good morning. I am the tally officer.' },
      { type: 'p', ko: '양하 작업 때문에 승선했습니다.', en: "I am boarding for the discharge operation." },
      { type: 'p', ko: '선적 작업 때문에 승선했습니다.', en: "I am boarding for the loading operation." },
      { type: 'p', ko: '본선 사무실은 어디입니까?', en: "Where is the ship's office?" },
      { type: 'p', ko: '1등 항해사를 뵐 수 있을까요?', en: 'May I see the Chief Officer, please?' },
      { type: 'p', ko: '천천히 말씀해 주세요.', en: 'Could you speak slowly, please?' },
      { type: 'p', ko: '다시 한 번 말씀해 주시겠어요?', en: 'Could you say that again, please?' },
      { type: 'q', heard: { ko: '누구십니까?', en: 'Who are you?' }, replies: [
        { ko: '저는 검수원입니다.', en: 'I am the tally officer.' },
        { ko: '검수 회사에서 왔습니다.', en: 'I am from the tally company.' },
      ]},
      { type: 'q', heard: { ko: '몇 명이 승선합니까?', en: 'How many people are boarding?' }, replies: [
        { ko: '저 혼자입니다.', en: 'Just me.' },
        { ko: '두 명입니다.', en: 'Two people.' },
        { ko: '네 명입니다.', en: 'Four people.' },
        { ko: '검수원 다섯 명입니다.', en: 'Five tally officers.' },
      ]},
    ],
  },

  {
    id: 'discharge', label: '양하 작업', icon: '⬇️',
    items: [
      { type: 'p', ko: '베이플랜을 받을 수 있을까요?', en: 'Could I have the bay plan, please?' },
      { type: 'p', ko: 'BAPLIE EDI 파일을 보내주실 수 있나요?', en: 'Could you send me the BAPLIE EDI file?' },
      { type: 'p', ko: '양하 리스트를 주십시오.', en: 'Please give me the discharge list.' },
      { type: 'p', ko: '적하목록이 있습니까?', en: 'Do you have the cargo manifest?' },
      { type: 'p', ko: '잠시 작업 중지해 주세요.', en: 'Please stop the operation for a moment.' },
      { type: 'q', heard: { ko: '양하 언제 시작합니까?', en: 'When will discharging begin?' }, replies: [
        { ko: '곧 시작합니다.', en: "We will start shortly." },
        { ko: '30분 뒤에 시작합니다.', en: "We will start in thirty minutes." },
        { ko: '한 시간 뒤에 시작합니다.', en: "We will start in one hour." },
        { ko: '0900시에 시작합니다.', en: "We will start at 0900 hours." },
        { ko: '1400시에 시작합니다.', en: "We will start at 1400 hours." },
      ]},
      { type: 'q', heard: { ko: '어느 베이부터 작업합니까?', en: 'Which bay will you start with?' }, replies: [
        { ko: '1번 베이부터 시작합니다.', en: 'We will start from Bay 1.' },
        { ko: '갑판부터 시작합니다.', en: 'We will start with the deck.' },
        { ko: '선창부터 시작합니다.', en: 'We will start with the hold.' },
      ]},
      { type: 'q', heard: { ko: '검수원이 몇 명입니까?', en: 'How many tally officers are there?' }, replies: [
        { ko: '두 명입니다.', en: 'Two officers.' },
        { ko: '네 명입니다.', en: 'Four officers.' },
        { ko: '여덟 명입니다.', en: 'Eight officers.' },
      ]},
      { type: 'q', heard: { ko: '갠트리 몇 대 사용합니까?', en: 'How many gantry cranes will be used?' }, replies: [
        { ko: '갠트리 한 대 사용합니다.', en: 'One gantry crane.' },
        { ko: '갠트리 두 대 사용합니다.', en: 'Two gantry cranes.' },
        { ko: '갠트리 세 대 사용합니다.', en: 'Three gantry cranes.' },
      ]},
      { type: 'q', heard: { ko: '시간당 몇 무브 가능합니까?', en: 'How many moves per hour?' }, replies: [
        { ko: '시간당 25무브입니다.', en: 'Twenty-five moves per hour.' },
        { ko: '시간당 30무브 정도입니다.', en: 'Around thirty moves per hour.' },
      ]},
      { type: 'q', heard: { ko: '양하 시간이 얼마나 걸립니까?', en: 'How long will the discharge take?' }, replies: [
        { ko: '약 두 시간 걸립니다.', en: 'About two hours.' },
        { ko: '약 네 시간 걸립니다.', en: 'About four hours.' },
        { ko: '약 여섯 시간 걸립니다.', en: 'About six hours.' },
      ]},
      { type: 'q', heard: { ko: '손상된 컨테이너 있습니까?', en: 'Are there any damaged containers?' }, replies: [
        { ko: '아직 손상은 없습니다.', en: 'No damage so far.' },
        { ko: '손상 컨테이너 한 대 있습니다.', en: 'There is one damaged container.' },
        { ko: '손상 컨테이너 두 대 있습니다.', en: 'There are two damaged containers.' },
        { ko: '나중에 보고서 드리겠습니다.', en: 'I will give you the report later.' },
      ]},
      { type: 'q', heard: { ko: '양하 다 끝났습니까?', en: 'Is the discharge complete?' }, replies: [
        { ko: '네, 양하 완료됐습니다.', en: 'Yes, discharging is completed.' },
        { ko: '아니오, 아직 작업 중입니다.', en: 'No, still in progress.' },
        { ko: '잔량 다섯 본 남았습니다.', en: 'Five boxes remaining.' },
      ]},
    ],
  },

  {
    id: 'loading', label: '선적 작업', icon: '⬆️',
    items: [
      { type: 'p', ko: '선적 계획서를 받을 수 있을까요?', en: 'Could I have the loading plan?' },
      { type: 'p', ko: '양하지(POD)별로 분리해서 적재해 주세요.', en: 'Please segregate the stowage by POD.' },
      { type: 'p', ko: '리퍼는 전원 공급 위치에 적재해 주세요.', en: 'Please stow the reefers at the power-supplied positions.' },
      { type: 'p', ko: '위험물은 격리 규정에 따라 적재해야 합니다.', en: 'Dangerous goods must be stowed according to segregation rules.' },
      { type: 'p', ko: '라싱 확인해 주세요.', en: 'Please check the lashing.' },
      { type: 'p', ko: '추가 라싱이 필요합니다.', en: 'Additional lashing is required.' },
      { type: 'p', ko: '본선 안정성에 문제 없습니까?', en: "Is there any issue with the vessel's stability?" },
      { type: 'q', heard: { ko: '선적 언제 시작합니까?', en: 'When can we start loading?' }, replies: [
        { ko: '곧 시작합니다.', en: 'We will start shortly.' },
        { ko: '한 시간 뒤에 시작합니다.', en: 'We will start in one hour.' },
        { ko: '양하 완료 후 시작합니다.', en: 'We will start after discharging is done.' },
        { ko: '1500시에 시작합니다.', en: 'We will start at 1500 hours.' },
      ]},
      { type: 'q', heard: { ko: '총 몇 본 선적합니까?', en: 'How many boxes will be loaded in total?' }, replies: [
        { ko: '총 200본입니다.', en: 'Two hundred boxes in total.' },
        { ko: '총 350본입니다.', en: 'Three hundred fifty boxes in total.' },
        { ko: '풀 280본, 엠티 40본입니다.', en: 'Two hundred eighty full and forty empty.' },
      ]},
      { type: 'q', heard: { ko: '리퍼는 몇 본입니까?', en: 'How many reefers will be loaded?' }, replies: [
        { ko: '리퍼 10본입니다.', en: 'Ten reefers.' },
        { ko: '리퍼 25본입니다.', en: 'Twenty-five reefers.' },
        { ko: '리퍼 없습니다.', en: 'No reefers.' },
      ]},
      { type: 'q', heard: { ko: '위험물 몇 본입니까?', en: 'How many DG containers?' }, replies: [
        { ko: '위험물 없습니다.', en: 'No DG containers.' },
        { ko: '위험물 세 본입니다.', en: 'Three DG containers.' },
        { ko: '위험물 다섯 본입니다.', en: 'Five DG containers.' },
      ]},
      { type: 'q', heard: { ko: '선적 언제 끝납니까?', en: 'When will loading be complete?' }, replies: [
        { ko: '약 두 시간 후 완료 예정입니다.', en: 'It will be completed in about two hours.' },
        { ko: '약 네 시간 후 완료 예정입니다.', en: 'It will be completed in about four hours.' },
        { ko: '1800시에 완료 예정입니다.', en: 'Completion is expected at 1800 hours.' },
      ]},
      { type: 'q', heard: { ko: '출항 준비됐습니까?', en: 'Are we ready to sail?' }, replies: [
        { ko: '라싱 완료 후 출항 가능합니다.', en: 'You can sail after lashing is complete.' },
        { ko: '서류 사인 후 출항 가능합니다.', en: 'You can sail after the paperwork is signed.' },
        { ko: '네, 출항 가능합니다.', en: 'Yes, you are clear to sail.' },
      ]},
    ],
  },

  {
    id: 'departure', label: '출항/시간', icon: '🕐',
    items: [
      { type: 'q', heard: { ko: '출항 시간이 언제입니까?', en: 'What is the ETD?' }, replies: [
        { ko: '오늘 새벽 3시 출항 예정입니다.', en: 'ETD is at 0300 hours, early morning.' },
        { ko: '오늘 새벽 5시 30분 출항 예정입니다.', en: 'ETD is at 0530 hours, before dawn.' },
        { ko: '오늘 아침 6시 출항 예정입니다.', en: 'Departure is at 0600, in the morning.' },
        { ko: '오늘 아침 7시 30분 출항 예정입니다.', en: 'ETD is at 7:30 AM.' },
        { ko: '오늘 오전 9시 출항 예정입니다.', en: 'ETD is at 0900 hours, mid-morning.' },
        { ko: '오늘 오전 10시 30분 출항 예정입니다.', en: 'Departure at 1030 hours.' },
        { ko: '오늘 정오 12시 출항 예정입니다.', en: 'ETD is at noon, 1200 hours.' },
        { ko: '오늘 오후 1시 출항 예정입니다.', en: 'ETD is at 1300 hours, after noon.' },
        { ko: '오늘 오후 2시 30분 출항 예정입니다.', en: 'Departure at 1430 hours, in the afternoon.' },
        { ko: '오늘 오후 4시 출항 예정입니다.', en: 'ETD is at 1600 hours, late afternoon.' },
        { ko: '오늘 저녁 6시 30분 출항 예정입니다.', en: 'ETD at 1830 hours, in the evening.' },
        { ko: '오늘 저녁 8시 출항 예정입니다.', en: 'Departure at 2000 hours.' },
        { ko: '오늘 저녁 9시 30분 출항 예정입니다.', en: 'ETD at 2130 hours, in the evening.' },
        { ko: '오늘 밤 11시 출항 예정입니다.', en: 'Departure at 2300 hours, at night.' },
        { ko: '오늘 자정에 출항 예정입니다.', en: 'ETD is at midnight, 0000 hours.' },
        { ko: '내일 새벽 1시 출항 예정입니다.', en: 'ETD is at 0100 hours tomorrow, after midnight.' },
      ]},
      { type: 'q', heard: { ko: '입항 시간이 언제였습니까?', en: 'What was the ETA?' }, replies: [
        { ko: '오늘 아침 7시에 입항했습니다.', en: 'We arrived at 0700 hours this morning.' },
        { ko: '오늘 오전 11시에 입항했습니다.', en: 'We arrived at 1100 hours.' },
        { ko: '오늘 오후 3시에 입항했습니다.', en: 'We arrived at 1500 hours, this afternoon.' },
      ]},
      { type: 'p', ko: '출항이 지연됐습니다.', en: 'Departure has been delayed.' },
      { type: 'p', ko: '한 시간 지연 예정입니다.', en: 'Delayed by one hour.' },
      { type: 'p', ko: '두 시간 지연 예정입니다.', en: 'Delayed by two hours.' },
      { type: 'p', ko: '날씨 때문에 출항이 지연됩니다.', en: 'Departure is delayed due to weather.' },
      { type: 'p', ko: '서류 처리 후 출항합니다.', en: 'We will sail after the paperwork is done.' },
      { type: 'q', heard: { ko: '다음 항구는 어디입니까?', en: 'What is the next port?' }, replies: [
        { ko: '다음 항구는 부산입니다.', en: 'The next port is Busan.' },
        { ko: '다음 항구는 인천입니다.', en: 'The next port is Incheon.' },
        { ko: '다음 항구는 상하이입니다.', en: 'The next port is Shanghai.' },
        { ko: '다음 항구는 도쿄입니다.', en: 'The next port is Tokyo.' },
      ]},
      { type: 'p', ko: '안전한 항해 되십시오.', en: 'Have a safe voyage.' },
    ],
  },

  {
    id: 'container', label: '컨테이너/실', icon: '📦',
    items: [
      { type: 'p', ko: '컨테이너 번호 확인하겠습니다.', en: 'Let me check the container number.' },
      { type: 'p', ko: '실 번호가 무엇입니까?', en: 'What is the seal number?' },
      { type: 'p', ko: '실이 없습니다.', en: 'The seal is missing.' },
      { type: 'p', ko: '실이 손상됐습니다.', en: 'The seal is broken.' },
      { type: 'p', ko: '실 번호가 서류와 다릅니다.', en: "The seal number doesn't match the document." },
      { type: 'p', ko: '사진 찍어두겠습니다.', en: "I'll take a picture for the record." },
      { type: 'p', ko: '엠티 컨테이너에 실이 달려 있습니다.', en: 'There is a seal on this empty container.' },
      { type: 'p', ko: '풀 컨테이너에 실이 없습니다.', en: 'This full container has no seal.' },
      { type: 'p', ko: '다시 한 번 확인 부탁드립니다.', en: 'Could you please double-check?' },
    ],
  },

  {
    id: 'damage', label: '손상/불일치', icon: '⚠️',
    items: [
      { type: 'p', ko: '컨테이너가 손상됐습니다.', en: 'The container is damaged.' },
      { type: 'p', ko: '좌측면이 찌그러졌습니다.', en: 'The left side is dented.' },
      { type: 'p', ko: '우측면에 구멍이 있습니다.', en: 'There is a hole on the right side.' },
      { type: 'p', ko: '천장이 손상됐습니다.', en: 'The roof is damaged.' },
      { type: 'p', ko: '바닥에 균열이 있습니다.', en: 'There is a crack on the floor.' },
      { type: 'p', ko: '문이 안 닫힙니다.', en: "The door won't close." },
      { type: 'p', ko: '화물이 새고 있습니다.', en: 'The cargo is leaking.' },
      { type: 'p', ko: '손상 보고서를 작성해야 합니다.', en: 'We need to make a damage report.' },
      { type: 'p', ko: 'EIR을 발급해 주세요.', en: 'Please issue an EIR.' },
      { type: 'p', ko: '서류와 실물이 다릅니다.', en: "The document and the actual cargo don't match." },
      { type: 'p', ko: '이 컨테이너는 리스트에 없습니다.', en: 'This container is not on the list.' },
      { type: 'p', ko: 'ISO 코드가 다릅니다.', en: 'The ISO code is different.' },
    ],
  },

  {
    id: 'location', label: '위치/베이', icon: '📍',
    items: [
      { type: 'p', ko: '그 컨테이너는 어디에 있습니까?', en: 'Where is that container located?' },
      { type: 'p', ko: '베이, 로우, 티어를 알려주세요.', en: 'Please tell me the bay, row, and tier.' },
      { type: 'p', ko: '갑판상에 있습니다.', en: "It's on deck." },
      { type: 'p', ko: '선창 안에 있습니다.', en: "It's in the hold." },
      { type: 'p', ko: '좌현쪽에 있습니다.', en: "It's on the port side." },
      { type: 'p', ko: '우현쪽에 있습니다.', en: "It's on the starboard side." },
      { type: 'p', ko: '20피트 짝꿍 슬롯입니다.', en: 'This is a twin slot for two 20-footers.' },
      { type: 'p', ko: '40피트 슬롯 위에 있습니다.', en: "It's on the 40-foot slot." },
    ],
  },

  {
    id: 'reefer', label: '리퍼', icon: '❄️',
    items: [
      { type: 'p', ko: '리퍼 온도 체크리스트를 주십시오.', en: 'Please give me the reefer temperature checklist.' },
      { type: 'p', ko: '리퍼 모니터링 시트를 받을 수 있을까요?', en: 'Could I have the reefer monitoring sheet?' },
      { type: 'p', ko: '입항 시 온도 점검 기록을 주세요.', en: 'Please give me the reefer temperature record at arrival.' },
      { type: 'p', ko: '모든 리퍼의 온도가 정상입니까?', en: 'Are all reefers running at the correct temperature?' },
      { type: 'p', ko: '어느 리퍼에 문제가 있습니까?', en: 'Which reefer has a problem?' },
      { type: 'p', ko: '이 리퍼는 온도가 입력되지 않았습니다.', en: 'The temperature for this reefer is not entered.' },
      { type: 'p', ko: '온도를 알려주십시오.', en: 'Please tell me the temperature.' },
      { type: 'p', ko: '전원이 꺼져 있습니다.', en: 'The power is off.' },
      { type: 'p', ko: '플러그가 빠져 있습니다.', en: 'The plug is disconnected.' },
      { type: 'p', ko: '알람이 울리고 있습니다.', en: 'The alarm is on.' },
      { type: 'p', ko: 'PTI 점검 결과 이상 없습니까?', en: 'Are there any issues with the PTI result?' },
      { type: 'q', heard: { ko: '설정 온도가 몇 도입니까?', en: 'What is the set temperature?' }, replies: [
        { ko: '영하 18도입니다.', en: 'Minus eighteen degrees Celsius.' },
        { ko: '영하 25도입니다.', en: 'Minus twenty-five degrees Celsius.' },
        { ko: '플러스 4도입니다.', en: 'Plus four degrees Celsius.' },
        { ko: '플러스 2도입니다.', en: 'Plus two degrees Celsius.' },
      ]},
    ],
  },

  {
    id: 'special', label: '특수화물', icon: '🛢️',
    items: [
      { type: 'p', ko: '플랫랙 화물이 규격을 초과합니다.', en: 'The flat rack cargo is over-dimensional.' },
      { type: 'p', ko: '오버폭입니까, 오버하이트입니까?', en: 'Is it over-width or over-height?' },
      { type: 'p', ko: '치수를 알려주세요.', en: 'Please tell me the dimensions.' },
      { type: 'p', ko: '오픈탑은 타폴린으로 덮여 있습니까?', en: 'Is the open top covered with a tarpaulin?' },
      { type: 'p', ko: '라싱 상태가 어떻습니까?', en: 'How is the lashing condition?' },
      { type: 'p', ko: '라싱이 풀려 있습니다.', en: 'The lashing is loose.' },
      { type: 'p', ko: '위험물 IMDG 클래스가 무엇입니까?', en: 'What is the IMDG class?' },
      { type: 'p', ko: 'UN 번호가 무엇입니까?', en: 'What is the UN number?' },
      { type: 'p', ko: '위험물은 격리해야 합니다.', en: 'Dangerous goods must be segregated.' },
      { type: 'p', ko: 'MSDS가 있습니까?', en: 'Do you have the MSDS?' },
    ],
  },

  {
    id: 'crane', label: '크레인', icon: '🏗️',
    items: [
      { type: 'p', ko: '크레인이 고장났습니다.', en: 'The crane has broken down.' },
      { type: 'p', ko: '작업 중지하겠습니다.', en: 'We will stop the operation.' },
      { type: 'p', ko: '잠시 대기해 주세요.', en: 'Please stand by for a moment.' },
      { type: 'p', ko: '작업 재개합니다.', en: 'We are resuming the operation.' },
      { type: 'p', ko: '비 때문에 작업 중단합니다.', en: 'Operation is suspended due to rain.' },
      { type: 'p', ko: '바람 때문에 작업 중단합니다.', en: 'Operation is suspended due to wind.' },
      { type: 'p', ko: '갠트리 위치를 옮겨주세요.', en: 'Please move the gantry position.' },
    ],
  },

  {
    id: 'xray', label: 'X-RAY/세관', icon: '🔍',
    items: [
      { type: 'p', ko: '이 컨테이너는 X-RAY 대상입니다.', en: 'This container is subject to X-RAY inspection.' },
      { type: 'p', ko: '별도로 적치해 주세요.', en: 'Please stack them separately.' },
      { type: 'p', ko: '세관 검사가 필요합니다.', en: 'Customs inspection is required.' },
      { type: 'p', ko: '검사 후 반출됩니다.', en: 'It will be released after inspection.' },
      { type: 'p', ko: '검역 대상 컨테이너입니다.', en: 'This is subject to quarantine inspection.' },
    ],
  },

  {
    id: 'safety', label: '안전', icon: '🦺',
    items: [
      { type: 'p', ko: '위험합니다! 비키세요!', en: 'Watch out! Stand back!' },
      { type: 'p', ko: '위에서 작업 중입니다.', en: 'Work is in progress overhead.' },
      { type: 'p', ko: '안전모를 착용하세요.', en: 'Please wear your helmet.' },
      { type: 'p', ko: '통로를 막지 마세요.', en: "Please don't block the passage." },
      { type: 'p', ko: '여기는 출입 금지 구역입니다.', en: 'This is a restricted area.' },
      { type: 'p', ko: '비상시 어디로 대피합니까?', en: 'Where is the muster station in case of emergency?' },
      { type: 'p', ko: '사고가 났습니다.', en: 'There has been an accident.' },
      { type: 'p', ko: '응급처치가 필요합니다.', en: 'We need first aid.' },
    ],
  },

  {
    id: 'closing', label: '마무리/사인', icon: '✍️',
    items: [
      { type: 'p', ko: '양하 완료됐습니다.', en: 'Discharging is completed.' },
      { type: 'p', ko: '선적 완료됐습니다.', en: 'Loading is completed.' },
      { type: 'p', ko: '1등 항해사에게 사인 받아 주세요.', en: "Please get the Chief Officer's signature on this." },
      { type: 'p', ko: '이 서류에 1항사 사인 부탁드립니다.', en: 'Could you have the Chief Officer sign this document?' },
      { type: 'p', ko: '양하 완료 보고서에 사인 받아 주세요.', en: 'Please have the discharge completion report signed by the Chief Officer.' },
      { type: 'p', ko: '선적 완료 보고서에 사인 받아 주세요.', en: 'Please have the loading completion report signed by the Chief Officer.' },
      { type: 'p', ko: '검수 보고서에 1항사 사인이 필요합니다.', en: "I need the Chief Officer's signature on the tally report." },
      { type: 'p', ko: '사인 받은 후 돌려주세요.', en: 'Please return it after signing.' },
      { type: 'p', ko: '사인된 사본 한 부 주세요.', en: 'Please give me a signed copy.' },
      { type: 'p', ko: '손상 컨테이너 목록입니다.', en: 'This is the list of damaged containers.' },
      { type: 'p', ko: '미양하 컨테이너 목록입니다.', en: 'This is the list of remaining containers.' },
      { type: 'p', ko: '수고하셨습니다.', en: 'Thank you for your hard work.' },
      { type: 'p', ko: '안전한 항해 되십시오.', en: 'Have a safe voyage.' },
    ],
  },
];

// ============================================================================
// 음성 합성 (Web Speech API)
// ============================================================================
function useSpeech() {
  const [voices, setVoices] = useState([]);
  const [supported, setSupported] = useState(true);
  const [voiceURI, setVoiceURI] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const en = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      setVoices(en);
      if (en.length > 0 && !voiceURI) {
        const us = en.find((v) => v.lang.toLowerCase().startsWith('en-us'));
        const gb = en.find((v) => v.lang.toLowerCase().startsWith('en-gb'));
        setVoiceURI((us || gb || en[0]).voiceURI);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
    // eslint-disable-next-line
  }, []);

  const speak = (text, rate = 1.0) => {
    if (!supported) {
      alert('이 브라우저는 음성 출력을 지원하지 않습니다. Chrome 또는 Safari 최신 버전을 이용해 주세요.');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    u.pitch = 1.0;
    u.volume = 1.0;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };

  const stop = () => { if (supported) window.speechSynthesis.cancel(); };

  return { speak, stop, voices, supported, voiceURI, setVoiceURI };
}

// ============================================================================
// 메인
// ============================================================================
export default function App({ open = true, onClose }) {
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [rate, setRate] = useState(1.0);
  const [favs, setFavs] = useState(new Set());
  const [showSet, setShowSet] = useState(false);
  const [playing, setPlaying] = useState(null);
  const { speak, stop, voices, supported, voiceURI, setVoiceURI } = useSpeech();

  const handleSpeak = (id, text) => {
    setPlaying(id);
    speak(text, rate);
    const ms = Math.max(1500, text.length * 90 / rate);
    setTimeout(() => setPlaying((p) => (p === id ? null : p)), ms);
  };

  const handleStop = () => { stop(); setPlaying(null); };

  const toggleFav = (id) => {
    setFavs((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // 모든 항목에 ID 부여
  const allItems = useMemo(() => {
    const list = [];
    DATA.forEach((c) => {
      c.items.forEach((it, i) => {
        list.push({ ...it, id: `${c.id}-${i}`, catId: c.id, catLabel: c.label, catIcon: c.icon });
      });
    });
    return list;
  }, []);

  const filtered = useMemo(() => {
    let items = allItems;
    if (cat === 'fav') items = items.filter((i) => favs.has(i.id));
    else if (cat !== 'all') items = items.filter((i) => i.catId === cat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((i) => {
        if (i.type === 'p') return i.ko.toLowerCase().includes(q) || i.en.toLowerCase().includes(q);
        if (i.type === 'q') {
          if (i.heard.ko.toLowerCase().includes(q) || i.heard.en.toLowerCase().includes(q)) return true;
          return i.replies.some((r) => r.ko.toLowerCase().includes(q) || r.en.toLowerCase().includes(q));
        }
        return false;
      });
    }
    return items;
  }, [allItems, cat, search, favs]);

  const totalCount = allItems.length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 overflow-y-auto" onClick={onClose}>
    <div className="min-h-screen bg-slate-900 text-slate-100" onClick={e => e.stopPropagation()} style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Pretendard, system-ui, sans-serif" }}>
      {/* M3.6: 닫기 버튼 (검수앱 모달용) */}
      {onClose && (
        <button onClick={onClose}
          className="fixed top-2 right-2 z-50 w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 text-xl font-bold shadow-lg">
          ×
        </button>
      )}
      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-slate-900 border-b-2 border-yellow-500/40 shadow-lg">
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs tracking-widest text-yellow-400 font-bold">PYEONGTAEK PORT · TALLY</div>
              <h1 className="text-base font-black text-slate-50">컨테이너 검수 영어 회화</h1>
            </div>
            <button
              onClick={() => setShowSet(!showSet)}
              className="w-11 h-11 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-yellow-400 text-xl"
            >⚙</button>
          </div>

          <div className="relative mb-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="한국어 또는 영어로 검색..."
              className="w-full h-11 px-3 pr-10 bg-slate-800 border-2 border-slate-700 focus:border-yellow-500 focus:outline-none rounded-lg text-sm text-slate-100 placeholder-slate-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400">✕</button>
            )}
          </div>

          {showSet && (
            <div className="mb-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
              <div className="mb-3">
                <div className="text-xs font-bold text-yellow-400 mb-2 tracking-wider">재생 속도</div>
                <div className="flex gap-1">
                  {[{ v: 0.7, l: '느리게' }, { v: 0.85, l: '약간 느리게' }, { v: 1.0, l: '보통' }, { v: 1.15, l: '빠르게' }].map((o) => (
                    <button key={o.v} onClick={() => setRate(o.v)}
                      className={`flex-1 h-9 text-xs font-semibold rounded ${rate === o.v ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              {voices.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-yellow-400 mb-2 tracking-wider">음성 ({voices.length}개)</div>
                  <select value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}
                    className="w-full h-9 px-2 bg-slate-700 border border-slate-600 rounded text-xs text-slate-100">
                    {voices.map((v) => (<option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>))}
                  </select>
                </div>
              )}
              {!supported && (
                <div className="mt-2 p-2 bg-red-900/40 border border-red-700 rounded text-xs text-red-200">
                  이 브라우저는 음성을 지원하지 않습니다.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <Chip a={cat === 'all'} onClick={() => setCat('all')} l="전체" i="📋" c={totalCount} />
            <Chip a={cat === 'fav'} onClick={() => setCat('fav')} l="즐겨찾기" i="⭐" c={favs.size} />
            {DATA.map((c) => (
              <Chip key={c.id} a={cat === c.id} onClick={() => setCat(c.id)} l={c.label} i={c.icon} c={c.items.length} />
            ))}
          </div>
        </div>
      </header>

      <div className="px-3 pt-3 pb-1 text-xs text-slate-400">
        {filtered.length}개 항목
        {cat === 'fav' && favs.size === 0 && <span className="ml-2 text-slate-500">— ⭐로 추가</span>}
      </div>

      <main className="px-3 pb-32 pt-2 space-y-3">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <div className="text-5xl mb-3">🔎</div>
            <div className="text-sm">검색 결과가 없습니다.</div>
          </div>
        ) : (
          filtered.map((item) => item.type === 'p' ? (
            <PhraseCard key={item.id} item={item} fav={favs.has(item.id)}
              playing={playing === item.id}
              onSpeak={() => handleSpeak(item.id, item.en)}
              onFav={() => toggleFav(item.id)}
              showCat={cat === 'all' || cat === 'fav'} />
          ) : (
            <QACard key={item.id} item={item} fav={favs.has(item.id)}
              playingHeard={playing === `${item.id}-h`}
              playingReplyIdx={playing && playing.startsWith(`${item.id}-r-`) ? parseInt(playing.split('-r-')[1]) : null}
              onSpeakHeard={() => handleSpeak(`${item.id}-h`, item.heard.en)}
              onSpeakReply={(idx, text) => handleSpeak(`${item.id}-r-${idx}`, text)}
              onFav={() => toggleFav(item.id)}
              showCat={cat === 'all' || cat === 'fav'} />
          ))
        )}
      </main>

      {playing && (
        <div className="fixed bottom-3 left-3 right-3 z-30">
          <button onClick={handleStop}
            className="w-full h-13 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl shadow-2xl flex items-center justify-center gap-2">
            <span className="text-xl">⏹</span> 재생 중지
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

function Chip({ a, onClick, l, i, c }) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 h-9 px-3 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1 ${
        a ? 'bg-yellow-500 text-slate-900 shadow' : 'bg-slate-800 text-slate-300 border border-slate-700'
      }`}>
      <span>{i}</span><span>{l}</span>
      <span className={`px-1.5 py-0.5 rounded text-xs ${a ? 'bg-slate-900/20' : 'bg-slate-900 text-slate-400'}`}>{c}</span>
    </button>
  );
}

function PhraseCard({ item, fav, playing, onSpeak, onFav, showCat }) {
  return (
    <div className={`bg-slate-800 rounded-xl border-2 overflow-hidden ${playing ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' : 'border-slate-700'}`}>
      <div className="p-3">
        <div className="flex items-start justify-between mb-1.5">
          {showCat ? (
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span>{item.catIcon}</span><span>{item.catLabel}</span>
            </div>
          ) : <div />}
          <button onClick={onFav} className="-mt-1 -mr-1 w-9 h-9 flex items-center justify-center text-xl">
            <span className={fav ? 'text-yellow-400' : 'text-slate-600'}>★</span>
          </button>
        </div>
        <div className="text-base text-slate-100 mb-2 leading-snug font-medium">{item.ko}</div>
        <div className="text-base text-yellow-300/90 mb-3 leading-snug" style={{ fontFamily: "Charter, Georgia, serif" }}>{item.en}</div>
        <button onClick={onSpeak}
          className={`w-full h-13 py-3 rounded-lg font-bold text-base flex items-center justify-center gap-2 active:scale-95 ${
            playing ? 'bg-yellow-500 text-slate-900 animate-pulse' : 'bg-slate-700 text-slate-100 border-2 border-slate-600'
          }`}>
          <span className="text-xl">{playing ? '🔊' : '▶'}</span>
          <span>{playing ? '재생 중...' : '들려주기'}</span>
        </button>
      </div>
    </div>
  );
}

function QACard({ item, fav, playingHeard, playingReplyIdx, onSpeakHeard, onSpeakReply, onFav, showCat }) {
  return (
    <div className="bg-slate-800 rounded-xl border-2 border-slate-700 overflow-hidden">
      {/* 선원 질문 */}
      <div className="p-3 bg-cyan-950/40 border-b-2 border-cyan-500/30">
        <div className="flex items-start justify-between mb-1.5">
          <div className="text-xs text-cyan-300 font-bold tracking-wider flex items-center gap-1">
            <span>🎧</span><span>선원이 묻습니다</span>
            {showCat && <span className="ml-2 text-slate-400 font-normal">· {item.catIcon} {item.catLabel}</span>}
          </div>
          <button onClick={onFav} className="-mt-1 -mr-1 w-9 h-9 flex items-center justify-center text-xl">
            <span className={fav ? 'text-yellow-400' : 'text-slate-600'}>★</span>
          </button>
        </div>
        <div className="text-base text-slate-100 mb-1.5 leading-snug font-medium">{item.heard.ko}</div>
        <div className="text-base text-cyan-200 mb-2.5 leading-snug" style={{ fontFamily: "Charter, Georgia, serif" }}>{item.heard.en}</div>
        <button onClick={onSpeakHeard}
          className={`w-full h-11 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 ${
            playingHeard ? 'bg-cyan-500 text-slate-900 animate-pulse' : 'bg-slate-700 text-slate-200 border border-slate-600'
          }`}>
          <span>{playingHeard ? '🔊' : '▶'}</span>
          <span>{playingHeard ? '재생 중...' : '어떻게 들리는지 듣기'}</span>
        </button>
      </div>

      {/* 답변 옵션들 */}
      <div className="p-3 bg-slate-800">
        <div className="text-xs text-yellow-400 font-bold tracking-wider mb-2 flex items-center gap-1">
          <span>↩️</span><span>답변 (들려주기)</span>
        </div>
        <div className="space-y-2">
          {item.replies.map((r, idx) => {
            const isPlay = playingReplyIdx === idx;
            return (
              <div key={idx} className={`rounded-lg border-2 p-2.5 ${isPlay ? 'border-yellow-500 bg-yellow-500/10' : 'border-slate-700 bg-slate-900/50'}`}>
                <div className="text-sm text-slate-100 mb-1 leading-snug">{r.ko}</div>
                <div className="text-sm text-yellow-300/90 mb-2 leading-snug" style={{ fontFamily: "Charter, Georgia, serif" }}>{r.en}</div>
                <button onClick={() => onSpeakReply(idx, r.en)}
                  className={`w-full h-11 py-2 rounded font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 ${
                    isPlay ? 'bg-yellow-500 text-slate-900 animate-pulse' : 'bg-slate-700 text-slate-100 border border-slate-600'
                  }`}>
                  <span>{isPlay ? '🔊' : '▶'}</span>
                  <span>{isPlay ? '재생 중...' : '들려주기'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
