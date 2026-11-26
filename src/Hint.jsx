import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

// A real button works with touch and keyboard; the portal avoids scroll clipping.
export default function Hint({label,children}){
 const [open,setOpen]=useState(false), [pinned,setPinned]=useState(false),[position,setPosition]=useState({left:12,top:12,width:260});
 const anchor=useRef(null),panel=useRef(null),id=useId();
 useLayoutEffect(()=>{if(!open)return;function place(){const r=anchor.current?.getBoundingClientRect();if(!r)return;const width=Math.min(300,window.innerWidth-24),h=panel.current?.offsetHeight||100,left=Math.max(12,Math.min(window.innerWidth-width-12,r.left+r.width/2-width/2));const top=r.top>=h+12?r.top-h-8:Math.min(window.innerHeight-h-8,r.bottom+8);setPosition({left,top:Math.max(8,top),width})}place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}},[open,children]);
 useEffect(()=>{if(!open)return;function outside(e){if(!anchor.current?.contains(e.target)){setOpen(false);setPinned(false)}}function key(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);setPinned(false);anchor.current?.blur()}}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true)}},[open]);
 return <><button ref={anchor} type="button" className="hint-button" aria-label={label} aria-describedby={open?id:undefined} aria-expanded={open} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(!pinned)setOpen(false)}} onFocus={()=>setOpen(true)} onBlur={()=>{if(!pinned)setOpen(false)}} onClick={()=>{if(pinned){setPinned(false);setOpen(false)}else{setPinned(true);setOpen(true)}}}>?</button>{open&&createPortal(<div ref={panel} id={id} role="tooltip" className="hint-popover" style={{left:position.left,top:position.top,width:position.width}}>{children}</div>,document.fullscreenElement||document.body)}</>
}
