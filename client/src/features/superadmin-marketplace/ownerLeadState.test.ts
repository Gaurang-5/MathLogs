import { describe, expect, it } from 'vitest';
import { ownerLeadStatusLabel, ownerLeadStatuses } from './ownerLeadState';

describe('owner lead state', () => {
  it('exposes only the four owner-managed sales states', () => {
    expect(ownerLeadStatuses).toEqual(['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED']);
    expect(ownerLeadStatusLabel('ENROLLED')).toBe('Enrolled');
  });
});
