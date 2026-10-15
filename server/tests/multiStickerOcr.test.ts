import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenerativeAI } from '@google/generative-ai';
process.env.GEMINI_API_KEY='test-key';

test('multi-photo OCR preserves bytes, positions, zero and test maximum validation',async()=>{
 const {processMultiStickerOCR,validateStickerReadings}=await import('../src/utils/multiStickerOcr');
 const original=GoogleGenerativeAI.prototype.getGenerativeModel;const bytes=Buffer.from('original photo');
 GoogleGenerativeAI.prototype.getGenerativeModel=((config:any)=>({generateContent:async(parts:any[])=>{
  assert.equal(config.model,'gemini-3.5-flash-lite');assert.equal(parts[1].inlineData.data,bytes.toString('base64'));assert.equal(parts[1].inlineData.mimeType,'image/png');
  return {response:{text:()=>JSON.stringify({stickers:[{x:100,y:200,score:'0'},{x:200,y:200,score:'19/20'},{x:300,y:200,score:'21'},{x:400,y:200,score:'ERROR_UNCERTAIN'}]})}};
 }})) as any;
 try{assert.deepEqual((await processMultiStickerOCR(bytes,'image/png',20)).stickers.map(r=>r.score),['0','19','','']);
 for(const data of [[{x:-1,y:1,score:'2'}],[{x:'100',y:1,score:'2'}],Array.from({length:11},()=>({x:1,y:1,score:'2'})),null]) assert.throws(()=>validateStickerReadings(data,20));
 }finally{GoogleGenerativeAI.prototype.getGenerativeModel=original;}
});
test('multi-photo provider fallback is bounded and explicit uncertainty is not retried',async()=>{
 const {processMultiStickerOCR}=await import('../src/utils/multiStickerOcr');const original=GoogleGenerativeAI.prototype.getGenerativeModel;const models:string[]=[];
 GoogleGenerativeAI.prototype.getGenerativeModel=((config:any)=>({generateContent:async()=>{models.push(config.model);if(models.length===1)throw new Error('Offline');return {response:{text:()=>'{"stickers":[]}'}};}})) as any;
 try{assert.deepEqual(await processMultiStickerOCR(Buffer.from('photo'),'image/jpeg',20),{stickers:[]});assert.deepEqual(models,['gemini-3.5-flash-lite','gemini-3.8-flash']);
 GoogleGenerativeAI.prototype.getGenerativeModel=(()=>({generateContent:()=>new Promise(()=>{})})) as any;
 assert.equal((await processMultiStickerOCR(Buffer.from('photo'),'image/jpeg',20,{timeoutMs:10})).reason,'timeout');
 }finally{GoogleGenerativeAI.prototype.getGenerativeModel=original;}
});

test('a slow primary can win after fallback starts and cancellation stops both attempts',async()=>{
 const {processMultiStickerOCR}=await import('../src/utils/multiStickerOcr');const original=GoogleGenerativeAI.prototype.getGenerativeModel;
 const signals:AbortSignal[]=[];let finishPrimary:()=>void=()=>{};
 GoogleGenerativeAI.prototype.getGenerativeModel=((config:any)=>({generateContent:(_:any,options:any)=>{
  signals.push(options.signal);
  return new Promise(resolve=>{if(config.model==='gemini-3.5-flash-lite')finishPrimary=()=>resolve({response:{text:()=>'{"stickers":[{"x":1,"y":2,"score":"4"}]}'}});else finishPrimary();});
 }})) as any;
 try {
  const result=await processMultiStickerOCR(Buffer.from('photo'),'image/jpeg',20,{timeoutMs:1000,fallbackDelayMs:5});assert.equal(result.stickers[0].score,'4');assert.equal(signals.length,2);assert.ok(signals.every(s=>s.aborted));
  GoogleGenerativeAI.prototype.getGenerativeModel=(()=>({generateContent:(_:any,options:any)=>{signals.push(options.signal);return new Promise(()=>{})}})) as any;
  const controller=new AbortController();const pending=processMultiStickerOCR(Buffer.from('photo'),'image/jpeg',20,{signal:controller.signal});controller.abort();assert.equal((await pending).reason,'timeout');assert.ok(signals.every(s=>s.aborted));
 }finally{GoogleGenerativeAI.prototype.getGenerativeModel=original;}
});
