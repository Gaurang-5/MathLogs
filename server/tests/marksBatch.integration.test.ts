import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Opt in only against a disposable local database initialized from schema.prisma.
test('real PostgreSQL batch writes, retries, competing corrections and audit rollback', {skip:process.env.MARKS_INTEGRATION_TEST!=='1'},async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
 const {prisma}=await import('../src/prisma');const {submitMarksBatch}=await import('../src/controllers/marksBatchController');
 const instituteId=randomUUID(),actorId=randomUUID(),testId=randomUUID(),batchId=randomUUID();
 const ids=Array.from({length:20},()=>randomUUID());
 try{
  await prisma.institute.create({data:{id:instituteId,name:'Isolated scanner test'}});
  await prisma.admin.create({data:{id:actorId,username:actorId,password:'unused-test-password',instituteId}});
  await prisma.batch.create({data:{id:batchId,name:'Test batch',instituteId,teacherId:actorId}});
  await prisma.test.create({data:{id:testId,name:'Test',subject:'Math',date:new Date(),maxMarks:20,instituteId,teacherId:actorId,batchId}});
  await prisma.student.createMany({data:ids.map((id,i)=>({id,name:`Student ${i}`,parentName:'Test',parentWhatsapp:id,instituteId,batchId}))});
  await prisma.enrollment.createMany({data:ids.map(studentId=>({instituteId,studentId,batchId,startedAt:new Date()}))});
  const run=async(marks:any[])=>{let status=200,body:any;await submitMarksBatch({body:{testId,marks},user:{id:actorId,instituteId}} as any,{status(v:number){status=v;return this;},json(v:any){body=v;}} as any);return {status,body};};
  const input=ids.map((studentId,i)=>({studentId,score:i,expectedScore:null}));
  const first=await run(input);assert.equal(first.status,200);assert.ok(first.body.results.every((r:any)=>r.saved));assert.equal(await prisma.mark.count({where:{testId}}),20);assert.equal(await prisma.systemLog.count({where:{instituteId}}),20);
  assert.ok((await run(input)).body.results.every((r:any)=>r.saved));assert.equal(await prisma.systemLog.count({where:{instituteId}}),20);
  const competing=await Promise.all([run([{studentId:ids[0],score:4,expectedScore:0}]),run([{studentId:ids[0],score:8,expectedScore:0}])]);assert.equal(competing.filter(r=>r.body.results[0].saved).length,1);assert.equal(competing.filter(r=>r.body.results[0].conflict).length,1);assert.equal(await prisma.systemLog.count({where:{instituteId}}),21);
  // Inject an audit failure to prove marks and audit commit atomically.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION scanner_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER scanner_test_fail BEFORE INSERT ON "SystemLog" FOR EACH ROW EXECUTE FUNCTION scanner_test_fail_audit()`);
  try{assert.equal((await run([{studentId:ids[1],score:10,expectedScore:1}])).status,503);assert.equal((await prisma.mark.findUnique({where:{studentId_testId:{studentId:ids[1],testId}}}))!.score,1);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER scanner_test_fail ON "SystemLog"');await prisma.$executeRawUnsafe('DROP FUNCTION scanner_test_fail_audit()');}
 }finally{
  await prisma.mark.deleteMany({where:{testId}});await prisma.systemLog.deleteMany({where:{instituteId}});await prisma.enrollment.deleteMany({where:{instituteId}});await prisma.student.deleteMany({where:{instituteId}});await prisma.test.deleteMany({where:{id:testId}});await prisma.batch.deleteMany({where:{id:batchId}});await prisma.admin.deleteMany({where:{id:actorId}});await prisma.institute.deleteMany({where:{id:instituteId}});await prisma.$disconnect();
 }
});
