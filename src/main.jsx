import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button, ButtonGroup, Form} from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import {syllabify} from 'syllables-ru';

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
function App(){const [poems,setPoems]=useState(readPoems);const [id,setId]=useState(()=>poems[0].id);const [mode,setMode]=useState('text');const [status,setStatus]=useState('Сохранено на устройстве');const [notice,setNotice]=useState('');const [processing,setProcessing]=useState(false);const area=useRef(null);const gutter=useRef(null);const latest=useRef(poems);latest.current=poems;const poem=poems.find(p=>p.id===id)||poems[0];const lines=poem.body.split('\n');
useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(poems));setStatus('Сохранено на устройстве')}catch{setStatus('Не удалось сохранить')}},[poems]);
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
return <><header><a className="brand" href="#">✳ <span>строка</span></a><div className="header-right"><span>{status}</span><Button variant="outline-secondary" size="sm" onClick={download}>↓ Скачать .txt</Button></div></header><main><div className="intro"><div><div className="eyebrow">ВАШЕ ПРОСТРАНСТВО ДЛЯ ТВОРЧЕСТВА</div><h1>Пусть слова<br/><em>найдут свой ритм.</em></h1><p>Место для мыслей, образов и строк, которые хочется сохранить.</p></div><div className="decoration">✳</div></div><div className="workspace"><aside><div className="aside-head"><div><span className="small-label">КОЛЛЕКЦИЯ</span><h2>Мои стихи <span>{poems.length}</span></h2></div><Button variant="light" className="add" onClick={add} aria-label="Новый стих">＋</Button></div><div className="poem-list">{poems.map(p=><button key={p.id} className={'poem '+(p.id===poem.id?'active':'')} onClick={()=>setId(p.id)}><strong>{p.title.trim()||'Без названия'}</strong><span>{p.body.trim().replace(/\s+/g,' ').slice(0,45)||'Новый стих'}</span></button>)}</div><div className="aside-bottom">✧ <span>Каждая строка имеет значение.</span></div></aside><section className="editor"><div className="editor-top"><span><i/> РЕДАКТОР</span><button className="text-button" onClick={remove}>Удалить стих</button></div><Form.Control className="title-input" value={poem.title} maxLength={120} onChange={e=>change('title',e.target.value)} aria-label="Название стихотворения" placeholder="Название стихотворения"/><div className="toolbar"><ButtonGroup size="sm" aria-label="Вид отображения"><Button variant={mode==='text'?'success':'outline-secondary'} onClick={()=>setMode('text')}>Текст</Button><Button variant={mode==='grid'?'success':'outline-secondary'} onClick={()=>setMode('grid')}>Сетка слогов</Button></ButtonGroup><Button size="sm" variant="outline-secondary" onClick={autoStress} disabled={processing}>{processing?'Расставляем…':'✦ Расставить автоматически'}</Button>{mode==='text'&&<Button size="sm" variant="outline-secondary" onMouseDown={e=>e.preventDefault()} onClick={mark}>Ударение <kbd>Ctrl</kbd> + <kbd>Enter</kbd></Button>}</div>{mode==='text'?<><div className="hint">Поставьте курсор после гласной и нажмите кнопку или Ctrl + Enter. Повторное нажатие снимает ударение. Выбор применяется ко всем таким же словам в этом стихе.</div><div className="writing"><textarea ref={area} value={poem.body} onChange={editBody} onBlur={finishWord} onKeyDown={e=>{if(e.ctrlKey&&!e.altKey&&!e.metaKey&&e.key==='Enter'){e.preventDefault();mark()}}} onScroll={e=>{if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop}} aria-label="Текст стихотворения" wrap="off" spellCheck="true" placeholder={'Начните писать здесь...\n\nКаждая история начинается с первой строки.'}/><div ref={gutter} className="gutter" aria-label="Количество слогов в строках">{lines.map((l,i)=><div key={i} title={`Строка ${i+1}: ${count(l)} слогов`}>{l.trim()?count(l):''}</div>)}</div></div></>:<><div className="hint">Каждая клетка — слог. Ударные слоги выделены зелёным. Для редактирования вернитесь в «Текст».</div><div className="grid-view">{lines.map((line,i)=><div className="grid-line" key={i}><span className="line-number">{i+1}</span><div className="cells">{lineCells(line).map((cell,j)=><div key={j} className={'cell '+(cell.includes(acute)?'stressed':'')}>{cell}</div>)}{!count(line)&&<span className="empty-line">{line||'—'}</span>}</div><span className="grid-count">{line.trim()?count(line):''}</span></div>)}</div></>}<div className="notice" aria-live="polite">{notice}</div><div className="editor-bottom"><span>{poem.body.trim()?poem.body.trim().split(/\s+/).length:0} слов · {lines.filter(line=>line.trim()).length} строк</span><span>Пишите в своём ритме ✦</span></div></section></div><footer>Создано для ваших слов <span>✳</span></footer></main></>}

createRoot(document.getElementById('root')).render(<App/>);
