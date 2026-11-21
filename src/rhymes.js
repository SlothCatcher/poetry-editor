// Approximate orthographic rhyme analysis, not a phonetic or semantic dictionary.
const ACUTE='\u0301', VOWEL=/[аеёиоуыэюя]/i;
const functionWords=new Set(['а','и','о','об','от','до','на','за','по','со','во','из','не','ни','бы','ли','же','то','в','с','к','у','под','над','без','про','для','при']);
const count=s=>(s.match(/[аеёиоуыэюя]/gi)||[]).length;
function phonetic(s){return s.toLowerCase().replaceAll(ACUTE,'').replace(/[ьъ]/g,'').replace(/ё/g,'о').replace(/й/g,'и').replace(/([бвгдзж])$/g,c=>({'б':'п','в':'ф','г':'к','д':'т','з':'с','ж':'ш'}[c]))}
function position(word){let index=word.lastIndexOf(ACUTE)-1;if(index>=0&&VOWEL.test(word[index]))return index;index=word.toLowerCase().indexOf('ё');if(index>=0)return index;const v=[...word.matchAll(/[аеёиоуыэюя]/gi)];if(v.length===1&&!functionWords.has(word.toLowerCase()))return v[0].index;return -1}
function label(n){return n===0?'мужская':n===1?'женская':n===2?'дактилическая':'гипердактилическая'}
function candidates(line,lineIndex){
 const words=[...line.matchAll(/[а-яё\u0301]+/gi)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));const out=[];
 words.forEach((word,i)=>{
  const at=position(word.text);if(at<0)return;const stress=word.start+at;
  function add(endIndex){const last=words[endIndex], end=last.end, tail=line.slice(stress,end), normalized=phonetic(tail.replace(/[^а-яё\u0301]/gi,''));const pre=word.text.slice(0,at).replaceAll(ACUTE,'');out.push({lineIndex,first:count(line.slice(0,stress)),last:count(line.slice(0,end))-1,stress, start:word.start,end,term:line.slice(word.start,end),tail:normalized,prior:phonetic(pre).slice(-1),kind:label(count(tail)-1),compound:endIndex>i,isLineEnd:endIndex===words.length-1&&!/[a-zа-яё]/i.test(line.slice(end))})}
  add(i);
  for(let j=i+1;j<words.length&&j<=i+2;j++){const prev=words[j-1];if(!/^[\s-]+$/.test(line.slice(prev.end,words[j].start)))break;if(!functionWords.has(words[j].text.toLowerCase().replaceAll(ACUTE,''))||words[j].text.includes(ACUTE)||/[ёЁ]/.test(words[j].text))break;add(j)}
 });return out;
}
function compare(a,b){
 if(a.lineIndex===b.lineIndex&&a.start===b.start)return null;
 const av=a.tail.replace(/[^аеиоуыэюя]/g,''),bv=b.tail.replace(/[^аеиоуыэюя]/g,'');
 const ac=a.tail.replace(/[аеиоуыэюя]/g,''),bc=b.tail.replace(/[аеиоуыэюя]/g,'');
 if(a.tail===b.tail)return 'точная (приблизительно)';
 if(av&&av===bv&&(ac.length||bc.length))return 'неточная: ассонанс (предположение)';
 if((ac.length>=2||(ac.length>=1&&av.length>=2&&bv.length>=2))&&ac===bc&&av!==bv)return 'неточная: диссонанс (предположение)';
 return null;
}
export function analyzeRhymes(lines){
 const all=lines.flatMap(candidates), limited=all.length>350, nodes=all.slice(0,350), parent=nodes.map((_,i)=>i), edges=[];
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],type=compare(a,b);if(!type)continue;
  // Avoid matching a short form to another candidate with the same occurrence.
  parent[root(j)]=root(i);
  const rich=a.prior&&a.prior===b.prior?'богатая (опорный согласный совпадает)':'бедная (опорный согласный не совпадает)';
  edges.push({a:i,b:j,type,rich,compound:a.compound||b.compound,identical:a.term.toLowerCase().replaceAll(ACUTE,'')===b.term.toLowerCase().replaceAll(ACUTE,'')});
 }
 const byRoot=new Map();nodes.forEach((n,i)=>{const r=root(i);if(!byRoot.has(r))byRoot.set(r,[]);byRoot.get(r).push(i)});
 const palette=['#e7b1a7','#b7c9f3','#eac78d','#b6dccb','#d8b5e9','#eadca1','#a9d6e1','#e9b9d0','#c4d3a1','#c6c1ed','#e7c0a9','#9fd4c2'];
 const groups=[...byRoot.values()].filter(g=>g.length>1).map((members,i)=>({number:i+1,color:palette[i]||`hsl(${Math.round((i*137.508)%360)} 48% 79%)`,members}));
 const nodeGroup=new Map();groups.forEach(g=>g.members.forEach(i=>nodeGroup.set(i,g)));
 const cellGroups=lines.map(()=>new Map());nodes.forEach((n,i)=>{const g=nodeGroup.get(i);if(g)for(let c=n.first;c<=n.last;c++){const row=cellGroups[n.lineIndex];if(!row.has(c))row.set(c,g)}});
 // Schemes describe quatrains; empty lines delimit stanzas.
 const schemes=[];let stanza=[];
 function finish(){for(let k=0;k+3<stanza.length;k+=4){const indices=stanza.slice(k,k+4), ids=indices.map(line=>{let best=-1;nodes.forEach((n,i)=>{if(n.lineIndex===line&&n.isLineEnd&&nodeGroup.has(i)&&(best<0||n.start<nodes[best].start))best=i});return best<0?null:nodeGroup.get(best).number});if(ids.some(x=>x===null))continue;const [a,b,c,d]=ids;let name=a===b&&b===c&&c===d?'сквозная':a===b&&c===d&&a!==c?'смежная / парная':a===c&&b===d&&a!==b?'перекрёстная':a===d&&b===c&&a!==b?'кольцевая / охватная':null;if(name)schemes.push({from:indices[0]+1,to:indices[3]+1,name})}stanza=[]}
 lines.forEach((line,i)=>{if(line.trim())stanza.push(i);else finish()});finish();
 return {nodes,edges,groups,cellGroups,schemes,limited};
}
