import React, {useEffect, useRef, useState} from 'react';
import {Button, Form} from 'react-bootstrap';
import './drive.css';

// Embedded previews can deny localStorage; keep the UI usable in that case.
const fallbackStore = new Map();
const storage = {
  getItem(key) { try { return localStorage.getItem(key) } catch { return fallbackStore.get(key) ?? null } },
  setItem(key, value) { try { localStorage.setItem(key, value) } catch { fallbackStore.set(key, value) } },
};
const CLIENT_KEY='stroka-google-client-id', BASE_KEY='stroka-drive-baseline-v1';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const FILE='stroka-poems-v1.json';
const snapshot=poems=>JSON.stringify(poems);
const isEmpty=poems=>poems.length===1 && !poems[0].title.trim() && !poems[0].body.trim() && !Object.keys(poems[0].stressChoices||{}).length;
function baseline(){try{return JSON.parse(storage.getItem(BASE_KEY))}catch{return null}}
function validate(data){if(data?.version!==1||!Array.isArray(data.poems)||!data.poems.length||data.poems.some(p=>!p||typeof p.id!=='string'||typeof p.title!=='string'||typeof p.body!=='string'))throw new Error('Неверный формат файла на Google Диске');return data.poems}
async function api(path,token,opts={}){const response=await fetch(path,{...opts,headers:{...opts.headers,Authorization:`Bearer ${token}`}});if(!response.ok){if(response.status===401)throw new Error('Срок входа истёк. Войдите в Google снова.');throw new Error(`Ошибка Google Диска (${response.status})`)}return response.status===204?null:response.json()}
async function readCloud(token){const query=new URLSearchParams({spaces:'appDataFolder',q:`name = '${FILE}' and trashed = false`,fields:'files(id,name)',pageSize:'20'});const result=await api(`https://www.googleapis.com/drive/v3/files?${query}`,token);if(result.files.length>1)throw new Error('На Диске найдено несколько файлов синхронизации. Автоматическая запись остановлена.');if(!result.files.length)return null;const id=result.files[0].id;const json=await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,token);return {id,poems:validate(json)}}
async function writeCloud(token,id,poems){const content=JSON.stringify({version:1,poems});if(id){await api(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`,token,{method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:content});return id}const boundary='stroka_'+Math.random().toString(36).slice(2);const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:FILE,parents:['appDataFolder']})}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;const result=await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',token,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});return result.id}
export default function DriveSync({poems,setPoems}){
 const [client,setClient]=useState(()=>storage.getItem(CLIENT_KEY)||'');const [editing,setEditing]=useState(!storage.getItem(CLIENT_KEY));const [connected,setConnected]=useState(false);const [message,setMessage]=useState('Не подключён');const [conflict,setConflict]=useState(false);const [busy,setBusy]=useState(false);const token=useRef(null),latest=useRef(poems),locked=useRef(false),paused=useRef(false),timer=useRef(null);latest.current=poems;
 function saveBase(id,data){storage.setItem(BASE_KEY,JSON.stringify({id,data:snapshot(data)}))}
 async function sync(force){if(!token.current||locked.current||(!force&&paused.current))return;locked.current=true;setBusy(true);setMessage('Синхронизация…');try{
  const currentToken=token.current;const cloud=await readCloud(currentToken);if(currentToken!==token.current)return;
  const current=latest.current,local=snapshot(current);const base=baseline();
  if(!cloud){const id=await writeCloud(currentToken,null,current);if(currentToken!==token.current)return;saveBase(id,current);paused.current=false;setConflict(false);setMessage('Синхронизировано');return}
  const remote=snapshot(cloud.poems),common=base?.id===cloud.id?base.data:null;
  if(local===remote){saveBase(cloud.id,current);paused.current=false;setConflict(false);setMessage('Синхронизировано');return}
  const canPull=(common!==null&&local===common)||(common===null&&isEmpty(current));
  const canPush=(common!==null&&remote===common);
  if(force==='pull'||(!force&&canPull)){
    if(snapshot(latest.current)!==local){setMessage('Локальный текст изменился — повторяем синхронизацию');return}
    saveBase(cloud.id,cloud.poems);setPoems(cloud.poems);paused.current=false;setConflict(false);setMessage('Загружено с Google Диска');return;
  }
  if(force==='push'||(!force&&canPush)){
    await writeCloud(currentToken,cloud.id,current);if(currentToken!==token.current)return;saveBase(cloud.id,current);paused.current=false;setConflict(false);setMessage('Синхронизировано');return;
  }
  paused.current=true;setConflict(true);setMessage('Локальная и облачная версии различаются. Выберите, какую сохранить.');
 }catch(e){console.error(e);if(e.message?.includes('Срок входа истёк')){token.current=null;setConnected(false)}setMessage(e.message||'Не удалось синхронизировать');}finally{locked.current=false;setBusy(false)}}
 const syncRef=useRef(sync);syncRef.current=sync;
 useEffect(()=>{if(!connected||conflict)return;clearTimeout(timer.current);timer.current=setTimeout(()=>syncRef.current(),1200);return()=>clearTimeout(timer.current)},[poems,connected,conflict]);
 useEffect(()=>{if(!connected)return;const id=setInterval(()=>syncRef.current(),30000);return()=>clearInterval(id)},[connected]);
 function connect(){const id=client.trim();if(!id){setMessage('Укажите OAuth Client ID.');setEditing(true);return}if(!window.google?.accounts?.oauth2){setMessage('Не удалось загрузить Google Identity Services. Проверьте доступ к сети.');return}try{storage.setItem(CLIENT_KEY,id);const tc=window.google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:response=>{if(response.error){setMessage('Вход отменён или завершился ошибкой.');return}token.current=response.access_token;paused.current=false;setConflict(false);setConnected(true);setEditing(false);setMessage('Подключено, проверяем данные…');syncRef.current()},error_callback:()=>setMessage('Окно входа закрыто или недоступно.')});tc.requestAccessToken()}catch(e){setMessage('Не удалось начать вход в Google: '+e.message)}}
 function disconnect(){if(token.current&&window.google?.accounts?.oauth2)window.google.accounts.oauth2.revoke(token.current,()=>{});token.current=null;paused.current=false;setConnected(false);setConflict(false);setMessage('Не подключён')}
 return <section className="drive-panel" aria-label="Синхронизация с Google Диском"><div className="drive-heading"><div><div className="small-label">ОБЛАЧНОЕ ХРАНЕНИЕ</div><h2>Google Диск</h2><p>{message}</p></div><div className="drive-actions">{connected?<><Button size="sm" variant="outline-secondary" onClick={()=>sync()} disabled={busy||conflict}>↻ Проверить</Button><Button size="sm" variant="outline-secondary" onClick={disconnect}>Отключить</Button></>:<Button size="sm" variant="success" onClick={connect}>Подключить Google Диск</Button>}</div></div>{!connected&&<><button className="drive-settings" onClick={()=>setEditing(!editing)}>{editing?'Скрыть настройки':'Настроить OAuth Client ID'}</button>{editing&&<div className="drive-config"><Form.Label htmlFor="client-id">Google OAuth Client ID</Form.Label><Form.Control id="client-id" size="sm" value={client} onChange={e=>setClient(e.target.value)} placeholder="…apps.googleusercontent.com"/><small>Нужен OAuth-клиент типа «Веб-приложение» с адресом этого сайта в разрешённых источниках JavaScript. Текущий источник: <code>{window.location.origin}</code>. Инструкция — в README.</small></div>}</>}{conflict&&<div className="conflict"><strong>Обнаружен конфликт</strong><p>Автоматическая запись приостановлена. Сначала сохраните важные тексты отдельно: выбранная версия полностью заменит другую.</p><div className="drive-actions"><Button size="sm" variant="outline-secondary" disabled={busy} onClick={()=>{if(confirm('Заменить локальные стихи версией с Google Диска? Локальные изменения будут потеряны.'))sync('pull')}}>Взять версию с Диска</Button><Button size="sm" variant="outline-secondary" disabled={busy} onClick={()=>{if(confirm('Заменить стихи на Google Диске локальной версией? Облачные изменения будут потеряны.'))sync('push')}}>Оставить локальную версию</Button></div></div>}</section>
}
