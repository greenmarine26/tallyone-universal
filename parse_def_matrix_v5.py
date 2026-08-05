"""
CASP SHIP DEFINE FILE (.def) — 베이 매트릭스 디코더 v5 (M6.55 Phase 8 돌파 후)

v4 대비 핵심 추가:
  ✅ 베이 번호 시퀀스 자동 추출 (.def 파일 내 ASCII 영역)
  ✅ 6.50/6.10 모두 동일 알고리즘으로 추출
  ✅ KSKM/NBTD/STSE 100% baseline 검증 통과

ASCII 베이 번호 영역 위치 (M6.55 발견):
  6.50 포맷 (KSKM, NBTD): offset 135,900 부근
  6.10 포맷 (STSE): offset 60,000 부근
  
인코딩 형식:
  ' NN    ' (space + 2자리 베이 번호 + 4 trailing space) 또는
  '\\x00NN     ' (null + 2자리 + 5 trailing space)
  record 단위: 약 189 bytes 간격 (베이 record 안에 추가 메타데이터 동봉)

베이 번호 record 내부에는 다음 정보가 함께 저장됨 (추가 분석 영역):
  - 베이별 row 번호 시퀀스 (EDI RR 좌표)
  - tier 정보 (uint16 시퀀스: 4, 8, 12, ... 4 단위 증가)
  - 추가 메타 (가설 단계)
"""
import struct
import re

# 6.50/6.10 양식의 베이 영역 시작 offset 및 record 크기 (매트릭스 영역)
BAY_AREA_START = {'6.50': 2048, '6.60': 2048, '6.10': 500, '6.30': 500, '6.00': 500}
BAY_RECORD_SIZE = {'6.50': 1280, '6.60': 1280, '6.10': 800, '6.30': 800, '6.00': 800}
DECK_HOLD_GAP_THRESHOLD = 100  # bytes

# 베이 번호 ASCII 영역 (v5 신규)
# 패턴: 0x20 또는 0x00 다음에 2자리 숫자, 그 다음 3~5 공백
BAY_NUM_PATTERN = re.compile(rb'[\x00 ](\d{2}) {3,5}')


def detect_format(data):
    magic = data[0:48].decode('ascii', errors='replace')
    if '\r\n6.50' in magic: return '6.50'
    if '\r\n6.60' in magic: return '6.60'
    if '\r\n6.10' in magic or 'CONVERTED FROM CCASP' in magic: return '6.10'
    if '\r\n6.30' in magic: return '6.30'
    if '\r\n6.00' in magic: return '6.00'
    return 'unknown'


def parse_header(data, fmt):
    """기본 헤더 정보 추출"""
    info = {}
    info['code'] = data[50:54].decode('ascii', errors='replace').strip('\x00 ')
    info['name'] = data[54:84].decode('ascii', errors='replace').strip('\x00 ').rstrip()
    info['callsign'] = data[84:93].decode('ascii', errors='replace').strip('\x00 ')
    if fmt in ('6.50', '6.60'):
        info['loa']   = round(struct.unpack('<f', data[106:110])[0], 3)
        info['lbp']   = round(struct.unpack('<f', data[110:114])[0], 3)
        info['beam']  = round(struct.unpack('<f', data[114:118])[0], 3)
        info['depth'] = round(struct.unpack('<f', data[118:122])[0], 3)
        info['draft'] = round(struct.unpack('<f', data[130:134])[0], 3)
        info['bay_count'] = struct.unpack('<H', data[158:160])[0]
    else:
        info['bay_count'] = struct.unpack('<H', data[148:150])[0]
    return info


def extract_bay_numbers(data, bay_count):
    """
    Phase 8 신규: ASCII 베이 번호 시퀀스 자동 추출
    
    .def 파일 내 별도 영역에 ' NN    ' 형식으로 저장된 베이 번호를 찾아서
    선수→선미 순서대로 bay_count개 반환.
    
    KSKM/NBTD/STSE 100% baseline 검증 통과.
    """
    matches = []
    seen_offsets = set()
    for m in BAY_NUM_PATTERN.finditer(data):
        offset = m.start()
        # 너무 가까운 매치는 중복 (record 안에서 여러 번 매치 가능)
        skip = False
        for off in seen_offsets:
            if abs(offset - off) < 100:  # 100 bytes 이내 중복 제거
                skip = True
                break
        if skip:
            continue
        seen_offsets.add(offset)
        matches.append((offset, int(m.group(1))))
    
    # bay_count 개만 반환
    if len(matches) < bay_count:
        # 부족 시 일단 가능한 만큼 반환 + None 패딩
        nums = [n for _, n in matches]
        return nums + [None] * (bay_count - len(nums))
    
    nums = [n for _, n in matches[:bay_count]]
    return nums


def extract_row_clusters(rec_bytes, gap_threshold=DECK_HOLD_GAP_THRESHOLD):
    """베이 record 안에서 row clusters 추출 (v4와 동일)"""
    nz = [j for j,b in enumerate(rec_bytes) if b != 0]
    if not nz:
        return {'rows': [], 'data_start': None, 'data_len': 0,
                'has_hold': False, 'deck_rows': 0, 'hold_rows': 0, 'deck_hold_gap': None}
    first_nz, last_nz = nz[0], nz[-1]
    
    has_hold = False
    deck_hold_gap = None
    for k in range(1, len(nz)):
        g = nz[k] - nz[k-1]
        if g > gap_threshold:
            has_hold = True
            deck_hold_gap = (nz[k-1] + 1, nz[k])
            break
    
    nz_bytes = rec_bytes[first_nz:last_nz+1]
    if len(nz_bytes) % 2:
        nz_bytes += b'\x00'
    vals = struct.unpack(f'<{len(nz_bytes)//2}H', nz_bytes)
    
    rows = []
    cur = []
    for v in vals:
        if v != 0:
            cur.append(v)
        else:
            if cur:
                rows.append(cur)
                cur = []
    if cur:
        rows.append(cur)
    
    deck_rows = hold_rows = 0
    if has_hold and deck_hold_gap:
        gap_start_in_data = deck_hold_gap[0] - first_nz
        row_start_indices = []
        cur_start = None
        for j, v in enumerate(vals):
            if v != 0:
                if cur_start is None:
                    cur_start = j
            else:
                if cur_start is not None:
                    row_start_indices.append(cur_start)
                    cur_start = None
        if cur_start is not None:
            row_start_indices.append(cur_start)
        gap_start_u16 = gap_start_in_data // 2
        deck_rows = sum(1 for s in row_start_indices if s < gap_start_u16)
        hold_rows = len(rows) - deck_rows
    
    return {
        'rows': rows,
        'data_start': first_nz,
        'data_len': last_nz - first_nz + 1,
        'has_hold': has_hold,
        'deck_rows': deck_rows,
        'hold_rows': hold_rows,
        'deck_hold_gap': deck_hold_gap,
    }


def parse_def_full(path):
    """.def 파일 완전 디코드. v5: 베이 번호 시퀀스 포함."""
    with open(path, 'rb') as f:
        data = f.read()
    
    fmt = detect_format(data)
    result = {'file_size': len(data), 'def_format': fmt}
    if fmt == 'unknown':
        return result
    
    result.update(parse_header(data, fmt))
    
    # Phase 8 신규: 베이 번호 시퀀스 추출
    result['bay_numbers'] = extract_bay_numbers(data, result['bay_count'])
    
    start = BAY_AREA_START[fmt]
    record_size = BAY_RECORD_SIZE[fmt]
    bay_count = result['bay_count']
    
    bays = []
    for i in range(bay_count):
        rec_start = start + i * record_size
        if rec_start + record_size > len(data):
            break
        rec = data[rec_start:rec_start + record_size]
        decoded = extract_row_clusters(rec)
        
        cells = [len(r) for r in decoded['rows']]
        unique = sorted(set(v for r in decoded['rows'] for v in r))
        
        bay_info = {
            'index': i,
            'bay_num': result['bay_numbers'][i] if i < len(result['bay_numbers']) else None,
            'data_start': decoded['data_start'],
            'data_len': decoded['data_len'],
            'rows': decoded['rows'],
            'cells_per_row': cells,
            'max_row_cells': max(cells) if cells else 0,
            'total_rows': len(decoded['rows']),
            'has_hold': decoded['has_hold'],
            'deck_rows': decoded['deck_rows'],
            'hold_rows': decoded['hold_rows'],
            'deck_hold_gap': decoded['deck_hold_gap'],
            'unique_values': unique,
            'has_marker_3': 3 in unique,
            'has_marker_5_7': 5 in unique or 7 in unique,
        }
        bays.append(bay_info)
    
    result['bays'] = bays
    return result


if __name__ == '__main__':
    import sys, json
    if len(sys.argv) < 2:
        print("Usage: python parse_def_matrix_v5.py <file.def>")
        sys.exit(1)
    for path in sys.argv[1:]:
        r = parse_def_full(path)
        print(f"=== {path} ===")
        print(f"code={r.get('code')}, name={r.get('name')}, format={r['def_format']}")
        print(f"bay_count={r.get('bay_count')}")
        print(f"베이 번호 시퀀스: {r.get('bay_numbers')}")
        for bay in r.get('bays', []):
            print(f"  idx{bay['index']:2d} bay{bay['bay_num']:02d}: "
                  f"rows={bay['total_rows']}, cells={bay['cells_per_row']}, "
                  f"hold={bay['has_hold']}, vals={bay['unique_values']}")
