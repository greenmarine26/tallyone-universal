const fs=require('fs');
let html=fs.readFileSync('dist-planedit/_planedit.entry.html','utf8');
const js=fs.readFileSync('dist-planedit/pe.js','utf8');
let css=''; try{ css=fs.readFileSync('dist-planedit/pe.css','utf8'); }catch(e){}
// 함수형 치환 필수 — 번들의 "$&" 문자열이 확장되어 스크립트가 깨지는 사고 방지 (V9.07)
html=html.replace(/<script[^>]*src="[^"]*pe\.js"[^>]*><\/script>/, () => '<script type="module">\n'+js+'\n</script>');
html=html.replace(/<link[^>]*href="[^"]*pe\.css"[^>]*>/, () => css?('<style>'+css+'</style>'):'');
fs.writeFileSync('planedit.html', html);
const nOpen=(html.match(/<script/g)||[]).length, nClose=(html.match(/<\/script>/g)||[]).length;
console.log(`planedit.html ${(html.length/1048576).toFixed(2)}MB · <script ${nOpen} / </script> ${nClose} · 외부참조 ${/src="\.\/|href="\.\//.test(html)?'있음 ✗':'없음 ✓'}`);
