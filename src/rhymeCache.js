// Results are specific to candidate ordering and this model/protocol version.
const KEY = 'stroka-rhyme-analysis-cache-v1';
const VERSION = 'rhymetagger-ru-1.0.0-espeak-stress-v1';
const MAX_ENTRIES = 24;
const MAX_BYTES = 700_000;
let memory = null;
function load() {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    memory = parsed?.version === VERSION && Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch { memory = []; }
  return memory;
}
function persist() {
  let content=JSON.stringify({version:VERSION,entries:memory});
  while(content.length>MAX_BYTES&&memory.length>1){memory.pop();content=JSON.stringify({version:VERSION,entries:memory})}
  try { localStorage.setItem(KEY,content) } catch { /* In-memory cache still works. */ }
}
export function getCachedRhymes(terms) {
  const key = JSON.stringify(terms), entries=load();
  const index=entries.findIndex(e=>e?.key===key);
  if(index<0)return null;
  const entry=entries[index], data=entry.data;
  if(!Array.isArray(data?.labels)||data.labels.length!==terms.length||!data.labels.every(x=>x===null||(Number.isInteger(x)&&x>=0))||!Array.isArray(data.stress_uncertain)){entries.splice(index,1);persist();return null}
  entries.splice(index,1);entries.unshift(entry);persist();return data;
}
export function cacheRhymes(terms,data) {
  if(!Array.isArray(data?.labels)||data.labels.length!==terms.length||!data.labels.every(x=>x===null||(Number.isInteger(x)&&x>=0))||!Array.isArray(data.stress_uncertain))return;
  const entries=load(),key=JSON.stringify(terms), old=entries.findIndex(e=>e?.key===key);if(old>=0)entries.splice(old,1);
  entries.unshift({key,data:{labels:data.labels,stress_uncertain:data.stress_uncertain}});entries.splice(MAX_ENTRIES);persist();
}
