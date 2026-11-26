import nspell from 'nspell';
const affUrl=new URL('../node_modules/dictionary-ru/index.aff',import.meta.url).href;
const dicUrl=new URL('../node_modules/dictionary-ru/index.dic',import.meta.url).href;
let checker;
async function load(){if(!checker){const [aff,dic]=await Promise.all([fetch(affUrl),fetch(dicUrl)]);if(!aff.ok||!dic.ok)throw Error('Не удалось загрузить словарь');checker=nspell(await aff.text(),await dic.text())}return checker}
self.onmessage=async ({data})=>{try{const spell=await load();if(data.type==='check'){const errors=[],seen=new Set();for(const match of data.text.matchAll(/[а-яё\u0301]+/giu)){const word=match[0].replace(/\u0301/g,'');if(!word||seen.has(word.toLocaleLowerCase('ru')))continue;seen.add(word.toLocaleLowerCase('ru'));if(!spell.correct(word))errors.push(word)}self.postMessage({type:'checked',id:data.id,errors})}else if(data.type==='suggest'){self.postMessage({type:'suggested',id:data.id,word:data.word,suggestions:spell.suggest(data.word).slice(0,8)})}}catch(e){self.postMessage({type:'error',id:data.id,message:e.message||'Ошибка проверки'})}};
