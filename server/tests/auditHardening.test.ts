import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { cleanExtractedScore } from '../src/utils/ocr';
import { parentFeeScope, normalizeParentPhone } from '../src/services/parentFeeAccess';
import { ownsTest, eligibleEnrollment } from '../src/services/testAccess';

test('OCR accepts zero and decimals but rejects ambiguous text and mismatched fractions',()=>{
    for(const value of ['7 or 9','score 7 confidence 95','7 0','-1','NaN','', '45/100']) assert.equal(cleanExtractedScore(value,50),'');
    assert.equal(cleanExtractedScore('0',50),'0');
    assert.equal(cleanExtractedScore('7.5',50),'7.5');
    assert.equal(cleanExtractedScore('45/50',50),'45');
    assert.equal(cleanExtractedScore('51',50),'');
});
test('parent fee access rejects unauthenticated, wrong-purpose and expired tokens',()=>{
    const request=(claims:object,expiresIn:any='5m')=>({headers:{authorization:`Bearer ${jwt.sign(claims,'test-secret',{expiresIn})}`}} as any);
    assert.equal(parentFeeScope({headers:{}} as any),null);
    assert.equal(parentFeeScope(request({instituteId:'i',id:'teacher',role:'ADMIN'})),null);
    assert.equal(parentFeeScope(request({instituteId:'i',studentId:'s',role:'STUDENT'})),null);
    assert.equal(parentFeeScope(request({instituteId:'i',studentId:'s',role:'STUDENT',authenticationMethod:'WHATSAPP_OTP'},-1)),null);
    assert.deepEqual(parentFeeScope(request({instituteId:'i',studentId:'s',role:'STUDENT',authenticationMethod:'WHATSAPP_OTP'})),{instituteId:'i',studentIds:['s']});
    assert.deepEqual(parentFeeScope(request({instituteId:'i',purpose:'STUDENT_ACCOUNT_SELECTION',studentIds:['s','s2'],normalizedPhone:'9876543210'})),{instituteId:'i',studentIds:['s','s2'],phone:'9876543210'});
});
test('phone matching cannot normalize arbitrary text into a broad search',()=>{
    for(const value of ['', 'hello','123','abc9876543210','1234567890123',{},undefined]) assert.equal(normalizeParentPhone(value),null);
    assert.equal(normalizeParentPhone('+91 98765 43210'),'9876543210');
});
test('test access fails closed for null owners, tenants and wrong batch',()=>{
    assert.equal(ownsTest({instituteId:'i',teacherId:null},{instituteId:'i',id:'t'}),false);
    assert.equal(ownsTest({instituteId:'other',teacherId:'t'},{instituteId:'i',id:'t'}),false);
    const target={batchId:'b1',batches:[],className:'10'};
    assert.equal(eligibleEnrollment(target,[{batchId:'b2',batch:{teacherId:'t',className:'10'}}],'t'),undefined);
});
