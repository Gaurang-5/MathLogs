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
