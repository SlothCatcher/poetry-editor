import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button, ButtonGroup, Form} from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import {syllabify} from 'syllables-ru';
import DriveSync from './DriveSync';
import {analyzeRhymes,rhymeCandidates} from './rhymes';

const KEY='stroka-poems-v1', acute='\u0301', vowels=/[аеёиоуыэюя]/i;
// Normalize a legacy grave-accent character immediately after a Russian vowel.
const normalizeAccents = text => text.replace(/([аеёиоуыэюя])`/gi, '$1\u0301');
const createPoem=()=>({id:Date.now().toString(36)+Math.random().toString(36).slice(2),title:'',body:'',updated:Date.now()});
function readPoems(){try{let p=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(p)){p=p.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.body==='string');if(p.length)return p.map(item=>({...item,body:normalizeAccents(item.body)}))}}catch{} return [createPoem()]}
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
function App(){const [poems,setPoems]=useState(readPoems);const [id,setId]=useState(()=>poems[0].id);const [mode,setMode]=useState('text');const [showRhymes,setShowRhymes]=useState(false);const [modelRhymes,setModelRhymes]=useState(null);const [rhymeStatus,setRhymeStatus]=useState('');const [status,setStatus]=useState('Сохранено на устройстве');const [notice,setNotice]=useState('');const [processing,setProcessing]=useState(false);const area=useRef(null);const gutter=useRef(null);const workspace=useRef(null);const collectionContent=useRef(null);const [fullscreen,setFullscreen]=useState(false);const [frameExpanded,setFrameExpanded]=useState(false);const [collectionHidden,setCollectionHidden]=useState(false);const [driveOpen,setDriveOpen]=useState(false);const driveDialog=useRef(null);const latest=useRef(poems);latest.current=poems;const poem=poems.find(p=>p.id===id)||poems[0];const lines=poem.body.split('\n');const modelLabels=modelRhymes?.body===poem.body?modelRhymes.labels:null;const rhymeAnalysis=showRhymes&&mode==='grid'?analyzeRhymes(lines,modelLabels):null;
useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(poems));setStatus('Сохранено на устройстве')}catch{setStatus('Не удалось сохранить')}},[poems]);
useEffect(()=>{const onChange=()=>setFullscreen(document.fullscreenElement===workspace.current);document.addEventListener('fullscreenchange',onChange);return()=>document.removeEventListener('fullscreenchange',onChange)},[]);
useEffect(()=>{if(!frameExpanded)return;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=e=>{if(e.key==='Escape'){e.preventDefault();setFrameExpanded(false)}};document.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onKey)}},[frameExpanded]);
async function toggleFullscreen(){
 let inFrame=true;try{inFrame=window.self!==window.top}catch{}
 if(inFrame){setFrameExpanded(value=>!value);return}
 try{if(document.fullscreenElement===workspace.current)await document.exitFullscreen();else if(workspace.current?.requestFullscreen)await workspace.current.requestFullscreen();else setFrameExpanded(value=>!value)}catch{setFrameExpanded(value=>!value)}
}
useEffect(()=>{const dialog=driveDialog.current;if(!dialog)return;if(driveOpen&&!dialog.open)dialog.showModal();else if(!driveOpen&&dialog.open)dialog.close()},[driveOpen]);
useEffect(()=>{if(collectionContent.current)collectionContent.current.inert=collectionHidden},[collectionHidden]);
useEffect(()=>{
 if(!showRhymes||mode!=='grid')return;
 const body=poem.body,terms=rhymeCandidates(body.split('\n')).map(n=>n.term);
 if(terms.length<2){setModelRhymes(null);setRhymeStatus('Для серверного анализа нужно не менее двух ударных слов.');return}
 const abort=new AbortController();setModelRhymes(null);setRhymeStatus('Серверная модель анализирует рифмы…');
 const timer=setTimeout(async()=>{try{const response=await fetch('/api/rhymes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({terms}),signal:abort.signal});if(!response.ok)throw new Error('server');const data=await response.json();if(!Array.isArray(data.labels)||data.labels.length!==terms.length)throw new Error('invalid');setModelRhymes({body,labels:data.labels});setRhymeStatus('Модель RhymeTagger и браузерные эвристики'+(data.stress_uncertain?.length?`; часть ударений модель не смогла перенести в транскрипцию (${data.stress_uncertain.length}).`:'.'));}catch(e){if(e.name!=='AbortError')setRhymeStatus('Серверная модель недоступна. Показан только приблизительный анализ в браузере.')}} ,650);
 return()=>{clearTimeout(timer);abort.abort()};
},[showRhymes,mode,poem.id,poem.body]);
function change(field,value){if(field==='body')value=normalizeAccents(value);setPoems(prev=>prev.map(p=>p.id===poem.id?{...p,[field]:value,updated:Date.now()}:p))}
function add(){const p=createPoem();setPoems(prev=>[p,...prev]);setId(p.id);setMode('text')}
function remove(){if(!confirm('Удалить это стихотворение? Это действие нельзя отменить.'))return;let rest=poems.filter(p=>p.id!==poem.id);if(!rest.length)rest=[createPoem()];setPoems(rest);setId(rest[0].id)}
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
  setNotice('Готово. Проверьте ударения: модель может ошибаться.');
 }catch(err){console.error(err);setNotice('Не удалось расставить ударения. Проверьте соединение и попробуйте снова.');}
 finally{setProcessing(false)}
}
function download(){const blob=new Blob([(poem.title.trim()?poem.title.trim()+'\n\n':'')+poem.body],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(poem.title.trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'стихотворение')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
return <><header><a className="brand" href="#">✳ <span>строка</span></a><div className="header-right"><span>{status}</span><button className="drive-header-button" onClick={()=>setDriveOpen(true)} aria-label="Настройки Google Диска" title="Google Диск"><svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path fill="#00875a" d="M8.5 3h4l-8 14-2-3.5z"/><path fill="#ffba00" d="M4.5 17h15l-2 3.5h-15z"/><path fill="#2684fc" d="M12.5 3l9 14h-4L8.5 3z"/></svg></button><Button variant="outline-secondary" size="sm" onClick={download}>↓ Скачать .txt</Button></div></header><main><div className="intro"><div><div className="eyebrow">ВАШЕ ПРОСТРАНСТВО ДЛЯ ТВОРЧЕСТВА</div><h1>Пусть слова<br/><em>найдут свой ритм.</em></h1><p>Место для мыслей, образов и строк, которые хочется сохранить.</p></div><div className="decoration">✳</div></div><div className={'workspace'+(frameExpanded?' expanded-in-frame':'')+(collectionHidden?' collection-hidden':'')} ref={workspace}><aside className="collection-panel"><div id="collection-list" className="collection-content" ref={collectionContent} aria-hidden={collectionHidden}><div className="aside-head"><div><span className="small-label">КОЛЛЕКЦИЯ</span><h2>Мои стихи <span>{poems.length}</span></h2></div><Button variant="light" className="add" onClick={add} aria-label="Новый стих">＋</Button></div><div className="poem-list">{poems.map(p=><button key={p.id} className={'poem '+(p.id===poem.id?'active':'')} onClick={()=>setId(p.id)}><strong>{p.title.trim()||'Без названия'}</strong><span>{p.body.trim().replace(/\s+/g,' ').slice(0,45)||'Новый стих'}</span></button>)}</div><div className="aside-bottom">✧ <span>Каждая строка имеет значение.</span></div></div><button className="collection-icon collection-panel-toggle" onClick={()=>setCollectionHidden(v=>!v)} aria-label={collectionHidden?'Показать коллекцию':'Скрыть коллекцию'} title={collectionHidden?'Показать коллекцию':'Скрыть коллекцию'} aria-expanded={!collectionHidden} aria-controls="collection-list"><svg className={'collection-arrow'+(collectionHidden?' is-collapsed':'')} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button></aside><section className="editor"><div className="editor-top"><span><i/> РЕДАКТОР</span><div className="editor-actions"><button className="text-button fullscreen-button" onClick={toggleFullscreen} aria-label={(fullscreen||frameExpanded)?'Свернуть редактор':'Развернуть редактор на весь экран'} title={(fullscreen||frameExpanded)?'Свернуть':'На весь экран'}>{(fullscreen||frameExpanded)?'⤢ Свернуть':'⛶ На весь экран'}</button><button className="text-button" onClick={remove}>Удалить стих</button></div></div><Form.Control className="title-input" value={poem.title} maxLength={120} onChange={e=>change('title',e.target.value)} aria-label="Название стихотворения" placeholder="Название стихотворения"/><div className="toolbar"><ButtonGroup size="sm" aria-label="Вид отображения"><Button variant={mode==='text'?'success':'outline-secondary'} onClick={()=>setMode('text')}>Текст</Button><Button variant={mode==='grid'?'success':'outline-secondary'} onClick={()=>setMode('grid')}>Сетка слогов</Button></ButtonGroup>{mode==='grid'&&<Button size="sm" variant={showRhymes?'success':'outline-secondary'} onClick={()=>setShowRhymes(v=>!v)} aria-pressed={showRhymes}>Рифмы: {showRhymes?'вкл.':'выкл.'}</Button>}<Button size="sm" variant="outline-secondary" onClick={autoStress} disabled={processing}>{processing?'Расставляем…':'✦ Расставить автоматически'}</Button>{mode==='text'&&<Button size="sm" variant="outline-secondary" onMouseDown={e=>e.preventDefault()} onClick={mark}>Ударение <kbd>Ctrl</kbd> + <kbd>Enter</kbd></Button>}</div>{mode==='text'?<><div className="hint">Поставьте курсор после гласной и нажмите кнопку или Ctrl + Enter. Повторное нажатие снимает ударение. Выбор применяется ко всем таким же словам в этом стихе.</div><div className="writing"><textarea ref={area} value={poem.body} onChange={editBody} onBlur={finishWord} onKeyDown={e=>{if(e.ctrlKey&&!e.altKey&&!e.metaKey&&e.key==='Enter'){e.preventDefault();mark()}}} onScroll={e=>{if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop}} aria-label="Текст стихотворения" wrap="off" spellCheck="true" placeholder={'Начните писать здесь...\n\nКаждая история начинается с первой строки.'}/><div ref={gutter} className="gutter" aria-label="Количество слогов в строках">{lines.map((l,i)=><div key={i} title={`Строка ${i+1}: ${count(l)} слогов`}>{l.trim()?count(l):''}</div>)}</div></div></>:<><div className="hint">Каждая клетка — слог. Ударные слоги выделены зелёным. Для редактирования вернитесь в «Текст». {showRhymes&&'Рифмы внутри строк и на их концах определяются приблизительно; проверьте ударения.'}</div>{showRhymes&&<div className="rhyme-analysis"><div className="rhyme-model-status" role="status">{rhymeStatus}</div><div className="rhyme-legend" aria-live="polite">{rhymeAnalysis.groups.length?rhymeAnalysis.groups.map(group=><span key={group.number}><i style={{background:group.color}}/>Группа {group.number}</span>):<span>Рифмы не найдены. Для многосложных слов нужны ударения.</span>}</div>{rhymeAnalysis.schemes.map((s,i)=><div key={i}>Строки {s.from}–{s.to}: {s.name} рифмовка.</div>)}{rhymeAnalysis.limited&&<div>Анализ ограничен первыми 350 ударными словами и сочетаниями.</div>}{rhymeAnalysis.edges.length>0&&<details><summary>Показать найденные пары и виды рифм ({rhymeAnalysis.edges.length})</summary><ul>{rhymeAnalysis.edges.slice(0,100).map((edge,i)=>{const a=rhymeAnalysis.nodes[edge.a],b=rhymeAnalysis.nodes[edge.b];return <li key={i}>«{a.term}» (стр. {a.lineIndex+1}) — «{b.term}» (стр. {b.lineIndex+1}): {a.kind} / {b.kind}; {edge.type}; {edge.rich}{edge.compound?'; возможная составная':''}{edge.identical?'; повтор слова — омонимию нужно проверить по смыслу':''}</li>})}</ul>{rhymeAnalysis.edges.length>100&&<span>Показаны первые 100 пар.</span>}</details>}<div>Омонимическую рифму автоматически подтвердить нельзя: различие смыслов нужно проверить вручную. Группы могут объединять неточные совпадения по цепочке.</div></div>}<div className="grid-view"><div className="grid-scroll" aria-label="Сетка слогов"><div className="grid-rows">{lines.map((line,i)=><div className="grid-line" key={i}><span className="line-number">{i+1}</span><div className="cells">{lineCells(line).map((cell,j)=>{const group=rhymeAnalysis?.cellGroups[i].get(j);return <SyllableCell key={j} text={cell} rhyme={group}/>})}{!count(line)&&<span className="empty-line">{line||'—'}</span>}</div></div>)}</div></div><div className="grid-counts" aria-label="Количество слогов в строках">{lines.map((line,i)=><div className="grid-count" key={i}>{line.trim()?count(line):''}</div>)}</div></div></>}<div className="notice" aria-live="polite">{notice}</div><div className="editor-bottom"><span>{poem.body.trim()?poem.body.trim().split(/\s+/).length:0} слов · {lines.filter(line=>line.trim()).length} строк</span><span>Пишите в своём ритме ✦</span></div></section></div><footer>Создано для ваших слов <span>✳</span></footer></main><dialog ref={driveDialog} className="drive-dialog" onClose={()=>setDriveOpen(false)} aria-labelledby="drive-dialog-title"><div className="drive-dialog-top"><h2 id="drive-dialog-title">Синхронизация</h2><button className="dialog-close" onClick={()=>setDriveOpen(false)} aria-label="Закрыть">×</button></div><DriveSync poems={poems} setPoems={setPoems}/></dialog></>}

createRoot(document.getElementById('root')).render(<App/>);
