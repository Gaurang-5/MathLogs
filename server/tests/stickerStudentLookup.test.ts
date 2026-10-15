import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { getStudentByHumanId } from '../src/controllers/testController';
test('sticker lookup confirms test eligibility without replacing production ownership rules', async () => {
 const sf=prisma.student.findFirst, tf=prisma.test.findUnique;
 let owner='teacher', tenant='institute';
 (prisma.student.findFirst as any)=async(q:any)=>{assert.deepEqual(q.where,{humanId:'DEMO',instituteId:'institute'});return {id:'s',name:'Demo',humanId:'DEMO',marks:[],enrollments:[{batchId:'other',batch:{className:'9',teacherId:'teacher'}},{batchId:'shared',batch:{className:'10',teacherId:'teacher'}}]}};
 (prisma.test.findUnique as any)=async()=>({teacherId:owner,instituteId:tenant,batchId:'shared',className:'9',batches:[]});
 const lookup=async()=>{let status=200,body:any;await getStudentByHumanId({params:{humanId:' DEMO '},query:{testId:'test'},user:{id:'teacher',instituteId:'institute'}} as any,{status(v:number){status=v;return this},json(v:any){body=v}} as any);return {status,body}};
 try {let r=await lookup();assert.equal(r.status,200);assert.equal(r.body.batch.className,'10');assert.equal(r.body.testEligible,true);owner='other';assert.equal((await lookup()).status,403);owner='teacher';tenant='other';assert.equal((await lookup()).status,403);}finally{prisma.student.findFirst=sf;prisma.test.findUnique=tf;}
});

test('batch lookup scopes both queries, maps by ID, and rejects ineligible students and unauthorized tests', async () => {
 const {getStudentsByHumanIds}=await import('../src/controllers/testController');
 const sf=prisma.student.findMany,tf=prisma.test.findFirst;
 let owner='teacher',tenant='institute',studentQueries=0,testQueries=0;
 (prisma.test.findFirst as any)=async(q:any)=>{testQueries++;assert.deepEqual(q.where,{id:'test',instituteId:'institute',teacherId:'teacher'});return {teacherId:owner,instituteId:tenant,batchId:'batch',batches:[]}};
 (prisma.student.findMany as any)=async(q:any)=>{studentQueries++;assert.equal(q.where.instituteId,'institute');assert.deepEqual(q.where.humanId.in,['A','B','C']);assert.deepEqual(q.select.enrollments.where,{status:'ACTIVE'});assert.deepEqual(q.select.marks.where,{testId:'test'});return [
 {id:'b',humanId:'B',name:'B',marks:[],enrollments:[{batchId:'other',batch:{teacherId:'teacher'}}]},
 {id:'a',humanId:'A',name:'A',marks:[{testId:'test',score:0}],enrollments:[{batchId:'batch',batch:{teacherId:'teacher'}}]},
 ]};
 const lookup=async(humanIds:any=[' A ','B','C','A'])=>{let status=200,body:any;await getStudentsByHumanIds({body:{testId:'test',humanIds},user:{id:'teacher',instituteId:'institute'}} as any,{status(v:number){status=v;return this},json(v:any){body=v}} as any);return {status,body}};
 try {
  const r=await lookup();assert.equal(r.status,200);assert.equal(r.body.results[0].student.id,'a');assert.equal(r.body.results[0].student.marks[0].score,0);assert.ok(r.body.results[1].error);assert.ok(r.body.results[2].error);assert.equal(studentQueries,1);assert.equal(testQueries,1);
  owner='other';assert.equal((await lookup()).status,403);owner='teacher';tenant='other';assert.equal((await lookup()).status,403);assert.equal(studentQueries,1);
  for(const ids of [[],Array(11).fill('A'),[''],[123],null])assert.equal((await lookup(ids)).status,400);
 }finally{prisma.student.findMany=sf;prisma.test.findFirst=tf;}
});
