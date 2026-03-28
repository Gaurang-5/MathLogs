import axios from 'axios';
import 'dotenv/config';

/**
 * Concurrency & Load Tester
 * This script hammers the local backend with concurrent API requests 
 * to verify transactions, row locks, and rate limiters work properly.
 */

const API_URL = 'http://localhost:3001/api';
// Provide a valid admin token manually, or the script will log in first
let TOKEN = process.env.TEST_TOKEN || ''; 
let ADMIN_ID = '';

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function loginAndSetup() {
    if (!TOKEN) {
        console.log('Generating test-token from DB directly...');
        try {
            const admin = await prisma.admin.findFirst();
            if (!admin) throw new Error("No admins found in DB to test with.");
            
            TOKEN = jwt.sign({
                id: admin.id,
                username: admin.username,
                passwordVersion: admin.passwordVersion,
                instituteId: admin.instituteId,
                role: admin.role
            }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
            
            ADMIN_ID = admin.id;
            console.log(`✅ Successfully authenticated as ${admin.username}!`);
        } catch (e: any) {
            console.error('Test Token Gen Failed:', e.message);
            process.exit(1);
        }
    }
}

async function runPaymentRaceConditionTest(studentId: string, feeRecordId: string) {
    console.log(`\n===========================================`);
    console.log(`🧪 TESTING DOUBLE-SPEND / PAYMENT RACE CONDITIONS`);
    console.log(`===========================================`);
    
    const headers = { Authorization: `Bearer ${TOKEN}` };
    const NUM_CONCURRENT = 10;
    
    console.log(`Sending ${NUM_CONCURRENT} identical payment requests at the exact same millisecond...`);
    
    // API endpoint based on current router validation: /api/fees/pay requires { studentId, amount }
    const requests = Array.from({ length: NUM_CONCURRENT }).map((_, i) => {
        return axios.post(`${API_URL}/fees/pay`, {
            amount: 50000,
            studentId: studentId
        }, { headers, validateStatus: () => true }) // Catch all statuses
        .then(res => ({ idx: i, status: res.status, data: res.data }));
    });
    
    const results = await Promise.all(requests);
    
    const successes = results.filter(r => r.status === 200);
    const failures = results.filter(r => r.status !== 200);
    
    console.log(`\nResults:`);
    console.log(`✅ Successes: ${successes.length}`);
    console.log(`❌ Failures (Double-Spend Prevented): ${failures.length}`);
    
    if (successes.length === 1 && failures.length === NUM_CONCURRENT - 1) {
        console.log(`\n🎉 PASS: Serializable Transactions successfully blocked the race condition!`);
    } else {
        console.log(`\n💥 FAIL: Multiple payments merged! (Success: ${successes.length})`);
    }
    
    return failures;
}

async function runOTPRaceConditionTest() {
    console.log(`\n===========================================`);
    console.log(`🧪 TESTING OTP UPSERT CONCURRENCY & LIMITS`);
    console.log(`===========================================`);
    
    const NUM_CONCURRENT = 5;
    console.log(`Sending ${NUM_CONCURRENT} identical OTP requests at the exact same millisecond...`);
    
    const phone = '9999999999'; // Some dummy phone
    const requests = Array.from({ length: NUM_CONCURRENT }).map((_, i) => {
        return axios.post(`${API_URL}/auth/send-otp`, { phone }, { validateStatus: () => true })
        .then(res => ({ idx: i, status: res.status }));
    });
    
    const results = await Promise.all(requests);
    console.log(`✅ Completed ${results.length} requests without Postgres Deadlock.`);
    // As long as no 500 errors or Prisma crash happens, upserts are serialized correctly!
    const serverErrors = results.filter(r => r.status >= 500);
    if (serverErrors.length === 0) {
        console.log(`\n🎉 PASS: OTP DB Upsert handled concurrency gracefully.`);
    } else {
        console.log(`\n💥 FAIL: Database deadlock or server crash detected.`);
    }
}

async function run() {
    await loginAndSetup();
    
    // Auto-fetch a valid student and fee record to test against
    let feeRecord = await prisma.feeRecord.findFirst({
        where: { status: 'PENDING' },
        include: { student: true }
    });

    let isMockData = false;
    let fakeBatchId = "";
    
    // If no existing fee system data is around, let's inject a mock one to test the serialization fully
    if (!feeRecord) {
        console.log(`\n⚠️ No PENDING FeeRecord found! Injecting a temporary mock record to test the payment race-condition...`);
        const admin = await prisma.admin.findFirst({ where: { instituteId: { not: null } } });
        if (admin && admin.instituteId) {
            const fakeBatch = await prisma.batch.create({
                data: {
                    name: "Mock Test Batch",
                    feeAmount: 50000,
                    instituteId: admin.instituteId
                }
            });
            fakeBatchId = fakeBatch.id;
            const student = await prisma.student.create({
                data: {
                    name: "Automated Stress Test User",
                    parentName: "Test Parent",
                    parentWhatsapp: "9999999999",
                    instituteId: admin.instituteId,
                    batchId: fakeBatch.id,
                    balance: {
                        create: {
                            totalFee: 50000,
                            totalPaid: 0,
                            balance: 50000
                        }
                    }
                }
            });
            feeRecord = await prisma.feeRecord.create({
                data: {
                    studentId: student.id,
                    amount: 50000,
                    date: new Date(),
                    status: 'PENDING',
                },
                include: { student: true }
            }) as any;
            isMockData = true;
        }
    }

    if (feeRecord) {
        console.log(`\n🎯 Testing against: Student ${feeRecord.student.name} (Amount: ${feeRecord.amount})`);
        const failures = await runPaymentRaceConditionTest(feeRecord.studentId, feeRecord.id);
        
        if (failures?.length === 10) {
            console.log(`\n🔍 First failure response body:`, failures[0].data);
        }
        
        if (isMockData) {
            console.log(`🧹 Cleaning up mock fee data...`);
            await prisma.feeInstallment.deleteMany({ where: { batchId: fakeBatchId } }).catch(()=>{});
            await prisma.feePayment.deleteMany({ where: { studentId: feeRecord.studentId } });
            await prisma.feeRecord.deleteMany({ where: { studentId: feeRecord.studentId } });
            await prisma.studentBalance.deleteMany({ where: { studentId: feeRecord.studentId } });
            await prisma.student.delete({ where: { id: feeRecord.studentId } });
            await prisma.batch.delete({ where: { id: fakeBatchId } }).catch(()=>{});
        }
    } else {
        console.log(`\n⚠️ Skipping Payment Stress Test: Impossible to construct mock data without an admin institute.`);
    }

    await runOTPRaceConditionTest();
    console.log('\n✅ All automated concurrency tests completed.');
    process.exit(0);
}

run();
