"use client";
import {useEffect,useRef,useState} from 'react';
import designs from '@/lib/milestoneDesigns.json';
import {milestoneDay,type Milestone} from '@/lib/milestoneRules';
type Achievement=Milestone & {shortTitle:string;verse:string;parts:(string|number)[][];money?:boolean};
function Symbol({ achievement }: { achievement: Achievement }) {
  return <span className="mp-symbol" aria-hidden="true">{achievement.parts.map(([shape,x,y,w,h,rotation], index) => <i key={index} className={`mp-shape-${shape}`} style={{ left: `${x}%`, top: `${y}%`, width: w ? `${w}%` : "1px", height: h ? `${h}%` : "1px", transform: `rotate(${rotation}deg)` }} />)}</span>;
}

function MiniCard({ achievement, onClick }: { achievement: Achievement; onClick: () => void }) {
  return <button type="button" className={`mp-mini${achievement.money ? " mp-money" : ""}`} onClick={onClick} aria-label={`查看${achievement.title}`}>
    <Symbol achievement={achievement} />
    <span className="mp-mini-value">{achievement.value}<small>{achievement.unit}</small></span>
    <span className="mp-mini-title">{achievement.shortTitle}</span>
  </button>;
}


export function Milestones({userId,tab,revision}:{userId:string;tab:string;revision:number}) {
 const [cards,setCards]=useState<Achievement[]>([]),[selected,setSelected]=useState<Achievement|null>(null),[gallery,setGallery]=useState(false);
 const dialogRef=useRef<HTMLDialogElement>(null);const modalOpen=!!selected||gallery;
 useEffect(()=>{let stopped=false;let timers:ReturnType<typeof setTimeout>[]=[];const controller=new AbortController();
 const load=()=>{if(document.visibilityState!=='visible')return;fetch('/api/milestones',{signal:controller.signal,priority:'low'}).then(r=>r.ok?r.json():null).then((items:Milestone[]|null)=>{if(!items||stopped)return;setCards(items.map(item=>{const design=designs.find(d=>d.id===item.template)!;return {...item,shortTitle:item.title.replace(/ [\d,]+.*$/,''),verse:design?.verse||'纹理向深处生长。',parts:design?.parts||designs[0].parts,money:item.unit==='HKD'};}));}).catch(()=>{});};
 timers=[setTimeout(load,600),setTimeout(load,3500)];window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
 return()=>{stopped=true;controller.abort();timers.forEach(clearTimeout);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};},[userId,revision]);
 useEffect(()=>{const d=dialogRef.current;if(!d)return;if(modalOpen&&!d.open)d.showModal();if(!modalOpen&&d.open)d.close();if(!modalOpen)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[modalOpen]);
 const close=()=>{setSelected(null);setGallery(false);};const openCard=(card:Achievement)=>{setGallery(false);setSelected(card);};const openGallery=()=>{setSelected(null);setGallery(true);};
 const today=cards.filter(c=>c.date===milestoneDay(new Date()));const next=selected?today[today.findIndex(c=>c.id===selected.id)+1]:undefined;
 return <>
 {tab==='entry'&&today.length>0?<button type="button" className="mp-today" onClick={()=>openCard(today[0])}><Symbol achievement={today[0]}/><span className="mp-today-copy"><strong>{today[0].title}</strong><small>今日达成{today.length>1?' · 共 '+today.length+' 项':''}</small></span><span className="mp-arrow" aria-hidden="true">↗</span></button>:null}
 {tab==='records'?<section className="ledger-milestones-section" aria-label="里程碑"><div className="mp-section-head"><h2>里程碑</h2><button type="button" className="text-button" onClick={openGallery}>全部 ↗</button></div><div className="mp-recent-grid">{cards.slice(0,3).map(card=><MiniCard key={card.id} achievement={card} onClick={()=>openCard(card)}/>)}</div>{!cards.length?<p className="empty">还没有里程碑</p>:null}</section>:null}
 <dialog ref={dialogRef} className="mp-dialog" aria-label={selected?.title??'全部里程碑'} onCancel={close} onClose={close} onClick={e=>{if(e.target===e.currentTarget)close();}}>
 {selected?<article className="mp-poster"><div className="mp-poster-head"><span className="mp-wordmark">TCCA</span><button type="button" className="mp-close" aria-label="关闭里程碑卡片" onClick={close}>×</button></div><div className="mp-emblem"><Symbol achievement={selected}/></div><div className={'mp-hero'+(selected.money?' mp-money':'')} aria-hidden="true">{selected.value}<small>{selected.unit}</small></div><h2>{selected.title}</h2><p className="mp-verse">{selected.verse}</p><div className="mp-card-date"><span>达成日期</span><time>{selected.date.replaceAll('-','.')}</time></div><div className="mp-poster-footer"><button type="button" className="text-button" onClick={openGallery}>全部里程碑</button>{next?<button type="button" className="text-button" onClick={()=>openCard(next)}>下一个</button>:null}</div></article>:gallery?<section className="mp-gallery"><div className="mp-poster-head"><h2>全部里程碑</h2><button type="button" className="mp-close" aria-label="关闭全部里程碑" onClick={close}>×</button></div><div className="mp-gallery-grid">{cards.map(card=><MiniCard key={card.id} achievement={card} onClick={()=>openCard(card)}/>)}</div>{!cards.length?<p className="empty">还没有里程碑</p>:null}</section>:null}
 </dialog></>;
}
