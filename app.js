const $=id=>document.getElementById(id);
let result = "";
const lines = text => text.replace(/\r\n?/g,"\n").split("\n");
function clear() {
  result = "";
  $("diff").hidden = $("output-label").hidden = true;
  $("copy").disabled = $("download").disabled = true;
  $("status").textContent = "";
}
$("mode").addEventListener("change",() => {
  const mode=$("mode").value;
  $("second-label").hidden=mode!=="diff";
  $("csv-label").hidden=mode!=="csv";
  clear();
});
for (const id of ["first","second"]) $(id).addEventListener("input",clear);
$("file").addEventListener("change",async () => {
  const file=$("file").files[0];
  if (!file) return;
  if(file.size>5*1024*1024) { $("status").textContent="5 MiB’tan küçük bir CSV seç.";return; }
  try { $("first").value=await file.text();clear(); }
  catch { $("status").textContent="CSV okunamadı."; }
  finally { $("file").value=""; }
});
function compare(a,b) {
  if(a.length>4000||b.length>4000||a.length*b.length>4_000_000) throw Error("Karşılaştırma için daha kısa metinler seç.");
  const width=b.length+1;
  const d=new Uint16Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--) {
    for(let j=b.length-1;j>=0;j--) {
      const next=(i+1)*width+j, at=i*width+j;
      d[at]=a[i]===b[j]?d[next+1]+1:Math.max(d[next],d[at+1]);
    }
  }
  const out=[];
  let i=0,j=0;
  while(i<a.length||j<b.length) {
    if(i<a.length&&j<b.length&&a[i]===b[j]) {
      out.push([" ",a[i++]]);
      j++;
    }
    else if(i<a.length&&(j===b.length||d[(i+1)*width+j]>=d[i*width+j+1])) out.push(["-",a[i++]]);
    else out.push(["+",b[j++]]);
  }
  return out;
}
$("run").addEventListener("click",() => {
  clear();
  const mode=$("mode").value;
  const input=$("first").value;
  if(!input.trim()&&(mode!=="diff"||!$("second").value.trim())) {
    $("status").textContent="İşlemek için metin gir veya bir CSV dosyası seç.";
    return;
  }
  if(input.length>5_000_000||$("second").value.length>5_000_000) {
    $("status").textContent="Metin çok uzun.";
    return;
  }
  try {
    if(mode==="diff") {
      const changes=compare(input?lines(input):[],$("second").value?lines($("second").value):[]);
      const fragment=document.createDocumentFragment();
      for(const [op,line] of changes) {
        const row=document.createElement("span");
        row.className=op==="+"?"diff-add":op==="-"?"diff-del":"";
        row.textContent=op+" "+line+"\n";
        fragment.append(row);
      }
      $("diff").replaceChildren(fragment);$("diff").hidden=false;
      result=changes.map(([op,line])=>op+" "+line).join("\n");
      $("status").textContent=changes.filter(([op])=>op!==" ").length+" satır farkı.";
    } else if(mode==="lines") {
      const source=lines(input);
      const unique=[...new Set(source)];
      result=unique.join("\n");
      $("status").textContent=(source.length-unique.length)+" yinelenen satır kaldırıldı.";
    } else {
      const csv=window.Papa.parse(input,{skipEmptyLines:"greedy"});
      const error=csv.errors.find(e=>e.type==="Quotes");
      if(error) throw Error("CSV’de kapanmamış tırnak var.");
      const [header,...records]=csv.data;
      if (!header) throw Error("CSV’de işlenecek kayıt yok.");
      const seen=new Set();
      const unique=records.filter(row=>{
        const key=JSON.stringify(row);
        if(seen.has(key)) return false;
        seen.add(key);return true;
      });
      result=window.Papa.unparse([header,...unique],{delimiter:csv.meta.delimiter,escapeFormulae:true});
      $("status").textContent=(records.length-unique.length)+" yinelenen kayıt kaldırıldı.";
    }
    if(mode!=="diff") {
      $("output").value=result;
      $("output-label").hidden=false;
    }
    $("download").disabled=$("copy").disabled=false;
  } catch(e) {$("status").textContent=e.message||"İşlem tamamlanamadı.";}
});
$("copy").addEventListener("click",async ()=>{
  try {await navigator.clipboard.writeText(result);$("status").textContent="Kopyalandı.";}
  catch {$("status").textContent="Kopyalanamadı. Sonucu indirebilirsin.";}
});
$("download").addEventListener("click",()=>{
  const csv=$("mode").value==="csv";
  const url=URL.createObjectURL(new Blob([csv?"\uFEFF":"",result],{type:csv?"text/csv;charset=utf-8":"text/plain;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=csv?"temiz-veri.csv":"sonuc.txt";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
});
