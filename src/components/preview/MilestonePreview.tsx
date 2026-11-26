"use client";

import { useEffect, useRef, useState } from "react";

type Part = [string, number, number, number, number, number];
type Achievement = {
  id: string;
  value: string;
  unit: string;
  title: string;
  shortTitle: string;
  verse: string;
  date: string;
  money?: boolean;
  parts: Part[];
};

const achievements: Achievement[] = [
  { id: "active-100", value: "100", unit: "天", title: "累计记账 100 天", shortTitle: "累计记账", verse: "稀疏的星，连成了径。", date: "2026.11.26", parts: [["ring",7,29,42,42,0],["ring",29,29,42,42,0],["ring",51,29,42,42,0]] },
  { id: "count-1000", value: "1,000", unit: "笔", title: "累计记录 1,000 笔", shortTitle: "累计记录", verse: "细屑沉下，山形初现。", date: "2026.11.26", parts: [["corner",14,14,43,43,0],["corner",31,31,43,43,0],["corner",48,48,43,43,0],["solid",51,11,7,7,0]] },
  { id: "expense-50000", value: "50,000", unit: "HKD", title: "累计支出 50,000 HKD", shortTitle: "累计支出", verse: "万物流转，各留一隅。", date: "2026.11.18", money: true, parts: [["square",24,24,52,52,45],["square",39,39,22,22,45]] },
  { id: "elapsed-1y", value: "1", unit: "周年", title: "记账满 1 周年", shortTitle: "记账时间", verse: "一轮无声，万象有痕。", date: "2026.11.12", parts: [["ring",16,10,68,68,0],["line",50,78,0,18,0]] },
  { id: "income-100000", value: "100,000", unit: "HKD", title: "累计收入 100,000 HKD", shortTitle: "累计收入", verse: "百川无声，自有来路。", date: "2026.10.30", money: true, parts: [["cup",15,21,70,62,0],["cup",30,21,40,44,0],["line",50,65,0,18,0]] },
  { id: "batch-10", value: "10", unit: "笔", title: "15 分钟内录入 10 笔", shortTitle: "集中录入", verse: "散页归拢，风声渐息。", date: "2026.10.24", parts: [["cup",19,27,62,46,90],["line",27,50,46,0,0]] }
];

const records = [
  { category: "餐饮", merchant: "McDonald's", date: "2026-11-26", payment: "Mox Credit", amount: "45.00", note: "晚饭" },
  { category: "交通", merchant: "港铁", date: "2026-11-26", payment: "八达通", amount: "12.50", note: "下班回家" },
  { category: "餐饮", merchant: "咖啡", date: "2026-11-25", payment: "Mox Credit", amount: "32.00", note: "下午的冰美式" },
  { category: "购物", merchant: "MUJI", date: "2026-11-24", payment: "Mox Credit", amount: "89.00", note: "收纳盒" }
];

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

export function MilestonePreview() {
  const [tab, setTab] = useState<"entry" | "records">("entry");
  const [hasToday, setHasToday] = useState(true);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Achievement | null>(null);
  const [gallery, setGallery] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modalOpen = Boolean(selected || gallery);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modalOpen && !dialog.open) dialog.showModal();
    if (!modalOpen && dialog.open) dialog.close();
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [modalOpen]);

  function close() { setSelected(null); setGallery(false); }
  function openCard(achievement: Achievement) { setGallery(false); setSelected(achievement); }
  function openGallery() { setSelected(null); setGallery(true); }

  const nav = (mobile = false) => <nav className={mobile ? "mobile-tabs" : "tabs desktop-tabs"} aria-label="页面">
    <button type="button" className={`tab${tab === "entry" ? " active" : ""}`} onClick={() => setTab("entry")}>记账</button>
    <button type="button" className="tab" disabled>分析</button>
    <button type="button" className={`tab${tab === "records" ? " active" : ""}`} onClick={() => setTab("records")}>账本</button>
    <button type="button" className="tab" disabled>设置</button>
  </nav>;

  return <div className="milestone-preview">
    <div className="mp-demo-bar"><span>本地演示</span><div className="mp-demo-switch" aria-label="演示当天状态">
      <button type="button" aria-pressed={hasToday} onClick={() => setHasToday(true)}>有里程碑</button>
      <button type="button" aria-pressed={!hasToday} onClick={() => setHasToday(false)}>无里程碑</button>
    </div></div>
    <main className="app-shell">
      <header className="topbar">
        {tab === "entry" ? <div><div className="brand">TCCA</div><div className="tagline">一句话记账</div></div> : <div className="section-topbar"><h1 className="section-title">账本</h1></div>}
        {nav()}
      </header>

      {tab === "entry" ? <>
        {hasToday ? <button type="button" className="mp-today" onClick={() => openCard(achievements[0])} aria-label="查看今日里程碑：累计记账 100 天">
          <Symbol achievement={achievements[0]} />
          <span className="mp-today-copy"><strong>累计记账 100 天</strong><small>今日达成 · 共 2 项</small></span>
          <span className="mp-arrow" aria-hidden="true">↗</span>
        </button> : null}
        <div className="entry-grid">
          <section className="command-panel">
            <div className="panel-head"><span>AI 识别</span><button className="text-button" type="button" disabled>手动录入</button></div>
            <textarea className="command-input" aria-label="记账文字" value={text} onChange={event => setText(event.target.value)} />
            <div className="action-row"><button className="text-button" type="button" disabled>暂存文字</button><button className="primary-button" type="button" disabled>识别账单</button></div>
          </section>
          <section className="panel preset-panel"><div className="panel-head"><span>账单预设</span><span>0 条</span></div><p className="empty">暂无预设</p></section>
          <section className="panel pending-panel"><div className="panel-head"><span>待识别</span><span>0 条</span></div><p className="empty">暂无待识别内容</p></section>
        </div>
      </> : <div className="mp-book">
        <section className="mp-achievements" aria-label="最近里程碑">
          <div className="mp-section-head"><h2>里程碑</h2><button type="button" className="text-button" onClick={openGallery}>全部 <span aria-hidden="true">↗</span></button></div>
          <div className="mp-recent-grid">{achievements.slice(0,3).map(achievement => <MiniCard key={achievement.id} achievement={achievement} onClick={() => openCard(achievement)} />)}</div>
        </section>
        <section className="mp-records records-panel" aria-label="流水">
          <div className="mp-section-head"><h2>流水</h2><span className="mp-section-meta">今年 · 4 条</span></div>
          <div className="records-search-bar"><input className="input" type="search" aria-label="搜索备注或商户" placeholder="搜索备注或商户" value={query} onChange={event => setQuery(event.target.value)} /><button className="text-button" type="button" disabled>筛选</button></div>
          <div className="record-list">{records.filter(record => `${record.category} ${record.merchant} ${record.note}`.includes(query)).map((record,index) => <article className="record-card" key={index}>
            <div className="record-main"><div className="record-title-row"><h3>{record.category}</h3><span>{record.merchant}</span></div><p>{record.date} · {record.payment} · HKD {record.amount}</p><p>{record.note}</p></div>
            <div className="record-side"><strong>−{record.amount}</strong><div className="record-actions"><button type="button" className="text-button" disabled>编辑</button><button type="button" className="text-button danger-text" disabled>删除</button></div></div>
          </article>)}</div>
        </section>
      </div>}
      {nav(true)}
    </main>

    <dialog ref={dialogRef} className="mp-dialog" aria-label={selected?.title ?? "全部里程碑"} onCancel={close} onClose={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {selected ? <article className="mp-poster">
        <div className="mp-poster-head"><span className="mp-wordmark">TCCA</span><button type="button" className="mp-close" aria-label="关闭里程碑卡片" onClick={close}><span aria-hidden="true">×</span></button></div>
        <div className="mp-emblem"><Symbol achievement={selected} /></div>
        <div className={`mp-hero${selected.money ? " mp-money" : ""}`} aria-hidden="true">{selected.value}<small>{selected.unit}</small></div>
        <h2>{selected.title}</h2><p className="mp-verse">{selected.verse}</p>
        <div className="mp-card-date"><span>达成日期</span><time>{selected.date}</time></div>
        <div className="mp-poster-footer"><button type="button" className="text-button" onClick={openGallery}>全部里程碑</button>{selected.id === achievements[0].id ? <button type="button" className="text-button" onClick={() => openCard(achievements[1])}>下一个</button> : null}</div>
      </article> : gallery ? <section className="mp-gallery">
        <div className="mp-poster-head"><h2>全部里程碑</h2><button type="button" className="mp-close" aria-label="关闭全部里程碑" onClick={close}><span aria-hidden="true">×</span></button></div>
        <div className="mp-gallery-grid">{achievements.map(achievement => <MiniCard key={achievement.id} achievement={achievement} onClick={() => openCard(achievement)} />)}</div>
      </section> : null}
    </dialog>
  </div>;
}
