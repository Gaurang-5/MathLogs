import test from 'node:test';
import assert from 'node:assert/strict';
import { getCourseCode, getInstituteCode } from '../src/utils/studentIds';

test('getCourseCode returns mapped subjects and sensible fallbacks', () => {
    assert.equal(getCourseCode('Mathematics'), 'MTH');
    assert.equal(getCourseCode('Computer Science'), 'CSC');
    assert.equal(getCourseCode('Robotics Lab'), 'ROB');
    assert.equal(getCourseCode(null), 'GEN');
});

test('getInstituteCode builds initials from institute names', () => {
    assert.equal(getInstituteCode('IT SKILLS MZN'), 'IS');
    assert.equal(getInstituteCode('MathLogs'), 'MA');
    assert.equal(getInstituteCode('   '), 'XX');
});
