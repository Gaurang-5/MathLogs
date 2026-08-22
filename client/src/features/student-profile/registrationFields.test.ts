import { describe, expect, it } from 'vitest';
import { studentFieldValue } from './registrationFields';

describe('studentFieldValue', () => {
  const student = {
    name: 'Aarav', parentWhatsapp: '9557940807',
    additionalData: { emergencyPhone: '9557940807' },
  };

  it('maps system columns and configured additional data', () => {
    expect(studentFieldValue(student, { id: 'parentWhatsapp', label: 'Parent phone', type: 'tel', system: true })).toBe('9557940807');
    expect(studentFieldValue(student, { id: 'emergencyPhone', label: 'Emergency phone', type: 'tel' })).toBe('9557940807');
    expect(studentFieldValue(student, { id: 'newField', label: 'New field', type: 'text' })).toBe('');
  });
});
