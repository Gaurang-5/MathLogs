import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';
process.env.NODE_ENV='test';process.env.GEMINI_API_KEY='test-key';process.env.JWT_SECRET='test-secret';
test('multi-photo route requires a teacher-owned test and forwards the original multipart image',async()=>{
 const {prisma}=await import('../src/prisma');const {createApp}=await import('../src/index');
 const admin=prisma.admin.findUnique,exam=prisma.test.findFirst,model=GoogleGenerativeAI.prototype.getGenerativeModel;
 let permitted=true,calls=0;const image=Buffer.from('original-photo-bytes');
 (prisma.admin.findUnique as any)=async()=>({id:'multi-teacher',role:'SUPER_ADMIN',instituteId:'tenant'});
 (prisma.test.findFirst as any)=async(query:any)=>{assert.deepEqual(query.where,{id:'exam',instituteId:'tenant',teacherId:'multi-teacher'});return permitted?{id:'exam',maxMarks:20}:null;};
 GoogleGenerativeAI.prototype.getGenerativeModel=(()=>({generateContent:async(parts:any[])=>{calls++;assert.equal(parts[1].inlineData.data,image.toString('base64'));return {response:{text:()=>'{"stickers":[{"x":100,"y":200,"score":"0"}]}'}};}})) as any;
 try{
  const app=createApp();const token=jwt.sign({id:'multi-teacher'},'test-secret');
  assert.equal((await request(app).post('/api/scan-ocr').field('testId','exam').field('mode','multiple').attach('image',image,{filename:'photo.png',contentType:'image/png'})).status,401);
  permitted=false;
  assert.equal((await request(app).post('/api/scan-ocr').set('Authorization',`Bearer ${token}`).field('testId','exam').field('mode','multiple').attach('image',image,{filename:'photo.png',contentType:'image/png'})).status,403);assert.equal(calls,0);
  permitted=true;
  const response=await request(app).post('/api/scan-ocr').set('Authorization',`Bearer ${token}`).field('testId','exam').field('mode','multiple').attach('image',image,{filename:'photo.png',contentType:'image/png'});
  assert.equal(response.status,200,JSON.stringify(response.body));assert.deepEqual(response.body,{stickers:[{x:100,y:200,score:'0'}]});assert.equal(calls,1);
  let release!:()=>void,acknowledged=false;
  GoogleGenerativeAI.prototype.getGenerativeModel=(()=>({generateContent:()=>new Promise(resolve=>{release=()=>resolve({response:{text:()=>'{"stickers":[{"x":100,"y":200,"score":"4"}]}'}});})})) as any;
  const streamed=await request(app).post('/api/scan-ocr').set('Authorization',`Bearer ${token}`).field('testId','exam').field('mode','multiple').field('progress','1').attach('image',image,{filename:'photo.png',contentType:'image/png'}).buffer(true).parse((res,done)=>{
   assert.equal(res.headers['x-ocr-stage'],'reading');assert.equal(res.headers['cache-control'],'no-store, no-transform');
   let data='';res.on('data',chunk=>{data+=chunk.toString();if(!acknowledged){acknowledged=true;release();}});res.on('end',()=>done(null,JSON.parse(data)));
  }).timeout(3000);
  assert.ok(acknowledged);assert.equal(streamed.body.stickers[0].score,'4');
 }finally{prisma.admin.findUnique=admin;prisma.test.findFirst=exam;GoogleGenerativeAI.prototype.getGenerativeModel=model;}
});
