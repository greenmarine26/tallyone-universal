// 베이사전 v5 보조 — M6.55 .def 매트릭스 디코드로 추출된 신규 13척
// v2에 등록되어 있지 않은 선박만 포함 (v2 절대 보호)
// 자동 생성: 2026-05-20 (M6.55 .def 분석 세션)
//
// 추출 방식:
//   - 베이 번호: .def 파일 내 ASCII 영역에서 자동 추출 (offset ~135,900 부근)
//   - 매트릭스: 베이 record 안 uint16 LE 스트림 디코드
//   - baseline KSKM/NBTD/STSE 검증 통과 (98.4% 추출 성공률 중 일부)
// 등급: matrix-decoded (자동 추출, user-verified 아님)
// 우선순위: v2 verified > userBayDict > Firebase > **v5 supplement** > v1 > 동적 추정

export const SHIP_BAY_DICT_V5_SUPPLEMENT = {
  "DAP": {
    "code": "DAP",
    "name": "DA PING             VRDL5",
    "callsign": "",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "DAP.DEF",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 20,
      "bayList": [
        "01",
        "03",
        "04",
        "05",
        "07",
        "09",
        "10",
        "11",
        "13",
        "14",
        "15",
        "17",
        "18",
        "19",
        "21",
        "22",
        "23",
        "25",
        "26",
        "27"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 6,
          "_cellsPerRow": [
            3,
            3,
            3,
            5,
            5,
            5
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 6,
          "_cellsPerRow": [
            5,
            5,
            5,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "04",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 6,
          "_cellsPerRow": [
            5,
            5,
            5,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "10",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "14",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "18",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "22",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            2,
            2,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "26",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 4,
          "_cellsPerRow": [
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 4,
          "_cellsPerRow": [
            8,
            8,
            8,
            8
          ]
        }
      ],
      "rowMaxEven": 8,
      "rowMaxOdd": 7,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "DBM": {
    "code": "DBM",
    "name": "DANU BHUM           9VCB",
    "callsign": "",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "DBM.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 25,
      "bayList": [
        "01",
        "03",
        "04",
        "05",
        "07",
        "08",
        "09",
        "11",
        "12",
        "13",
        "15",
        "16",
        "17",
        "19",
        "20",
        "21",
        "23",
        "24",
        "25",
        "27",
        "28",
        "29",
        "31",
        "32",
        "33"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            1,
            1,
            3,
            5,
            9,
            9,
            8
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            3,
            3,
            5,
            9,
            9,
            9,
            8
          ]
        },
        {
          "bayNo": "04",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            3,
            3,
            5,
            9,
            9,
            9,
            8
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            8
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            9,
            9,
            9,
            8
          ]
        },
        {
          "bayNo": "08",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "12",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "16",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            7
          ]
        },
        {
          "bayNo": "20",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            7
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            7
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            7
          ]
        },
        {
          "bayNo": "24",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            8,
            8,
            8,
            7,
            6
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            8,
            8,
            8,
            7,
            6
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            8,
            7
          ]
        },
        {
          "bayNo": "28",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            9,
            9,
            9,
            8,
            7
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            9,
            9,
            9,
            8,
            7
          ]
        },
        {
          "bayNo": "31",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            8,
            7
          ]
        },
        {
          "bayNo": "32",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            8,
            7
          ]
        },
        {
          "bayNo": "33",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            8,
            7
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "DHA": {
    "code": "DHA",
    "name": "DONG HAI",
    "callsign": "VREU7 939",
    "caspVersion": "6.50",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "DHA(1).def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 20,
      "bayList": [
        "01",
        "03",
        "04",
        "05",
        "07",
        "09",
        "10",
        "11",
        "13",
        "14",
        "15",
        "17",
        "18",
        "19",
        "21",
        "22",
        "23",
        "25",
        "26",
        "27"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 6,
          "_cellsPerRow": [
            5,
            5,
            5,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 6,
          "_cellsPerRow": [
            5,
            5,
            5,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "04",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            5,
            5,
            5,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "10",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "11",
          "hasHold": true,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            8,
            6,
            6,
            6,
            8,
            8
          ]
        },
        {
          "bayNo": "13",
          "hasHold": true,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            8,
            8,
            6,
            6,
            6,
            3
          ]
        },
        {
          "bayNo": "14",
          "hasHold": true,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            5,
            8,
            8,
            8,
            6,
            6
          ]
        },
        {
          "bayNo": "15",
          "hasHold": true,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            6
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "18",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            6,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "22",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            8,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "26",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 5,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 5,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8
          ]
        }
      ],
      "rowMaxEven": 8,
      "rowMaxOdd": 7,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "ESTM": {
    "code": "ESTM",
    "name": "ESTIMA",
    "callsign": "C6DT7",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "ESTM.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 9,
      "bayList": [
        "01",
        "02",
        "03",
        "05",
        "06",
        "07",
        "09",
        "10",
        "11"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": true,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 20,
          "rowMaxOddLocal": 19,
          "_totalRows": 11,
          "_cellsPerRow": [
            12,
            5,
            14,
            19,
            1,
            1,
            1,
            3,
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "02",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 0,
          "rowMaxOddLocal": -1,
          "_totalRows": 0,
          "_cellsPerRow": []
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            1,
            1,
            1,
            3,
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 4,
          "rowMaxOddLocal": 3,
          "_totalRows": 2,
          "_cellsPerRow": [
            1,
            3
          ]
        },
        {
          "bayNo": "06",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            1,
            3,
            5,
            5,
            9,
            9,
            9,
            3
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 2,
          "_cellsPerRow": [
            6,
            9
          ]
        },
        {
          "bayNo": "10",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            1,
            3,
            5,
            5,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 2,
          "_cellsPerRow": [
            3,
            5
          ]
        }
      ],
      "rowMaxEven": 20,
      "rowMaxOdd": 19,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "FN7": {
    "code": "FN7",
    "name": "FPMC CONTAINER 7    A8LP8",
    "callsign": "",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "FN7.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 24,
      "bayList": [
        "01",
        "02",
        "03",
        "05",
        "06",
        "07",
        "11",
        "12",
        "13",
        "15",
        "16",
        "17",
        "19",
        "20",
        "21",
        "23",
        "24",
        "25",
        "29",
        "30",
        "31",
        "33",
        "34",
        "35"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "02",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            2,
            4,
            4,
            6,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "06",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "12",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "16",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "20",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "24",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "30",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "31",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "33",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "34",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "35",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            9,
            9,
            9,
            9,
            9
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "FSR": {
    "code": "FSR",
    "name": "M/V FESCO TRADER    P3WQ9",
    "callsign": "",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "FSR.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 24,
      "bayList": [
        "01",
        "02",
        "03",
        "05",
        "06",
        "07",
        "09",
        "10",
        "11",
        "13",
        "14",
        "15",
        "17",
        "18",
        "19",
        "21",
        "22",
        "23",
        "25",
        "26",
        "27",
        "29",
        "30",
        "31"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 5,
          "_cellsPerRow": [
            2,
            4,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "02",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 5,
          "_cellsPerRow": [
            2,
            4,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            4,
            4,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            4,
            6,
            8,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "06",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            4,
            6,
            8,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            6,
            8,
            8,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "10",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "14",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "18",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "22",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "26",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "30",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "31",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            9,
            9,
            9,
            9,
            9,
            9
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "HAHM": {
    "code": "HAHM",
    "name": "HEUNG-A HOCHIMINH   V7TQ9",
    "callsign": "9460",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "HAHM.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 1,
      "bayList": [
        "01"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            1,
            5,
            7,
            7,
            7,
            7,
            7
          ]
        }
      ],
      "rowMaxEven": 8,
      "rowMaxOdd": 7,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "HECN": {
    "code": "HECN",
    "name": "HECAN",
    "callsign": "D7WG  938",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "HECN.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 9,
      "bayList": [
        "01",
        "02",
        "03",
        "05",
        "06",
        "07",
        "09",
        "10",
        "11"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": true,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 20,
          "rowMaxOddLocal": 19,
          "_totalRows": 9,
          "_cellsPerRow": [
            12,
            5,
            14,
            19,
            1,
            3,
            3,
            7,
            7
          ]
        },
        {
          "bayNo": "02",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 0,
          "rowMaxOddLocal": -1,
          "_totalRows": 0,
          "_cellsPerRow": []
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 5,
          "_cellsPerRow": [
            1,
            3,
            3,
            7,
            7
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 4,
          "rowMaxOddLocal": 3,
          "_totalRows": 1,
          "_cellsPerRow": [
            3
          ]
        },
        {
          "bayNo": "06",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 4,
          "_cellsPerRow": [
            5,
            5,
            7,
            7
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            5,
            5,
            7,
            7,
            7,
            2
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 1,
          "_cellsPerRow": [
            5
          ]
        },
        {
          "bayNo": "10",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            3,
            5,
            5,
            5,
            7,
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 2,
          "_cellsPerRow": [
            5,
            5
          ]
        }
      ],
      "rowMaxEven": 20,
      "rowMaxOdd": 19,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "MDB": {
    "code": "MDB",
    "name": "MEDBOTHNIA          5BDS2",
    "callsign": "GL",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "MDB.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 22,
      "bayList": [
        "01",
        "03",
        "04",
        "05",
        "07",
        "08",
        "09",
        "11",
        "12",
        "13",
        "15",
        "16",
        "17",
        "19",
        "20",
        "21",
        "23",
        "24",
        "25",
        "27",
        "28",
        "29"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            2,
            4,
            6,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "04",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            6,
            6,
            6,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "08",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "12",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "16",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "20",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "24",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            3,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            3,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "28",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "MEB": {
    "code": "MEB",
    "name": "METHI BHUM          9VBE4",
    "callsign": "",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "MEB.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 22,
      "bayList": [
        "01",
        "03",
        "04",
        "05",
        "07",
        "08",
        "09",
        "11",
        "12",
        "13",
        "15",
        "16",
        "17",
        "19",
        "20",
        "21",
        "23",
        "24",
        "25",
        "27",
        "28",
        "29"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 4,
          "rowMaxOddLocal": 3,
          "_totalRows": 3,
          "_cellsPerRow": [
            4,
            4,
            4
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            2,
            2,
            4,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "04",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            2,
            2,
            4,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            4,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            6,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "08",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            6,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            4,
            6,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "12",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "16",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "20",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "24",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            6,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            6,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "28",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 6,
          "_cellsPerRow": [
            8,
            10,
            10,
            10,
            10,
            10
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "ORT": {
    "code": "ORT",
    "name": "ORIENTAL BRIGHT     3EME9",
    "callsign": "",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "ORT.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 24,
      "bayList": [
        "01",
        "02",
        "03",
        "05",
        "06",
        "07",
        "09",
        "10",
        "11",
        "13",
        "14",
        "15",
        "17",
        "18",
        "19",
        "21",
        "22",
        "23",
        "25",
        "26",
        "27",
        "29",
        "30",
        "31"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 5,
          "_cellsPerRow": [
            2,
            2,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "02",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 5,
          "_cellsPerRow": [
            2,
            2,
            6,
            6,
            6
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            4,
            4,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "06",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            8,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            2,
            4,
            6,
            6,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            6,
            6,
            6,
            6,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "10",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            6,
            6,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            4,
            6,
            8,
            6,
            6,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "14",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "18",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "22",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "26",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            6,
            8,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            4,
            6,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "30",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            2,
            4,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        },
        {
          "bayNo": "31",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            2,
            4,
            8,
            8,
            8,
            10,
            10,
            10,
            10,
            10
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "PCBS": {
    "code": "PCBS",
    "name": "PACIFIC BUSAN",
    "callsign": "D5RU5",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "PCBS.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 10,
      "bayList": [
        "01",
        "02",
        "03",
        "05",
        "06",
        "07",
        "09",
        "11",
        "12",
        "13"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 20,
          "rowMaxOddLocal": 19,
          "_totalRows": 4,
          "_cellsPerRow": [
            12,
            5,
            14,
            19
          ]
        },
        {
          "bayNo": "02",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 5,
          "_cellsPerRow": [
            2,
            4,
            5,
            5,
            5
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 4,
          "_cellsPerRow": [
            2,
            4,
            5,
            5
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 6,
          "rowMaxOddLocal": 5,
          "_totalRows": 1,
          "_cellsPerRow": [
            5
          ]
        },
        {
          "bayNo": "06",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 7,
          "_cellsPerRow": [
            2,
            2,
            4,
            7,
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 0,
          "rowMaxOddLocal": -1,
          "_totalRows": 0,
          "_cellsPerRow": []
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            4,
            6,
            7,
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 5,
          "_cellsPerRow": [
            2,
            4,
            4,
            6,
            7
          ]
        },
        {
          "bayNo": "12",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 3,
          "_cellsPerRow": [
            7,
            7,
            7
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 8,
          "_cellsPerRow": [
            4,
            4,
            6,
            6,
            7,
            7,
            7,
            7
          ]
        }
      ],
      "rowMaxEven": 20,
      "rowMaxOdd": 19,
      "verified": false,
      "grade": "matrix-decoded"
    }
  },
  "WBC": {
    "code": "WBC",
    "name": "WARNOW CARP         5BFN4 9437",
    "callsign": "256",
    "caspVersion": "6.10",
    "sourceCreatedDate": "",
    "bayDef": {
      "sourceFile": "WBC.def",
      "parsedAt": "2026-05-20T02:00:00",
      "parserVersion": "M6.55-def-matrix-v5",
      "methodology": "CASP_DEF_MATRIX_DECODE_M6_55",
      "recordCount": 22,
      "bayList": [
        "01",
        "03",
        "04",
        "05",
        "07",
        "08",
        "09",
        "11",
        "12",
        "13",
        "15",
        "16",
        "17",
        "19",
        "20",
        "21",
        "23",
        "24",
        "25",
        "27",
        "28",
        "29"
      ],
      "baysSummary": [
        {
          "bayNo": "01",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 8,
          "rowMaxOddLocal": 7,
          "_totalRows": 6,
          "_cellsPerRow": [
            2,
            4,
            6,
            8,
            8,
            8
          ]
        },
        {
          "bayNo": "03",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "04",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            2,
            4,
            6,
            6,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "05",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 8,
          "_cellsPerRow": [
            2,
            4,
            6,
            6,
            6,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "07",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "08",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            5,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "09",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            3,
            5,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "11",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "12",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "13",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "15",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "16",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "17",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 9,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "19",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "20",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "21",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            7,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "23",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            5,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "24",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            3,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "25",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 10,
          "_cellsPerRow": [
            3,
            7,
            7,
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "27",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "28",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        },
        {
          "bayNo": "29",
          "hasHold": false,
          "hasDeck": true,
          "isStandalone": false,
          "rowMaxEvenLocal": 10,
          "rowMaxOddLocal": 9,
          "_totalRows": 7,
          "_cellsPerRow": [
            7,
            9,
            9,
            9,
            9,
            9,
            9
          ]
        }
      ],
      "rowMaxEven": 10,
      "rowMaxOdd": 9,
      "verified": false,
      "grade": "matrix-decoded"
    }
  }
};

/** v5 supplement IMO/code/name 매칭 (v2 호환 단순 fuzzy) */
export function lookupBayDictV5SupplementEnhanced(imo, vesselNameOrCode) {
  if (!vesselNameOrCode && !imo) return null;
  const search = String(vesselNameOrCode || '').toUpperCase().replace(/\s+/g, '');
  // 1) code 정확
  if (search && SHIP_BAY_DICT_V5_SUPPLEMENT[search]) {
    return { entry: SHIP_BAY_DICT_V5_SUPPLEMENT[search], matchedBy: 'v5-code' };
  }
  // 2) name 4글자 prefix
  if (search && search.length >= 4) {
    for (const k of Object.keys(SHIP_BAY_DICT_V5_SUPPLEMENT)) {
      const e = SHIP_BAY_DICT_V5_SUPPLEMENT[k];
      const en = String(e?.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (en && en.length >= 4 && (en.includes(search.slice(0, 5)) || search.includes(en.slice(0, 5)))) {
        return { entry: e, matchedBy: 'v5-name-fuzzy' };
      }
    }
  }
  return null;
}

export function getV5SupplementStats() {
  return {
    version: '5.0-supplement',
    totalShips: Object.keys(SHIP_BAY_DICT_V5_SUPPLEMENT).length,
    methodology: 'M6.55 .def matrix decode (auto-extracted)',
  };
}