import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBasicCredentials } from '../src/domain/auth/demoBasicAccount';

test('demo Basic credentials require an explicit non-production configuration', () => {
  assert.deepEqual(demoBasicCredentials({
    NODE_ENV: 'development',
    DEMO_BASIC_PHONE: '99999 00001',
    DEMO_BASIC_OTP: '00000',
  }), { phone: '9999900001', otp: '00000' });
  assert.equal(demoBasicCredentials({ NODE_ENV: 'development' }), null);
  assert.equal(demoBasicCredentials({ NODE_ENV: 'development', DEMO_BASIC_PHONE: '9999900001', DEMO_BASIC_OTP: '000000' }), null);
});

test('production never enables shared demo credentials', () => {
  assert.equal(demoBasicCredentials({
    NODE_ENV: 'production',
    DEMO_BASIC_PHONE: '9999900001',
    DEMO_BASIC_OTP: '00000',
  }), null);
});
