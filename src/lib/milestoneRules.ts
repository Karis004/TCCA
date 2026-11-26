export type MilestoneRow = { createdAt: string; type: string; category: string; amountHkd: number };
export type Milestone = { id: string; template: string; value: string; unit: string; title: string; date: string };
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" });
export const milestoneDay = (date: Date) => dayFormatter.format(date);
const dayNumber = (day: string) => Date.parse(day + "T00:00:00Z") / 86400000;
export function calculateMilestones(rows: MilestoneRow[], now = new Date()): Milestone[] {
  const data = [...rows].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  if (!data.length) return [];
  const earned = new Map<string,Milestone>();
  function add(id: string, template: string, value: number | string, unit: string, title: string, date: string) {
    if (!earned.has(id)) earned.set(id, { id, template, value: typeof value === "number" ? value.toLocaleString("en-US") : value, unit, title, date });
  }
  const firstDay = milestoneDay(new Date(data[0].createdAt));
  const active = new Set<string>();
  let expense = 0, income = 0, previousDay = firstDay, left15 = 0, left30 = 0;
  const moneyTier = (value: number, expense: boolean) => expense ? (value >= 100000 ? Math.floor(value / 50000) * 50000 : [50000,30000,10000,5000].find(n => value >= n) || 0) : value >= 100000 ? Math.floor(value / 100000) * 100000 : [50000,10000].find(n => value >= n) || 0;
  data.forEach((row,index) => {
    const date = milestoneDay(new Date(row.createdAt)), year = date.slice(0,4), month = date.slice(0,7), count = index + 1;
    if (count === 1 || count === 100 || count % 500 === 0) add(`count-${count}`, `count-${Math.min(count,2000)}`, count,"笔",count === 1 ? "录入第 1 笔账单" : `累计记录 ${count.toLocaleString("en-US")} 笔`,date);
    if (!active.has(date)) {
      active.add(date); const n = active.size;
      if (n === 30 || n % 100 === 0) add(`active-${n}`,`active-${Math.min(n,300)}`,n,"天",`累计记账 ${n} 天`,date);
    }
    if (year > firstDay.slice(0,4)) add(`year-${year}`,"newyear-first",year,"年","新一年的第一笔账单",date);
    if (dayNumber(date) - dayNumber(previousDay) >= 15) add(`return-${year}`,"return-14",14,"天","间隔 14 天后继续记账",date);
    previousDay = date;
    if (row.type === "income") {
      add("first-income","first-income","收入","","在这里记下第一笔收入",date);
      if (/^(工资|薪资|薪酬|薪金)$/.test(row.category)) add("first-salary","first-salary","工资","","在这里记下第一笔工资",date);
      if (/^(奖金|年终奖|花红)$/.test(row.category)) add("first-bonus","first-bonus","奖金","","在这里记下第一笔奖金",date);
    }
    if (row.type === "expense" || row.type === "income") {
      const isExpense = row.type === "expense", before = isExpense ? expense : income;
      if (isExpense) expense += row.amountHkd; else income += row.amountHkd;
      const n = moneyTier(isExpense ? expense : income,isExpense);
      if (n && n > moneyTier(before,isExpense)) {
        const group = isExpense ? "expense" : "income";
        add(`${group}-${n}`,`${group}-${Math.min(n,isExpense ? 200000 : 300000)}`,n,"HKD",`累计${isExpense ? "支出" : "收入"} ${n.toLocaleString("en-US")} HKD`,date);
      }
    }
    const time = Date.parse(row.createdAt);
    while (Date.parse(data[left15].createdAt) < time - 15 * 60000) left15++;
    while (Date.parse(data[left30].createdAt) < time - 30 * 60000) left30++;
    if (index-left30+1 >= 20) { earned.delete(`batch-${month}-10`); add(`batch-${month}-20`,"batch-20",20,"笔","30 分钟内录入 20 笔",date); }
    else if (index-left15+1 >= 10 && !earned.has(`batch-${month}-20`)) add(`batch-${month}-10`,"batch-10",10,"笔","15 分钟内录入 10 笔",date);
  });
  const first = new Date(firstDay + "T00:00:00Z"), today = milestoneDay(now);
  const elapsed: [string,string,number|string,string,Date][] = [
    ["30","elapsed-30",30,"天",new Date(+first + 30*86400000)],
    ["100","elapsed-100",100,"天",new Date(+first + 100*86400000)],
    ["half","elapsed-half","半年","",new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+6,Math.min(first.getUTCDate(),new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+7,0)).getUTCDate())))]
  ];
  for (let y=1;y<=now.getUTCFullYear()-first.getUTCFullYear();y++) elapsed.push([`${y}y`,`elapsed-${Math.min(y,3)}y`,y,"周年",new Date(Date.UTC(first.getUTCFullYear()+y,first.getUTCMonth(),Math.min(first.getUTCDate(),new Date(Date.UTC(first.getUTCFullYear()+y,first.getUTCMonth()+1,0)).getUTCDate())))]);
  elapsed.forEach(([id,template,value,unit,date]) => { const day=date.toISOString().slice(0,10); if(day<=today) add(`elapsed-${id}`,template,value,unit,`记账满 ${value}${unit}`,day); });
  return [...earned.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
