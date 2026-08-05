// 수집기(Tallyman Mail Collector) 연동용 입구 — 검수앱 파서를 감싸 폴더 병합본+EDI대조 리포트 생성
// V8.20: 수집기가 window.GMmerge(files) 한 번으로 검수앱의 기존 파서를 재사용.
//   파서 자체는 검수앱이 소유(utils.js). 이 파일은 다리(contract)일 뿐 — 파서 로직 미포함.
//   XRAY 처리: parseXrayList 실제 반환이 { containers:[...] } 이므로 그에 맞춤(연동안내 6-1 확정).
// V9.57(G5): 자체 classify 삭제 — autoRegApi.classifyTallyFile 단일 분류기를 임포트.
//   달라진 점: cdl 허용(V8.89와 정합), .txt EDI/ASC/숫자코드 지원, 합본(loadlist.xlsx) 지원.
import { parseListExcel, parseBAPLIE, parseAscFile, parseXrayList, loadSheetJS } from './utils.js';
import { classifyTallyFile } from './autoRegApi.js';

// V9.57(G8): 원본(EDI 컨 객체) 직접 수정 금지 — 보강이 필요한 컨만 { ...원본 } 새 객체로 교체.
function mergeWithEdi(edi,list,xray){const merged={...edi},conflicts=[],unmatched={};
  Object.values(list||{}).forEach(c=>{if(!c.cn)return;const cn=c.cn.toUpperCase();
    if(merged[cn]){const e=merged[cn]={...merged[cn]};
      if(c.sl){if(!e.sl)e.sl=c.sl;else if(e.sl!==c.sl)conflicts.push({cn,field:'sl',ediVal:e.sl,otherVal:c.sl,source:c._source||'list'});}
      if(c.eseal){if(!e.eseal)e.eseal=c.eseal;else if(e.eseal!==c.eseal)conflicts.push({cn,field:'eseal',ediVal:e.eseal,otherVal:c.eseal,source:c._source||'list'});}
      if(c.wt&&c.wt>0){const w=parseInt(e.wt,10)||0;if(w===0)e.wt=c.wt;else if(Math.abs(w-c.wt)>1000)conflicts.push({cn,field:'wt',ediVal:w,otherVal:c.wt,source:c._source||'list'});}
    } else unmatched[cn]=c;});
  Object.keys(xray||{}).forEach(cn=>{const u=cn.toUpperCase(); if(merged[u])merged[u]={...merged[u],_xray:true}; else unmatched[u]={...(unmatched[u]||{}),cn:u,_xray:true};});
  return {merged,conflicts,unmatched};}
async function asArrayBuffer(f){ if(f.arrayBuffer)return await f.arrayBuffer(); if(f.buffer)return f.buffer; return f; }
async function asText(f){ const ab=await asArrayBuffer(f);
  // V9.57(G9): 디코드 실패를 조용히 삼키지 않는다 — 경고 로그 후 빈 문자열(perFile 0건으로 드러남).
  try{return new TextDecoder('latin1').decode(new Uint8Array(ab));}
  catch(e){console.warn('[mergeApi] 파일 텍스트 디코드 실패:',f&&f.name,e);return '';} }

// V9.57(G5): 수집기 합본(MERGED 시트, 'Cntr No' 헤더) 읽기 — parseListExcel은 이 형식을 못 읽음(0건).
//   autoRegApi의 합본 매핑과 동일 컬럼(Cntr No/Seal/EmptySeal/Weight/ISO/F\/E/Line/POL/POD).
function readMergedSheet(XLSX,wb,name){
  const ws=wb.Sheets['MERGED']||wb.Sheets[wb.SheetNames[0]]; const out={};
  (XLSX.utils.sheet_to_json(ws)||[]).forEach(row=>{
    const cn=String(row['Cntr No']||'').replace(/\s/g,'').toUpperCase();
    if(!/^[A-Z]{4}\d{7}$/.test(cn))return;
    const rec={cn,_source:name};
    if(row['Seal']!=null&&row['Seal']!=='')rec.sl=String(row['Seal']).trim();
    if(row['EmptySeal']!=null&&row['EmptySeal']!=='')rec.eseal=String(row['EmptySeal']).trim();
    const w=parseInt(row['Weight'],10); if(w>0)rec.wt=w;
    const feRaw=String(row['F/E']||'').trim().toUpperCase(); if(feRaw==='F'||feRaw==='E')rec.fe=feRaw;
    const isoRaw=String(row['ISO']||'').trim().toUpperCase(); if(isoRaw)rec.iso=isoRaw;
    if(row['Line']!=null&&row['Line']!=='')rec.op=String(row['Line']).trim().toUpperCase();
    if(row['POL']!=null&&row['POL']!=='')rec.pol=String(row['POL']).trim().toUpperCase();
    if(row['POD']!=null&&row['POD']!=='')rec.pod=String(row['POD']).trim().toUpperCase();
    out[cn]=rec;
  });
  return out;
}
export async function mergeFolder(files){
  const XLSX=await loadSheetJS(); const edi={},listResults={},xrayResults={},perFile=[]; let ediName='';
  for(const f of files){ const name=f.name||'';
    try{
      // V9.57(G5): .txt는 내용 머리(head)로 판정해야 하므로 먼저 텍스트를 읽는다.
      let text=null;
      let kind;
      if(/\.txt$/i.test(name)){ text=await asText(f); kind=classifyTallyFile(name,text.slice(0,12)); }
      else kind=classifyTallyFile(name);
      if(kind==='edi'||kind==='ifcsum'){ // parseBAPLIE가 숫자형(00:BAPLIE/00:IFCSUM) 라우팅 내장
        const r=parseBAPLIE(text!=null?text:await asText(f)); const cs=(r&&r.containers)||[];
        if(cs.length>Object.keys(edi).length){ for(const k of Object.keys(edi))delete edi[k]; cs.forEach(c=>{if(c.cn)edi[c.cn.toUpperCase()]=c;}); ediName=name; }
        perFile.push({name,kind,count:cs.length});
      } else if(kind==='asc'){ const r=parseAscFile(text!=null?text:await asText(f)); perFile.push({name,kind,count:((r&&r.containers)||[]).length});
      } else if(kind==='merged'){ // V9.57(G5): 합본도 리스트 재료로 병합
        const wb=XLSX.read(new Uint8Array(await asArrayBuffer(f)),{type:'array'});
        const recs=readMergedSheet(XLSX,wb,name);
        Object.assign(listResults,recs); perFile.push({name,kind,count:Object.keys(recs).length});
      } else if(kind==='list'){ const out=await parseListExcel(await asArrayBuffer(f)); const recs=(out&&out.records)||[];
        recs.forEach(r=>{if(r.cn){r._source=name;listResults[r.cn.toUpperCase()]=r;}}); perFile.push({name,kind,count:recs.length});
      } else if(kind==='xray'){ const out=await parseXrayList(await asArrayBuffer(f));
        // V8.20 수정: parseXrayList 반환은 { containers:[번호배열], _matchCount } — records 아님.
        const arr=(out&&out.containers)||(out&&out.records?out.records.map(r=>r&&r.cn):[])||[];
        (Array.isArray(arr)?arr:[]).forEach(cn=>{if(cn)xrayResults[String(cn).toUpperCase()]=true;});
        perFile.push({name,kind,count:Array.isArray(arr)?arr.length:0});
      } else { perFile.push({name,kind:'skip'}); }   // V9.57(G9): 버려진 파일도 리포트에 드러낸다
    }catch(e){ perFile.push({name,error:String(e&&e.message||e)}); }
  }
  const {merged,conflicts,unmatched}=mergeWithEdi(edi,listResults,xrayResults);
  const rows=Object.values(merged).map(c=>({'Cntr No':c.cn||'','ISO':c.iso||'','Line':c.op||'','F/E':c.fe||'','POL':c.pol||'','POD':c.pod||'','Seal':c.sl||'','EmptySeal':c.eseal||'','Weight':c.wt||'','XRAY':c._xray?'Y':''}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'MERGED');
  if(conflicts.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(conflicts),'CONFLICTS');
  const unm=Object.values(unmatched);
  if(unm.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(unm.map(c=>({'Cntr No':c.cn,Line:c.op||'',Seal:c.sl||'',XRAY:c._xray?'Y':''}))),'NOT_IN_EDI');
  const xlsxBase64=XLSX.write(wb,{bookType:'xlsx',type:'base64'});
  const report={ediFile:ediName,ediCount:Object.keys(edi).length,listUnique:Object.keys(listResults).length,mergedCount:Object.keys(merged).length,conflictCount:conflicts.length,notInEdiCount:unm.length,conflicts,notInEdi:unm.map(c=>c.cn),perFile};
  return {xlsxBase64,report};
}
if(typeof window!=='undefined'){ window.GMmerge=mergeFolder; }
