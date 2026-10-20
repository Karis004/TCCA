import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, getCurrentMonth } from '../src/lib/analytics.ts';

const now = new Date('2026-10-19T08:00:00Z');
const transaction = (date, type, amountCny, overrides = {}) => ({ date, type, amount: amountCny, amountCny, currency: 'CNY', category: type === 'expense' ? '餐饮' : '工资', paymentMethod: '微信', ...overrides });
const data = [
  transaction('2026-07-05', 'income', 10000),
  transaction('2026-07-06', 'expense', 1200, { category: '住房' }),
  transaction('2026-10-02', 'income', 5000),
  transaction('2026-10-03', 'expense', 30),
  transaction('2026-10-04', 'expense', 60, { amount: 65, currency: 'HKD', category: '交通' }),
  transaction('2026-10-05', 'refund', 10),
  transaction('2026-10-06', 'transfer', 2000)
];

test('defaults to the current month and scopes all primary summaries together', () => {
  const result = buildAnalytics(data, undefined, now);
  assert.equal(result.selectedMonth, '2026-10');
  assert.equal(result.totalIncome, 5010);
  assert.equal(result.totalExpense, 90);
  assert.equal(result.balance, 4920);
  assert.equal(result.transactionCount, 5);
  assert.deepEqual(result.byCategory, [{ name: '交通', value: 60 }, { name: '餐饮', value: 30 }]);
  assert.deepEqual(result.byPayment, [{ name: '微信', value: 90 }]);
  assert.equal(result.byCurrency.find(row => row.name === 'HKD').value, 65);
  assert.equal(result.byDay.length, 31);
  assert.equal(result.byDay.reduce((sum, day) => sum + day.expense, 0), 90);
  assert.equal(result.byDay.reduce((sum, day) => sum + day.income, 0), 5010);
});

test('a selected historical month excludes other months in summaries and daily flow', () => {
  const result = buildAnalytics(data, '2026-07', now);
  assert.equal(result.totalIncome, 10000);
  assert.equal(result.totalExpense, 1200);
  assert.equal(result.balance, 8800);
  assert.deepEqual(result.byCategory, [{ name: '住房', value: 1200 }]);
  assert.ok(result.byDay.every(day => day.date.startsWith('2026-07-')));
});

test('empty current and selected months stay empty instead of falling back to old records', () => {
  const current = buildAnalytics(data.slice(0, 2), undefined, now);
  assert.equal(current.selectedMonth, '2026-10');
  assert.equal(current.balance, 0);
  assert.equal(current.transactionCount, 0);
  assert.deepEqual(current.byCategory, []);
  assert.equal(current.byDay.length, 31);
  const empty = buildAnalytics(data, '2026-08', now);
  assert.equal(empty.selectedMonth, '2026-08');
  assert.equal(empty.totalExpense, 0);
  assert.equal(empty.transactionCount, 0);
});

test('all time includes both July and October with distinct dates and zero-filled gaps', () => {
  const result = buildAnalytics(data, 'all', now);
  assert.equal(result.totalIncome, 15010);
  assert.equal(result.totalExpense, 1290);
  assert.equal(result.transactionCount, 7);
  assert.equal(result.byDay[0].date, '2026-07-05');
  assert.equal(result.byDay.at(-1).date, '2026-10-06');
  assert.deepEqual(result.byDay.find(day => day.date === '2026-08-01'), { date: '2026-08-01', expense: 0, income: 0 });
});

test('monthly net flow is independent of the filter, fills missing months, and excludes transfers', () => {
  const expected = [{ name: '2026-07', value: 8800 }, { name: '2026-08', value: 0 }, { name: '2026-09', value: 0 }, { name: '2026-10', value: 4920 }];
  for (const period of ['2026-07', '2026-08', '2026-10', 'all']) {
    assert.deepEqual(buildAnalytics(data, period, now).byMonth, expected);
  }
});

test('supports empty history and leap-year February', () => {
  assert.equal(buildAnalytics([], '2024-02', now).byDay.length, 29);
  const result = buildAnalytics([], 'all', now);
  assert.deepEqual(result.byMonth, []);
  assert.deepEqual(result.byDay, []);
  assert.equal(result.balance, 0);
});

test('retains records beyond 1000 and sums money without floating point drift', () => {
  const many = Array.from({ length: 1201 }, () => transaction('2026-10-01', 'expense', 0.1));
  many.push(transaction('2026-10-01', 'expense', 0.2));
  const result = buildAnalytics(many, '2026-10', now);
  assert.equal(result.transactionCount, 1202);
  assert.equal(result.totalExpense, 120.3);
  assert.equal(result.byCategory[0].value, 120.3);
  assert.equal(result.byDay[0].expense, 120.3);
});

test('current month uses Hong Kong time across a UTC month boundary', () => {
  assert.equal(getCurrentMonth(new Date('2026-09-30T16:30:00Z')), '2026-10');
  assert.equal(buildAnalytics(data, undefined, new Date('2026-09-30T16:30:00Z')).selectedMonth, '2026-10');
});

test('HKD view preserves original HKD amounts and converts all other source amounts consistently', () => {
  const mixed = [
    transaction('2026-10-01', 'expense', 38.4, {amount:48,currency:'HKD'}),
    transaction('2026-10-01', 'expense', 100),
    transaction('2026-10-02', 'expense', 70, {amount:10,currency:'USD'}),
    transaction('2026-10-02', 'income', 800, {amount:1000,currency:'HKD'}),
    transaction('2026-10-03', 'refund', 4, {amount:5,currency:'HKD'})
  ];
  const hkd=buildAnalytics(mixed,'2026-10',now,{currency:'HKD',rates:{CNY:1.25,USD:7.8}});
  assert.equal(hkd.displayCurrency,'HKD');assert.equal(hkd.totalExpense,251);
  assert.equal(hkd.totalIncome,1005);assert.equal(hkd.balance,754);
  assert.equal(hkd.byDay.find(day=>day.date==='2026-10-01').expense,173);
  assert.equal(hkd.byCategory[0].value,251);assert.equal(hkd.byPayment[0].value,251);
  assert.equal(hkd.byMonth.find(month=>month.name==='2026-10').value,754);
  const cny=buildAnalytics(mixed,'2026-10',now,{currency:'CNY',rates:{}});
  assert.equal(cny.totalExpense,208.4);assert.equal(cny.totalIncome,804);
  assert.deepEqual(hkd.byCurrency,cny.byCurrency);
  assert.equal(mixed[0].amount,48);assert.equal(mixed[0].amountCny,38.4);
});

test('HKD conversion keeps the month filter independent from the monthly chart, including empty months',()=>{
  const options={currency:'HKD',rates:{CNY:1.25}};
  const all=buildAnalytics(data,'all',now,options);
  const empty=buildAnalytics(data,'2026-08',now,options);
  assert.equal(empty.totalExpense,0);assert.equal(empty.balance,0);
  assert.deepEqual(empty.byMonth,all.byMonth);
  assert.equal(buildAnalytics(data,'2026-10',now,options).totalExpense,102.5);
});

test('missing conversion rates fail explicitly instead of silently labelling CNY as HKD',()=>{
  assert.throws(()=>buildAnalytics([transaction('2026-10-01','expense',30)],'all',now,{currency:'HKD',rates:{}}),/Missing exchange rate/);
  assert.equal(buildAnalytics([transaction('2026-10-01','expense',20,{amount:25,currency:'HKD'})],'all',now,{currency:'HKD',rates:{}}).totalExpense,25);
});
