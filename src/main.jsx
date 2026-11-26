import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button, ButtonGroup, Form} from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import {syllabify} from 'syllables-ru';
import DriveSync from './DriveSync';
import googleDriveIcon from './assets/google-drive.png';
import Collection, {folderPath} from './Collection';
import Hint from './Hint';
import SpellCheck from './SpellCheck';
import {analyzeRhymes,rhymeCandidates} from './rhymes';
import {getCachedRhymes,cacheRhymes} from './rhymeCache';

const editorIcons={
 text:<><path d="M4 5h16M4 9h16M4 13h12M4 17h14M4 21h9"/></>,
 grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
 rhyme:<><path d="M4 6h10M4 12h13M4 18h10"/><path d="M18 5c3 0 3 6 0 6M18 13c3 0 3 6 0 6"/></>,
 auto:<><path d="m4 20 11-11 3 3L7 23zM15 9l3 3M17 3v3M15.5 4.5h3M21 15v3M19.5 16.5h3"/></>,
 stress:<><path d="M5 19 9.5 8 14 19M6.5 15.5h6M11 5l3-2M16 19h4"/></>,
 trash:<><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10v7m4-7v7"/></>,
 server:<><rect x="4" y="4" width="16" height="7" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/><path d="M7 7.5h.01M7 16.5h.01M10 7.5h7M10 16.5h7"/></>,
 local:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>
};
function EditorIcon({name}){return <svg className="editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{editorIcons[name]}</svg>}

const KEY='stroka-poems-v1', FOLDERS_KEY='stroka-folders-v1', LIBRARY_KEY='stroka-library-v2', acute='\u0301', vowels=/[аеёиоуыэюя]/i;
// Normalize a legacy grave-accent character immediately after a Russian vowel.
const normalizeAccents = text => text.replace(/([аеёиоуыэюя])`/gi, '$1\u0301');
const createPoem=(folderId=null)=>({id:Date.now().toString(36)+Math.random().toString(36).slice(2),title:'',body:'',folderId,createdAt:Date.now(),updated:Date.now()});
function readFolders(){try{const library=JSON.parse(localStorage.getItem(LIBRARY_KEY));const f=Array.isArray(library?.folders)?library.folders:JSON.parse(localStorage.getItem(FOLDERS_KEY));return Array.isArray(f)?f.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'):[]}catch{return []}}
function readPoems(){try{const library=JSON.parse(localStorage.getItem(LIBRARY_KEY));let p=Array.isArray(library?.poems)?library.poems:JSON.parse(localStorage.getItem(KEY));if(Array.isArray(p)){p=p.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.body==='string');if(p.length)return p.map(item=>({...item,body:normalizeAccents(item.body)}))}}catch{} return [createPoem()]}
// Remember exact word forms per poem; ё and е and different inflections are distinct.
function applyChoices(text, choices, caret=null, skipActive=false){
 let delta=0, mapped=caret;
 const result=text.replace(/[а-яё\u0301]+/gi,(word,offset)=>{
  const plain=word.replaceAll(acute,''), key=plain.toLowerCase();
  if(!Object.hasOwn(choices,key) || (skipActive && caret!==null && caret>offset && caret<=offset+word.length)) return word;
  const position=choices[key];
  const updated=Number.isInteger(position)&&position>=0&&position<plain.length&&vowels.test(plain[position])?plain.slice(0,position+1)+acute+plain.slice(position+1):plain;
  if(caret!==null){
   if(caret>=offset+word.length) mapped+=updated.length-word.length;
   else if(caret>offset){const before=word.slice(0,caret-offset).replaceAll(acute,'').length; mapped=offset+delta+before+(Number.isInteger(position)&&before>position?1:0)}
  }
  delta+=updated.length-word.length;
  return updated;
 });
 return {text:result,caret:mapped};
}
// The library works on unaccented Russian words. Restore the accents by character position.
function syllables(word){const plain=word.replaceAll(acute,'');const parts=syllabify(plain).split('·');let pos=0,source=0;return parts.map(part=>{let result='';for(let i=0;i<part.length;i++){result+=word[source++]||'';while(word[source]===acute)result+=word[source++];pos++}return result})}
function lineCells(line){let cells=[], pending='';for(const token of line.match(/[а-яё\u0301]+|[^а-яё\u0301]+/gi)||[]){if(/[а-яё]/i.test(token)){let parts=syllables(token);if(!/[аеёиоуыэюя]/i.test(token)){pending+=token;continue}parts.forEach((part,i)=>{cells.push((i===0?pending:'')+part);pending='';});}else {if(cells.length)cells[cells.length-1]+=token;else pending+=token}}if(pending&&cells.length)cells[cells.length-1]+=pending;return cells}
function count(line){return (line.match(/[аеёиоуыэюя]/gi)||[]).length}
// rustress does not expose confidence scores; queue words still lacking a mark.
function unresolvedWords(text,choices){
 const seen=new Set(), result=[];
 for(const match of text.matchAll(/[а-яё\u0301]+/gi)){
  const word=match[0],plain=word.replaceAll(acute,''),key=plain.toLowerCase();
  if(word.includes(acute)||plain.length<2||!vowels.test(plain)||Object.hasOwn(choices,key)||seen.has(key))continue;
  seen.add(key);const lineStart=text.lastIndexOf('\n',match.index-1)+1;let lineEnd=text.indexOf('\n',match.index+word.length);if(lineEnd<0)lineEnd=text.length;
  const left=Math.max(lineStart,match.index-100),right=Math.min(lineEnd,match.index+word.length+100);
  result.push({key,word,before:(left>lineStart?'…':'')+text.slice(left,match.index),after:text.slice(match.index+word.length,right)+(right<lineEnd?'…':'')});
 }
 return result;
}
function SyllableCell({text, rhyme}){
 const cellRef=useRef(null), textRef=useRef(null);
 useLayoutEffect(()=>{
  let active=true;
  const fit=()=>{const cell=cellRef.current, label=textRef.current;if(!cell||!label)return;const available=Math.max(1,cell.clientWidth-12);const width=label.offsetWidth;label.style.transform=`scale(${width>available?available/width:1})`};
  fit();document.fonts.ready.then(()=>{if(active)fit()});
  const observer=new ResizeObserver(fit);observer.observe(cellRef.current);
  return()=>{active=false;observer.disconnect()};
 },[text]);
 return <div ref={cellRef} className={'cell '+(text.includes(acute)?'stressed ':'')+(rhyme?'rhymed':'')} style={rhyme?{'--rhyme-color':rhyme.color}:undefined} title={rhyme?`${text} — группа рифмы ${rhyme.number}`:text}><span ref={textRef} className="cell-label">{text}</span></div>
}
function RhymeHighlights({lines,analysis,layerRef}){
 const nodeColors=new Map();analysis.groups.forEach(group=>group.members.forEach(i=>nodeColors.set(i,group.color)));
 const pieces=[];lines.forEach((line,lineIndex)=>{
  const colors=Array(line.length).fill(null);
  analysis.nodes.forEach((node,i)=>{const color=nodeColors.get(i);if(color&&node.lineIndex===lineIndex)for(let j=node.start;j<node.end&&j<line.length;j++)if(!colors[j])colors[j]=color});
  let start=0;while(start<line.length){let end=start+1;while(end<line.length&&colors[end]===colors[start])end++;const text=line.slice(start,end);pieces.push(colors[start]?<span key={`${lineIndex}-${start}`} style={{backgroundColor:colors[start]}}>{text}</span>:<React.Fragment key={`${lineIndex}-${start}`}>{text}</React.Fragment>);start=end}
  if(lineIndex<lines.length-1)pieces.push('\n');
 });
 return <div className="rhyme-text-overlay" aria-hidden="true"><div ref={layerRef} className="rhyme-text-layer">{pieces}{'\u200b'}</div></div>
}
function App(){const [zoom,setZoom]=useState(()=>{try{const v=Number(localStorage.getItem('stroka-editor-zoom'));return v>=70&&v<=150?v:100}catch{return 100}});const [poems,setPoems]=useState(readPoems);const [folders,setFolders]=useState(readFolders);const [folderId,setFolderId]=useState(null);const [id,setId]=useState(()=>poems[0].id);const [mode,setMode]=useState('text');const [showRhymes,setShowRhymes]=useState(false);const [rhymeMethod,setRhymeMethod]=useState('server');const [includeApprox,setIncludeApprox]=useState(false);const [modelRhymes,setModelRhymes]=useState(null);const [rhymeStatus,setRhymeStatus]=useState('');const [status,setStatus]=useState('Сохранено на устройстве');const [notice,setNotice]=useState('');const [processing,setProcessing]=useState(false);const area=useRef(null);const rhymeTextLayer=useRef(null);const importInput=useRef(null);const gutter=useRef(null);const workspace=useRef(null);const collectionContent=useRef(null);const [fullscreen,setFullscreen]=useState(false);const [frameExpanded,setFrameExpanded]=useState(false);const [collectionHidden,setCollectionHidden]=useState(()=>typeof window!=='undefined' && window.matchMedia('(max-width: 700px)').matches);const [driveOpen,setDriveOpen]=useState(false);const driveDialog=useRef(null);const reviewDialog=useRef(null);const [review,setReview]=useState(null);const latest=useRef(poems);latest.current=poems;const poem=poems.find(p=>p.id===id)||poems[0];const lines=poem.body.split('\n');const modelLabels=modelRhymes?.body===poem.body?modelRhymes.labels:null;const rhymeAnalysis=showRhymes?analyzeRhymes(lines,modelLabels,rhymeMethod,includeApprox):null;
useLayoutEffect(()=>{if(rhymeTextLayer.current&&area.current)rhymeTextLayer.current.style.transform=`translate(${-area.current.scrollLeft}px, ${-area.current.scrollTop}px)`},[showRhymes,mode]);
useEffect(()=>{try{localStorage.setItem('stroka-editor-zoom',String(zoom))}catch{}},[zoom]);
useEffect(()=>{try{localStorage.setItem(LIBRARY_KEY,JSON.stringify({poems,folders}));setStatus('Сохранено на устройстве')}catch{setStatus('Не удалось сохранить')}},[poems,folders]);
useEffect(()=>{const onChange=()=>setFullscreen(document.fullscreenElement===workspace.current);document.addEventListener('fullscreenchange',onChange);return()=>document.removeEventListener('fullscreenchange',onChange)},[]);
useEffect(()=>{if(!frameExpanded)return;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=e=>{if(e.key==='Escape'&&!reviewDialog.current?.open){e.preventDefault();setFrameExpanded(false)}};document.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onKey)}},[frameExpanded]);
async function toggleFullscreen(){
 let inFrame=true;try{inFrame=window.self!==window.top}catch{}
 if(inFrame){setFrameExpanded(value=>!value);return}
 try{if(document.fullscreenElement===workspace.current)await document.exitFullscreen();else if(workspace.current?.requestFullscreen)await workspace.current.requestFullscreen();else setFrameExpanded(value=>!value)}catch{setFrameExpanded(value=>!value)}
}
useEffect(()=>{const dialog=driveDialog.current;if(!dialog)return;if(driveOpen&&!dialog.open)dialog.showModal();else if(!driveOpen&&dialog.open)dialog.close()},[driveOpen]);
useEffect(()=>{if(collectionContent.current)collectionContent.current.inert=collectionHidden},[collectionHidden]);
useEffect(()=>{
 if(!showRhymes||rhymeMethod!=='server')return;
 const body=poem.body,terms=rhymeCandidates(body.split('\n')).map(n=>n.term);
 if(terms.length<2){setModelRhymes(null);setRhymeStatus('Для серверного анализа нужно не менее двух ударных слов.');return}
 const cached=getCachedRhymes(terms);if(cached){setModelRhymes({body,labels:cached.labels});setRhymeStatus('Серверная модель RhymeTagger: результат из кэша'+(cached.stress_uncertain.length?`; часть ударений модель не смогла перенести в транскрипцию (${cached.stress_uncertain.length}).`:'.'));return}
 const abort=new AbortController();setModelRhymes(null);setRhymeStatus('Серверная модель анализирует рифмы…');
 const timer=setTimeout(async()=>{try{const response=await fetch('/api/rhymes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({terms}),signal:abort.signal});if(!response.ok)throw new Error('server');const data=await response.json();if(!Array.isArray(data.labels)||data.labels.length!==terms.length)throw new Error('invalid');cacheRhymes(terms,data);setModelRhymes({body,labels:data.labels});setRhymeStatus('Серверная модель RhymeTagger'+(data.stress_uncertain?.length?`; часть ударений модель не смогла перенести в транскрипцию (${data.stress_uncertain.length}).`:'.'));}catch(e){if(e.name!=='AbortError')setRhymeStatus('Серверная модель недоступна. Выберите локальный анализ или запустите сервер.')}} ,650);
 return()=>{clearTimeout(timer);abort.abort()};
},[showRhymes,mode,rhymeMethod,poem.id,poem.body]);
useEffect(()=>{const dialog=reviewDialog.current;if(!dialog)return;if(review&&!dialog.open)dialog.showModal();else if(!review&&dialog.open)dialog.close()},[review]);
function reviewNext(position,skip=false){
 if(!review)return;const current=review.items[review.index];const currentPoem=latest.current.find(p=>p.id===review.target);
 if(!currentPoem||currentPoem.body!==review.body){setReview(null);setNotice('Стих изменился во время проверки. Запустите автоматическую расстановку ещё раз.');return}
 let body=review.body;
 if(!skip){const choices={...(currentPoem.stressChoices||{}),[current.key]:position};body=applyChoices(body,choices).text;setPoems(prev=>prev.map(p=>p.id===review.target&&p.body===review.body?{...p,body,stressChoices:choices,updated:Date.now()}:p))}
 if(review.index+1>=review.items.length){setReview(null);setNotice('Проверка завершена. Выбор применён к стихотворению.')}else setReview({...review,index:review.index+1,body});
}
useEffect(()=>{if(folderId&&!folders.some(f=>f.id===folderId))setFolderId(null)},[folders,folderId]);
function change(field,value){if(field==='body')value=normalizeAccents(value);setPoems(prev=>prev.map(p=>p.id===poem.id?{...p,[field]:value,updated:Date.now()}:p))}
function add(){const p=createPoem(folderId);setPoems(prev=>[p,...prev]);setId(p.id);setMode('text')}
async function importFiles(event){
 const input=event.currentTarget,files=[...input.files];input.value='';if(!files.length)return;
 const imported=[],errors=[];
 for(const file of files){
  if(!/\.txt$/i.test(file.name)){errors.push(`${file.name}: нужен файл .txt`);continue}
  if(file.size>2*1024*1024){errors.push(`${file.name}: больше 2 МБ`);continue}
  try{
   const bytes=await file.arrayBuffer();let body=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
   if(body.includes('\0'))throw new Error('не текстовый файл');
   if(!body.trim())throw new Error('файл пуст');
   const filename=file.name.replace(/\.txt$/i,'').trim();
   const title=(/^Notes_\d{6}_\d{6}$/i.test(filename)?(body.split('\n').find(line=>line.trim())||filename):filename).trim().slice(0,120)||'Импортированный стих';
   imported.push({...createPoem(folderId),title,body});
  }catch(e){errors.push(`${file.name}: ${e instanceof TypeError?'нужна кодировка UTF-8':e.message}`)}
 }
 if(imported.length){setPoems(prev=>[...imported,...prev]);setId(imported[0].id);setMode('text');if(window.matchMedia('(max-width: 700px)').matches)setCollectionHidden(true)}
 setNotice([imported.length?`Импортировано файлов: ${imported.length}.`:'',errors.length?`Не удалось импортировать: ${errors.join('; ')}.`:''].filter(Boolean).join(' '));
}
function deletePoem(targetId){let rest=poems.filter(p=>p.id!==targetId);if(!rest.length)rest=[createPoem(folderId)];setPoems(rest);if(poem.id===targetId)setId(rest[0].id)}
function remove(){if(!confirm('Удалить это стихотворение? Это действие нельзя отменить.'))return;deletePoem(poem.id)}
function mark(){
 const el=area.current;if(!el)return;
 const start=el.selectionStart,end=el.selectionEnd,s=el.value;
 if(start!==end){setNotice('Снимите выделение и поставьте курсор после гласной.');el.focus();return}
 let i=start-1;if(s[i]===acute)i--;
 if(i<0||!vowels.test(s[i])){setNotice('Поставьте курсор сразу после русской гласной.');el.focus();return}
 const match=[...s.matchAll(/[а-яё\u0301]+/gi)].find(m=>i>=m.index&&i<m.index+m[0].length);
 if(!match)return;
 const word=match[0], key=word.replaceAll(acute,'').toLowerCase();
 const position=word.slice(0,i-match.index+1).replaceAll(acute,'').length-1;
 const exists=s[i+1]===acute, choices={...(poem.stressChoices||{}),[key]:exists?null:position};
 const {text,caret}=applyChoices(s,choices,i+1+(exists?1:0));
 setPoems(prev=>prev.map(p=>p.id===poem.id?{...p,body:text,stressChoices:choices,updated:Date.now()}:p));
 setNotice(exists?'Ударение снято во всех таких словах.':'Ударение обновлено во всех таких словах.');
 requestAnimationFrame(()=>{el.focus();el.setSelectionRange(caret,caret)});
}
function editBody(event){
 const el=event.target, value=normalizeAccents(el.value), start=el.selectionStart, end=el.selectionEnd;
 if(start!==end){change('body',value);return}
 const result=applyChoices(value,poem.stressChoices||{},start,true);
 change('body',result.text);
 if(result.text!==value)requestAnimationFrame(()=>{if(document.activeElement===el)el.setSelectionRange(result.caret,result.caret)});
}
function finishWord(){const result=applyChoices(poem.body,poem.stressChoices||{});if(result.text!==poem.body)change('body',result.text)}
async function autoStress(){
 const original=poem.body, target=poem.id;
 if(!original.trim()){setNotice('Сначала напишите стихотворение.');return}
 setProcessing(true);setNotice('Загружаем модель и расставляем ударения…');
 try{
  const {autoAccent}=await import('./stress.js');
  const result=applyChoices(await autoAccent(original),poem.stressChoices||{}).text;
  setPoems(prev=>prev.map(p=>p.id===target && p.body===original ? {...p,body:result,updated:Date.now()} : p));
  // React may defer state updates: detect changes through a current snapshot instead.
  if(latest.current.find(p=>p.id===target)?.body!==original){setNotice('Текст изменился во время обработки. Попробуйте ещё раз.');return}
  const pending=unresolvedWords(result,poem.stressChoices||{});
  if(pending.length){setReview({target,body:result,items:pending,index:0});setNotice('Проверьте слова без ударений.');}else setNotice('Готово. Проверьте ударения: модель может ошибаться.');
 }catch(err){console.error(err);setNotice('Не удалось расставить ударения. Проверьте соединение и попробуйте снова.');}
 finally{setProcessing(false)}
}
function download(){const blob=new Blob([(poem.title.trim()?poem.title.trim()+'\n\n':'')+poem.body],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(poem.title.trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'стихотворение')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
return <><header><a className="brand" href="#"><svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36"/></svg><span>строка</span></a><div className="header-right"><span>{status}</span><button className="drive-header-button" onClick={()=>setDriveOpen(true)} aria-label="Настройки Google Диска" title="Google Диск"><img src={googleDriveIcon} width="24" height="24" alt="" aria-hidden="true"/></button><Button variant="outline-secondary" size="sm" onClick={download}>↓ Скачать .txt</Button></div></header><main><div className={'workspace'+(frameExpanded?' expanded-in-frame':'')+(collectionHidden?' collection-hidden':'')} ref={workspace}><aside className="collection-panel"><div id="collection-list" className="collection-content" ref={collectionContent} aria-hidden={collectionHidden}><Collection poems={poems} setPoems={setPoems} folders={folders} setFolders={setFolders} poem={poem} folderId={folderId} setFolderId={setFolderId} onAdd={add} onDelete={deletePoem} onPick={id=>{setId(id);if(window.matchMedia('(max-width: 700px)').matches)setCollectionHidden(true)}} onImport={<><input ref={importInput} type="file" accept=".txt,text/plain" multiple hidden onChange={importFiles}/><Button variant="outline-secondary" className="collection-import-button" onClick={()=>importInput.current?.click()}>Импорт из .txt</Button></>}/></div><button className="collection-icon collection-panel-toggle" onClick={()=>setCollectionHidden(v=>!v)} aria-label={collectionHidden?'Показать коллекцию':'Скрыть коллекцию'} title={collectionHidden?'Показать коллекцию':'Скрыть коллекцию'} aria-expanded={!collectionHidden} aria-controls="collection-list"><svg className={'collection-arrow'+(collectionHidden?' is-collapsed':'')} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button></aside>{!collectionHidden&&<button className="collection-backdrop" onClick={()=>setCollectionHidden(true)} aria-label="Закрыть коллекцию" tabIndex={-1}/>}<section className="editor" style={{'--editor-zoom':zoom/100}}><div className="editor-top"><label className="editor-folder"><svg className="editor-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><Form.Select size="sm" aria-label="Папка стихотворения" value={poem.folderId||''} onChange={e=>{const target=e.target.value||null;change('folderId',target);setFolderId(target)}}><option value="">Без папки</option>{folders.map(f=><option key={f.id} value={f.id}>{folderPath(folders,f.id)}</option>)}</Form.Select></label><div className="editor-actions"><button className="text-button fullscreen-button" onClick={toggleFullscreen} aria-label={(fullscreen||frameExpanded)?'Свернуть редактор':'Развернуть редактор на весь экран'} title={(fullscreen||frameExpanded)?'Свернуть':'На весь экран'}><svg className="fullscreen-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={(fullscreen||frameExpanded)?'M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5':'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}/></svg></button><button className="text-button editor-icon-button" onClick={remove} aria-label="Удалить стих" title="Удалить стих"><EditorIcon name="trash"/></button></div></div><Form.Control className="title-input" value={poem.title} maxLength={120} onChange={e=>change('title',e.target.value)} aria-label="Название стихотворения" placeholder="Название стиха"/><div className="toolbar"><ButtonGroup size="sm" aria-label="Вид отображения"><Button className="editor-icon-button" variant={mode==='text'?'success':'outline-secondary'} onClick={()=>setMode('text')} aria-label="Текст" title="Текст" aria-pressed={mode==='text'}><EditorIcon name="text"/></Button><span className="control-with-hint grid-control"><Button className="editor-icon-button" variant={mode==='grid'?'success':'outline-secondary'} onClick={()=>setMode('grid')} aria-label="Сетка слогов" title="Сетка слогов" aria-pressed={mode==='grid'}><EditorIcon name="grid"/></Button><Hint label="Справка о сетке слогов">Каждая клетка — слог. Ударные слоги выделены зелёным. Для редактирования вернитесь в «Текст».</Hint></span></ButtonGroup>{<span className="control-with-hint"><Button className="editor-icon-button" size="sm" variant={showRhymes?'success':'outline-secondary'} onClick={()=>setShowRhymes(v=>!v)} aria-pressed={showRhymes} aria-label="Рифмы" title={showRhymes?'Рифмы включены':'Рифмы выключены'}><EditorIcon name="rhyme"/></Button><Hint label="Справка о рифмах">Рифмы внутри строк и на их концах определяются приблизительно. Проверьте ударения. Группы могут объединяться по цепочке, а омонимическую рифму нужно проверять по смыслу вручную.</Hint></span>}<Button className="editor-icon-button" size="sm" variant="outline-secondary" onClick={autoStress} disabled={processing} aria-label={processing?'Расставляем ударения':'Расставить ударения автоматически'} title={processing?'Расставляем ударения…':'Расставить ударения автоматически'}><EditorIcon name="auto"/></Button>{mode==='text'&&<span className="control-with-hint"><Button className="editor-icon-button" size="sm" variant="outline-secondary" onMouseDown={e=>e.preventDefault()} onClick={mark} aria-label="Ударение" title="Ударение (Ctrl + Enter)"><EditorIcon name="stress"/></Button><Hint label="Справка об ударениях">Поставьте курсор после гласной и нажмите кнопку или Ctrl + Enter. Повторное нажатие снимает ударение. Выбор применяется ко всем таким же словам в этом стихе.</Hint></span>}<label className="zoom-control" title="Масштаб текста и сетки"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6M10.5 7.5v6"/></svg><input type="range" min="70" max="150" step="10" value={zoom} onChange={e=>setZoom(Number(e.target.value))} aria-label="Масштаб редактора" aria-valuetext={`${zoom}%`}/><output>{zoom}%</output></label><SpellCheck text={poem.body} poemId={poem.id} onReplace={(word,replacement)=>{const pattern=/[а-яё\u0301]+/giu;const match=[...poem.body.matchAll(pattern)].find(m=>m[0].replace(/\u0301/g,'').toLocaleLowerCase('ru')===word.toLocaleLowerCase('ru'));if(match)change('body',poem.body.slice(0,match.index)+replacement+poem.body.slice(match.index+match[0].length))}}/></div>{showRhymes&&<div className="rhyme-analysis"><div className="rhyme-method"><span>Метод анализа:</span><span className="control-with-hint method-control"><ButtonGroup size="sm" aria-label="Метод анализа рифм"><Button className="editor-icon-button" variant={rhymeMethod==='server'?'success':'outline-secondary'} onClick={()=>setRhymeMethod('server')} aria-pressed={rhymeMethod==='server'} aria-label="Серверный анализ" title="Серверный анализ"><EditorIcon name="server"/></Button><Button className="editor-icon-button" variant={rhymeMethod==='local'?'success':'outline-secondary'} onClick={()=>setRhymeMethod('local')} aria-pressed={rhymeMethod==='local'} aria-label="Локальный анализ" title="Локальный анализ"><EditorIcon name="local"/></Button></ButtonGroup><Hint label="Справка о методах анализа">Серверный метод использует модель RhymeTagger. Локальный сравнивает приблизительные окончания от ударной гласной в браузере. Оба метода могут ошибаться.</Hint></span></div>{rhymeMethod==='server'&&<div className="rhyme-extra"><div className="control-with-hint"><Form.Check type="switch" id="rhyme-approx" label="Добавлять неточные рифмы (эвристика)" checked={includeApprox} onChange={e=>setIncludeApprox(e.target.checked)}/><Hint label="Справка о неточных рифмах">Может находить ассонансы и диссонансы, которые пропустила модель, но иногда объединяет неродственные слова.</Hint></div></div>}<div className="rhyme-model-status" role="status">{rhymeMethod==='server'?rhymeStatus:'Локальный анализ'}</div><div className="rhyme-legend" aria-live="polite">{rhymeAnalysis.groups.length?rhymeAnalysis.groups.map(group=><span key={group.number} title={[...new Set(group.members.map(i=>rhymeAnalysis.nodes[i].term))].join(', ')}><i style={{background:group.color}}/>Группа {group.number}: {[...new Set(group.members.map(i=>rhymeAnalysis.nodes[i].term))].slice(0,4).join(', ')}{new Set(group.members.map(i=>rhymeAnalysis.nodes[i].term)).size>4?'…':''}</span>):<span>{rhymeMethod==='server'&&!modelLabels?'Результат серверного анализа пока недоступен.':'Рифмы не найдены. Для многосложных слов нужны ударения.'}</span>}</div>{rhymeAnalysis.schemes.map((s,i)=><div key={i}>Строки {s.from}–{s.to}: {s.name} рифмовка.</div>)}{rhymeAnalysis.limited&&<div>Анализ ограничен первыми 350 ударными словами и сочетаниями.</div>}{rhymeAnalysis.edges.length>0&&<details><summary>Показать найденные пары и виды рифм ({rhymeAnalysis.edges.length})</summary><ul>{rhymeAnalysis.edges.slice(0,100).map((edge,i)=>{const a=rhymeAnalysis.nodes[edge.a],b=rhymeAnalysis.nodes[edge.b];return <li key={i}>«{a.term}» (стр. {a.lineIndex+1}) — «{b.term}» (стр. {b.lineIndex+1}): {a.kind} / {b.kind}; {edge.type}; {edge.rich}{edge.compound?'; возможная составная':''}{edge.identical?'; повтор слова — омонимию нужно проверить по смыслу':''}</li>})}</ul>{rhymeAnalysis.edges.length>100&&<span>Показаны первые 100 пар.</span>}</details>}</div>}{mode==='text'?<><div className={'writing'+(showRhymes?' showing-rhymes':'')}>{showRhymes&&<RhymeHighlights lines={lines} analysis={rhymeAnalysis} layerRef={rhymeTextLayer}/>}<textarea ref={area} value={poem.body} onChange={editBody} onBlur={finishWord} onKeyDown={e=>{if(e.ctrlKey&&!e.altKey&&!e.metaKey&&e.key==='Enter'){e.preventDefault();mark()}}} onScroll={e=>{if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop;if(rhymeTextLayer.current)rhymeTextLayer.current.style.transform=`translate(${-e.currentTarget.scrollLeft}px, ${-e.currentTarget.scrollTop}px)`}} aria-label="Текст стихотворения" wrap="off" spellCheck="true" placeholder="Начните писать здесь..."/><div ref={gutter} className="gutter" aria-label="Количество слогов в строках">{lines.map((l,i)=><div key={i} title={`Строка ${i+1}: ${count(l)} слогов`}>{l.trim()?count(l):''}</div>)}</div></div></>:<><div className="grid-view"><div className="grid-scroll" aria-label="Сетка слогов"><div className="grid-rows">{lines.map((line,i)=><div className="grid-line" key={i}><span className="line-number">{i+1}</span><div className="cells">{lineCells(line).map((cell,j)=>{const group=rhymeAnalysis?.cellGroups[i].get(j);return <SyllableCell key={j} text={cell} rhyme={group}/>})}{!count(line)&&<span className="empty-line">{line||'—'}</span>}</div></div>)}</div></div><div className="grid-counts" aria-label="Количество слогов в строках">{lines.map((line,i)=><div className="grid-count" key={i}>{line.trim()?count(line):''}</div>)}</div></div></>}<div className="notice" aria-live="polite">{notice}</div><div className="editor-bottom"><span>{poem.body.trim()?poem.body.trim().split(/\s+/).length:0} слов · {lines.filter(line=>line.trim()).length} строк</span></div><dialog ref={reviewDialog} className="stress-dialog" aria-labelledby="stress-dialog-title" onClose={()=>setReview(null)}>{review&&(()=>{const item=review.items[review.index];return <><div className="stress-dialog-header"><div><div className="small-label">ПРОВЕРКА УДАРЕНИЙ</div><h2 id="stress-dialog-title">Выберите ударение</h2></div><button className="dialog-close" aria-label="Закрыть проверку" onClick={()=>setReview(null)}>×</button></div><p className="stress-progress">Слово {review.index+1} из {review.items.length}</p><p className="stress-explanation">Модель оставила это слово без ударения. Выберите ударную гласную; одинаковые слова в стихотворении изменятся вместе.</p><div className="stress-context">{item.before}<mark>{item.word}</mark>{item.after}</div><div className="stress-choices" role="group" aria-label={'Варианты ударения для слова '+item.word}>{[...item.word.matchAll(/[аеёиоуыэюя]/gi)].map(m=>{const i=m.index;const variant=item.word.slice(0,i+1)+acute+item.word.slice(i+1);return <Button key={i} variant="outline-success" onClick={()=>reviewNext(i)}>{variant}</Button>})}</div><div className="stress-review-actions"><Button size="sm" variant="outline-secondary" onClick={()=>reviewNext(null)}>Оставить без ударения</Button><Button size="sm" variant="outline-secondary" onClick={()=>reviewNext(null,true)}>Пропустить</Button><Button size="sm" variant="outline-secondary" onClick={()=>setReview(null)}>Завершить проверку</Button></div><p className="stress-disclaimer">Здесь показаны слова, оставшиеся без отметки; библиотека не сообщает оценку уверенности. Однобуквенные слова пропущены.</p></>})()}</dialog></section></div></main><dialog ref={driveDialog} className="drive-dialog" onClose={()=>setDriveOpen(false)} aria-labelledby="drive-dialog-title"><div className="drive-dialog-top"><h2 id="drive-dialog-title">Синхронизация</h2><button className="dialog-close" onClick={()=>setDriveOpen(false)} aria-label="Закрыть">×</button></div><DriveSync poems={poems} setPoems={setPoems} folders={folders} setFolders={setFolders}/></dialog></>}

createRoot(document.getElementById('root')).render(<App/>);
