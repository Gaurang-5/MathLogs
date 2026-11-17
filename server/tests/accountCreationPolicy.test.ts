import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnlimitedAccountCreation } from '../src/domain/accounts/accountCreationPolicy';

test('only the superadmin phone, including common phone formatting, has unlimited account creation', () => {
  assert.equal(hasUnlimitedAccountCreation('9557940807'), true);
  assert.equal(hasUnlimitedAccountCreation('+91 95579 40807'), true);
  assert.equal(hasUnlimitedAccountCreation('9557940807@example.com'), false);
  assert.equal(hasUnlimitedAccountCreation('9557940808'), false);
});
