import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { submitMarksBatch } from '../src/controllers/marksBatchController';
import { submitMarksBatchSchema } from '../src/schemas';

test('batch saves use bounded set-based writes, preserve conflicts and safely retry',async()=>{
 const original=prisma.$transaction;let owner='teacher',fail=false;let writes=0,logs=0;const previous=new Map<string,number>([['b',7]]);
 const tx:any={
  $queryRaw:async()=>[],test:{findUnique:async()=>({id:'test',teacherId:owner,instituteId:'institute',maxMarks:20,batchId:'batch',batches:[],date:new Date()})},
  student:{findMany:async(q:any)=>{assert.equal(q.where.instituteId,'institute');return ['a','b','outside'].map(id=>({id,name:id,marks:previous.has(id)?[{score:previous.get(id)}]:[],enrollments:[{status:'ACTIVE',batchId:id==='outside'?'other':'batch',batch:{teacherId:'teacher'}}]}));}},
  $executeRaw:async(sql:any)=>{writes++;assert.ok(sql.sql.includes('ON CONFLICT'));assert.ok(!sql.sql.includes("'a'"));if(fail)throw new Error('simulated write failure');return 1;},
  systemLog:{createMany:async(q:any)=>{logs++;assert.ok(q.data.every((l:any)=>l.details.actorId==='teacher'));}},
 };
 (prisma.$transaction as any)=async(fn:any,options:any)=>{assert.deepEqual(options,{maxWait:3000,timeout:15000});return fn(tx);};
 const run=async(marks:any[])=>{let status=200,body:any;await submitMarksBatch({body:{testId:'test',marks},user:{id:'teacher',instituteId:'institute'}} as any,{status(v:number){status=v;return this;},json(v:any){body=v;}} as any);return {status,body};};
 try{
  const r=await run([{studentId:'a',score:0,expectedScore:null},{studentId:'b',score:9,expectedScore:null},{studentId:'outside',score:5,expectedScore:null}]);assert.equal(r.status,200);assert.equal(r.body.results[0].saved,true);assert.equal(r.body.results[1].conflict,true);assert.equal(r.body.results[1].currentScore,7);assert.equal(r.body.results[2].saved,false);assert.equal(writes,1);assert.equal(logs,1);
  assert.equal((await run([{studentId:'b',score:9,expectedScore:7}])).body.results[0].saved,true);
  previous.set('b',9);const before=writes;assert.equal((await run([{studentId:'b',score:9,expectedScore:7}])).body.results[0].saved,true);assert.equal(writes,before);
  previous.delete('b');assert.equal((await run([{studentId:'b',score:9,expectedScore:7}])).body.results[0].currentScore,null);
  assert.equal((await run([{studentId:'a',score:21,expectedScore:null}])).body.results[0].saved,false);
  owner='other';assert.equal((await run([{studentId:'a',score:1,expectedScore:null}])).status,403);owner='teacher';fail=true;assert.equal((await run([{studentId:'a',score:1,expectedScore:null}])).status,503);
 }finally{prisma.$transaction=original;}
});
test('batch schema requires unique valid identities, explicit expected marks, and bounded rows',()=>{
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';const row={studentId:id,score:'0',expectedScore:null};const parse=(marks:any)=>submitMarksBatchSchema.safeParse({body:{testId:other,marks}});
 assert.ok(parse([row]).success);for(const rows of [[],[row,row],Array(21).fill(row),[{...row,score:''}],[{...row,score:-1}],[{studentId:id,score:5}]])assert.equal(parse(rows).success,false);
});
