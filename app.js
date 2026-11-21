const KEY='stroka-poems-v1';
const $=id=>document.getElementById(id);
let poems=[];let active=null;
try {const data=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(data)) poems=data.filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&typeof p.body==='string');} catch(e){}
function make(){return {id:Date.now().toString(36)+Math.random().toString(36).slice(2),title:'',body:'',updated:Date.now()}}
if(!poems.length)poems.push(make());active=poems[0].id;
function save(){try{localStorage.setItem(KEY,JSON.stringify(poems));$('saveStatus').textContent='Сохранено на устройстве'}catch(e){$('saveStatus').textContent='Не удалось сохранить'} }
function renderList(){$('list').replaceChildren();$('count').textContent=poems.length;poems.forEach(p=>{const b=document.createElement('button');b.className='poem'+(p.id===active?' active':'');const title=document.createElement('strong');title.textContent=p.title.trim()||'Без названия';const excerpt=document.createElement('span');excerpt.textContent=p.body.trim().replace(/\s+/g,' ').slice(0,45)||'Новый стих';b.append(title,excerpt);b.onclick=()=>{active=p.id;render()};$('list').append(b)})}
function stats(){const text=$('body').value.trim();const words=text?text.split(/\s+/).length:0;const lines=text?$('body').value.split('\n').length:0;$('stats').textContent=`${words} слов · ${lines} строк`}
function render(){const p=poems.find(x=>x.id===active);$('title').value=p.title;$('body').value=p.body;renderList();stats()}
function update(){const p=poems.find(x=>x.id===active);p.title=$('title').value;p.body=$('body').value;p.updated=Date.now();save();renderList();stats()}
$('title').addEventListener('input',update);$('body').addEventListener('input',update);
$('add').onclick=()=>{const p=make();poems.unshift(p);active=p.id;save();render();$('title').focus()};
$('delete').onclick=()=>{if(!confirm('Удалить это стихотворение? Это действие нельзя отменить.'))return;poems=poems.filter(p=>p.id!==active);if(!poems.length)poems.push(make());active=poems[0].id;save();render()};
$('export').onclick=()=>{const p=poems.find(x=>x.id===active);const blob=new Blob([(p.title.trim()?p.title.trim()+'\n\n':'')+p.body],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(p.title.trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'стихотворение')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};save();render();
