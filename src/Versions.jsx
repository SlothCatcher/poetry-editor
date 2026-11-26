import React,{useEffect,useMemo,useRef,useState} from 'react';
import {diffWordsWithSpace} from 'diff';
import {Button,Form} from 'react-bootstrap';
import './versions.css';

function stamp(value){const date=new Date(value);return Number.isNaN(date.getTime())?'Дата неизвестна':new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(date)}
function Highlight({oldText,newText,side}){
 const changes=useMemo(()=>diffWordsWithSpace(oldText,newText),[oldText,newText]);
 return <>{changes.map((part,i)=>{if(side==='old'&&part.added||side==='new'&&part.removed)return null;const changed=side==='old'?part.removed:part.added;return changed?<mark key={i} className={side==='old'?'version-removed':'version-added'}>{part.value}</mark>:<React.Fragment key={i}>{part.value}</React.Fragment>})}</>;
}
export default function Versions({poem,onClose,onDelete}){
 const dialog=useRef(null),versions=Array.isArray(poem?.versions)?poem.versions:[];
 const [older,setOlder]=useState(()=>versions[0]?.id||'current'),[newer,setNewer]=useState('current'),[deleting,setDeleting]=useState(null);
 useEffect(()=>{dialog.current?.showModal()},[]);
 useEffect(()=>{if(!poem)dialog.current?.close()},[poem]);
 if(!poem)return <dialog ref={dialog} onClose={onClose}/>;
 const get=id=>id==='current'?poem:versions.find(v=>v.id===id)||poem;
 const old=get(older),current=get(newer);
 const options=<><option value="current">Текущая версия</option>{versions.map((v,i)=><option key={v.id} value={v.id}>Версия {versions.length-i} · {stamp(v.createdAt)}</option>)}</>;
 return <dialog ref={dialog} className="versions-dialog" aria-labelledby="versions-title" onClose={onClose}>
  <div className="versions-header"><div><h2 id="versions-title">Версии стихотворения</h2><p>{poem.title.trim()||'Без названия'}</p></div><button className="spell-close" type="button" aria-label="Закрыть версии" title="Закрыть" onClick={()=>dialog.current?.close()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg></button></div>
  <div className="versions-layout"><section className="versions-list" aria-label="Сохранённые версии"><h3>Сохранённые версии</h3>{!versions.length?<p className="versions-empty">Сохранённых версий пока нет. Используйте кнопку сохранения версии в редакторе.</p>:versions.map((v,i)=><div className="version-item" key={v.id}><button type="button" className={'version-pick'+(older===v.id?' active':'')} onClick={()=>setOlder(v.id)} aria-label={`Выбрать версию ${versions.length-i} от ${stamp(v.createdAt)}`}><strong>Версия {versions.length-i}</strong><span>{stamp(v.createdAt)}</span></button><button type="button" className="version-delete" aria-label={`Удалить версию ${versions.length-i}`} title="Удалить версию" onClick={()=>setDeleting(v.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg></button>{deleting===v.id&&<div className="version-confirm">Удалить эту версию?<div><Button size="sm" variant="outline-danger" onClick={()=>{onDelete(v.id);if(older===v.id)setOlder('current');if(newer===v.id)setNewer('current');setDeleting(null)}}>Удалить</Button><Button size="sm" variant="outline-secondary" onClick={()=>setDeleting(null)}>Отмена</Button></div></div>}</div>)}</section>
  {versions.length>0&&<section className="version-comparison" aria-label="Сравнение версий"><div className="versions-legend"><span className="removed-key">Удалено</span><span className="added-key">Добавлено</span></div><div className="version-columns"><div className="version-column"><label>Старая версия<Form.Select size="sm" aria-label="Старая версия" value={older} onChange={e=>setOlder(e.target.value)}>{options}</Form.Select></label><div className="version-document"><strong><Highlight oldText={old.title} newText={current.title} side="old"/></strong><pre><Highlight oldText={old.body} newText={current.body} side="old"/></pre></div></div><div className="version-column"><label>Новая версия<Form.Select size="sm" aria-label="Новая версия" value={newer} onChange={e=>setNewer(e.target.value)}>{options}</Form.Select></label><div className="version-document"><strong><Highlight oldText={old.title} newText={current.title} side="new"/></strong><pre><Highlight oldText={old.body} newText={current.body} side="new"/></pre></div></div></div></section>}</div>
 </dialog>
}
