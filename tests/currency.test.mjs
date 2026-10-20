import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCurrency, normalizeCurrencyCode, inferCurrencyFromText } from '../src/lib/currency.ts';

test('unqualified speech and currency symbols always use HKD, even when the AI guesses another currency',()=>{
 for(const input of ['今天花了30块','午饭12.50元','地铁¥12.8','消费￥40','晚饭$50','买东西€20','车费£8','票价円500','午饭30']){
  for(const guess of ['CNY','JPY','USD',null])assert.equal(resolveCurrency(guess,input),'HKD',input);
 }
});
test('explicit currency names and codes override incorrect AI guesses',()=>{
 for(const [input,expected]of [['午饭30人民币','CNY'],['RMB 30','CNY'],['支付20CNY','CNY'],['便当500日元','JPY'],['JPY500','JPY'],['消费10美元','USD'],['交通12.8港币','HKD'],['晚饭20欧元','EUR']]){
  assert.equal(resolveCurrency('HKD',input),expected,input);
 }
 assert.equal(resolveCurrency('HKD','人民币30，八达通付款'),'CNY');
});
test('multiple bills retain distinct explicit currencies rather than all inheriting the first match',()=>{
 const input='地铁12.8块，午饭30人民币，晚饭500日元';
 assert.equal(resolveCurrency('HKD',input,true),'HKD');
 assert.equal(resolveCurrency('CNY',input,true),'CNY');
 assert.equal(resolveCurrency('JPY',input,true),'JPY');
 assert.equal(resolveCurrency('USD',input,true),'HKD');
});
test('normalization retains explicit ISO codes and treats standalone symbols as ambiguous',()=>{
 assert.equal(normalizeCurrencyCode('rmb'),'CNY');assert.equal(normalizeCurrencyCode('日元'),'JPY');
 for(const symbol of ['¥','￥','$','元','块'])assert.equal(normalizeCurrencyCode(symbol),'HKD');
 assert.equal(inferCurrencyFromText('买鲜花FLEUR 20块'),null);
});
