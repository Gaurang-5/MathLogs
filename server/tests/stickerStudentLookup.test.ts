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
