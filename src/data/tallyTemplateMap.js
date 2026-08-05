// 마감 텔리 템플릿 좌표 매니페스트 — 빌더가 실물 파일에서 추출 (V9.19-03: 변형 DXQD·TMPZ 추가)
export default {
  // V9.21: TNJP(TEN JUPITER) — 여객선(카페리) 바우처 양식. 실물 26353E&W에서 생성 (2026-07-28).
  //   FW=규격별 집계+주간/야간, RF 3페이지, PORTPERFORMANCE 매트릭스. OS/Seal은 표준 로직 재사용.
  TNJP: {
    variant: 'ferry',
    sheets: {
      finalWork: { name: 'Final work rpt-voucher',
        voyCells: ['C6', 'E6'],
        inRows: { f20: 17, e20: 18, f20lug: 19, e20lug: 20, f40: 21, e40: 22, f40lug: 23, e40lug: 24, total: 27 },
        outRows: { f20: 30, e20: 31, f20lug: 32, e20lug: 33, f40: 34, e40: 35, f40lug: 36, e40lug: 37, total: 40 },
        cols: { total: 5, day: 6, night: 7 } },
      // V9.21-02: 페리 OS는 행 고정(20'/40'/45', 40HC는 40'에 합산·REMARKS로 분해) — 수석 실물 대조
      osFerryIn:  { name: 'OS-IN',  rows: [{ r: 12, sz: '20', fe: 'F' }, { r: 13, sz: '40', fe: 'F' }, { r: 14, sz: '45', fe: 'F' }], totalRow: 15 },
      osFerryOut: { name: 'OS-OUT', rows: [{ r: 12, sz: '20', fe: 'F' }, { r: 13, sz: '20', fe: 'E' }, { r: 14, sz: '40', fe: 'F' }, { r: 15, sz: '40', fe: 'E' }, { r: 16, sz: '45', fe: 'F' }, { r: 17, sz: '45', fe: 'E' }], totalRow: 18 },
      seal:  { name: 'Act. Cntr-Seal No List', dataStart: 12, dataEnd: 32 },
      rfFerry: { name: 'RF condition report', pages: [[11, 30], [56, 75], [101, 120]], voyCells: ['E6', 'E51', 'E96'] },
      ppFerry: { name: 'PORTPERFORMANCE',
        vslCell: 'C4', voyCell: 'H4',
        rows: { inCk: 10, inTtl: 14, outCk: 15, outTtl: 19, shift: 20 },
        cols: { f20: 3, f40: 4, fhc: 5, flug: 6, e20: 7, e40: 8, ehc: 9, elug: 10, ttl: 11 } },
    },
  },
  // TallyOne 1.4: OBWH(OCEAN BLUE WHALE) — 연태훼리 카페리. TNJP와 같은 시간대축 바우처 계보.
  //   실물 2691E&2692W에서 좌표 실측(9회차 대조로 행 고정 확인). PORTPERFORMANCE 시트는 없다.
  //   RF는 1페이지(11~30) — 실물 I4가 '1/1'~'1/2'로 가변이라 초과분은 _overflow로 보고한다.
  //   OS는 LUG 행이 따로 있다(TNJP엔 없음) — sz:'20LUG'.
  OBWH: {
    variant: 'ferry',
    sheets: {
      finalWork: { name: 'Final work rpt-voucher',
        voyCells: ['C6', 'E6'],
        inRows: { f20: 17, e20: 18, f20lug: 19, e20lug: 20, f40: 21, e40: 22, f40lug: 23, e40lug: 24, total: 27 },
        outRows: { f20: 30, e20: 31, f20lug: 32, e20lug: 33, f40: 34, e40: 35, f40lug: 36, e40lug: 37, total: 40 },
        cols: { total: 5, day: 6, night: 7 } },
      // 실측 8/9회차: 양하는 전량 FULL(40E·45E 미발생). 미커버 분류가 생기면 _overflow로 드러난다.
      osFerryIn:  { name: 'OS-IN',  rows: [{ r: 12, sz: '20', fe: 'F' }, { r: 13, sz: '20LUG', fe: 'F' }, { r: 14, sz: '40', fe: 'F' }, { r: 15, sz: '45', fe: 'F' }], totalRow: 16 },
      osFerryOut: { name: 'OS-OUT', rows: [{ r: 12, sz: '20', fe: 'F' }, { r: 13, sz: '20', fe: 'E' }, { r: 14, sz: '20LUG', fe: 'E' }, { r: 15, sz: '40', fe: 'F' }, { r: 16, sz: '40', fe: 'E' }, { r: 17, sz: '45', fe: 'F' }, { r: 18, sz: '45', fe: 'E' }], totalRow: 19 },
      seal:  { name: 'Act. Cntr-Seal No List', dataStart: 12, dataEnd: 32 },
      // TallyOne 1.4: RF 2페이지(각 20행 = 40대). 2697E 실측 37대 — 1페이지만 두면 17대가 누락된다.
      rfFerry: { name: 'RF condition report', pages: [[11, 30], [58, 77]], voyCells: ['E6', 'E53'] },
    },
  },
 "ATPR": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 70
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 40
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 18,
    "remarksRow": -1,
    "remarksEnd": 33
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 46
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   }
  }
 },
 "DJCF": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 82
   },
   "timeSheet": {
    "name": "Time sheet",
    "dataStart": 12,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 20,
    "remarksRow": 24,
    "remarksEnd": 32
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 25,
    "remarksRow": 29,
    "remarksEnd": 37
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 46
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 18,
    "outRow": 19,
    "st2": 26
   }
  }
 },
 "DJCT": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 74
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 28,
    "remarksEnd": 37
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 15,
    "remarksRow": 27,
    "remarksEnd": 35
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 41
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   },
   "shifting": {
    "name": "SHIFTING",
    "dataStart": 10,
    "dataEnd": 20
   }
  }
 },
 "DPRT": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 80
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 40
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 26,
    "remarksEnd": 34
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 25,
    "remarksRow": 28,
    "remarksEnd": 36
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 43
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 18,
    "outRow": 19,
    "st2": 26
   }
  }
 },
 "NSDC": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 82
   },
   "timeSheet": {
    "name": "Time sheet",
    "dataStart": 12,
    "dataEnd": 39
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 25,
    "remarksEnd": 34
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 23,
    "remarksEnd": 31
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 40
   }
  }
 },
 "NSFR": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 82
   },
   "timeSheet": {
    "name": "Time sheet",
    "dataStart": 12,
    "dataEnd": 39
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 23,
    "remarksEnd": 32
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 20,
    "remarksRow": 25,
    "remarksEnd": 34
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 41
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 18,
    "outRow": 19,
    "st2": 26
   },
   "shifting": {
    "name": "SHIFTING",
    "dataStart": 10,
    "dataEnd": 20
   }
  }
 },
 "PCSZ": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 70
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 17,
    "remarksRow": -1,
    "remarksEnd": 27
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 22,
    "remarksRow": -1,
    "remarksEnd": 29
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 40
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   }
  }
 },
 "STMJ": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 70
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 15,
    "remarksRow": 20,
    "remarksEnd": 31
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 20,
    "remarksRow": 23,
    "remarksEnd": 33
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 47
   },
   "shifting": {
    "name": "SHIFTING",
    "dataStart": 10,
    "dataEnd": 20
   }
  }
 },
 "STSE": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 70
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 15,
    "remarksRow": 20,
    "remarksEnd": 30
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 20,
    "remarksEnd": 30
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 42
   },
   "shifting": {
    "name": "SHIFTING",
    "dataStart": 10,
    "dataEnd": 20
   }
  }
 },
 "SWAT": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 74
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 23,
    "remarksRow": -1,
    "remarksEnd": 31
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 25,
    "remarksRow": -1,
    "remarksEnd": 37
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 40
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   }
  }
 },
 "SWDN": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 82
   },
   "timeSheet": {
    "name": "Time sheet",
    "dataStart": 12,
    "dataEnd": 39
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 23,
    "remarksRow": 26,
    "remarksEnd": 36
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 25,
    "remarksRow": 27,
    "remarksEnd": 35
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 40
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 18,
    "outRow": 19,
    "st2": 26
   }
  }
 },
 "SWRG": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 70
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 23,
    "remarksRow": -1,
    "remarksEnd": 33
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 28,
    "remarksRow": -1,
    "remarksEnd": 37
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 42
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   }
  }
 },
 "SWSP": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 74
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 23,
    "remarksRow": -1,
    "remarksEnd": 30
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 25,
    "remarksRow": -1,
    "remarksEnd": 35
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 110
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   },
   "shifting": {
    "name": "SHIFTING",
    "dataStart": 10,
    "dataEnd": 20
   }
  }
 },
 "YKTD": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 72
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 39
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 28,
    "remarksEnd": 37
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 15,
    "remarksRow": 27,
    "remarksEnd": 35
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF Condition Report",
    "dataStart": 12,
    "dataEnd": 46
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   }
  }
 },
 "STANDARD": {
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "dataStart": 10,
    "totalRow": 74
   },
   "timeSheet": {
    "name": "Time Sheet",
    "dataStart": 13,
    "dataEnd": 44
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 19,
    "remarksRow": 28,
    "remarksEnd": 37
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 15,
    "remarksRow": 27,
    "remarksEnd": 35
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 41
   },
   "perf": {
    "name": "Performance",
    "inRow": 12,
    "st1": 19,
    "outRow": 20,
    "st2": 27
   },
   "shifting": {
    "name": "SHIFTING",
    "dataStart": 10,
    "dataEnd": 20
   }
  }
 },
 "DXQD": {
  "variant": "cn",
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "pairRows": [
     {
      "r": 10,
      "op": "DWS",
      "port": "DLC",
      "sub": ""
     },
     {
      "r": 12,
      "op": "DWS",
      "port": "DLC",
      "sub": "SKR"
     },
     {
      "r": 14,
      "op": "DWS",
      "port": "",
      "sub": ""
     },
     {
      "r": 18,
      "op": "EAS",
      "port": "DLC",
      "sub": ""
     },
     {
      "r": 20,
      "op": "EAS",
      "port": "",
      "sub": ""
     },
     {
      "r": 22,
      "op": "EAS",
      "port": "",
      "sub": ""
     },
     {
      "r": 26,
      "op": "",
      "port": "",
      "sub": ""
     },
     {
      "r": 28,
      "op": "",
      "port": "",
      "sub": ""
     },
     {
      "r": 30,
      "op": "",
      "port": "",
      "sub": ""
     }
    ],
    "grandRow": 34,
    "hdr": {
     "voy": "E4",
     "date": "K4",
     "pier": "B6",
     "berth": "H6"
    }
   },
   "timeSheet": {
    "name": "Time sheet",
    "dataStart": 13,
    "dataEnd": 41
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 15,
    "remarksRow": -1,
    "remarksEnd": 27
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 17,
    "remarksRow": -1,
    "remarksEnd": 27
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 31,
    "sumRow": 32
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 39
   }
  }
 },
 "TMPZ": {
  "variant": "cn",
  "sheets": {
   "finalWork": {
    "name": "Final Work",
    "pairRows": [
     {
      "r": 10,
      "op": "TJM",
      "port": "NGB",
      "sub": ""
     },
     {
      "r": 12,
      "op": "TJM",
      "port": "SHA",
      "sub": ""
     },
     {
      "r": 14,
      "op": "TJM",
      "port": "NGB",
      "sub": "DWS"
     },
     {
      "r": 16,
      "op": "TJM",
      "port": "SHA",
      "sub": "DWS"
     },
     {
      "r": 18,
      "op": "TJM",
      "port": "NGB",
      "sub": "MAS"
     },
     {
      "r": 20,
      "op": "TJM",
      "port": "SHA",
      "sub": "MAS"
     },
     {
      "r": 24,
      "op": "EAS",
      "port": "NGB",
      "sub": ""
     },
     {
      "r": 26,
      "op": "EAS",
      "port": "SHA",
      "sub": ""
     },
     {
      "r": 30,
      "op": "",
      "port": "NGB",
      "sub": ""
     },
     {
      "r": 32,
      "op": "",
      "port": "SHA",
      "sub": ""
     },
     {
      "r": 36,
      "op": "",
      "port": "NGB",
      "sub": ""
     }
    ],
    "grandRow": 38,
    "hdr": {
     "voy": "E4",
     "date": "K4",
     "pier": "B6",
     "berth": "H6"
    }
   },
   "timeSheet": {
    "name": "Time sheet",
    "dataStart": 12,
    "dataEnd": 39
   },
   "osIn": {
    "name": "OS-IN",
    "dataStart": 12,
    "totalRow": 18,
    "remarksRow": -1,
    "remarksEnd": 27
   },
   "osOut": {
    "name": "OS-OUT",
    "dataStart": 12,
    "totalRow": 22,
    "remarksRow": -1,
    "remarksEnd": 27
   },
   "seal": {
    "name": "Act. Cntr-Seal No List",
    "dataStart": 12,
    "dataEnd": 32,
    "sumRow": 33
   },
   "rf": {
    "name": "RF condition report",
    "dataStart": 12,
    "dataEnd": 40
   }
  }
 }
};
