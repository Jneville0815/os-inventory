import { describe, it, expect } from 'vitest';
import { statusFor } from './source';

describe('statusFor', () => {
  it('reports outdated when the source says so', () => {
    expect(statusFor('2.0.0', true)).toBe('outdated');
  });

  it('reports current when a latest version is known and it is not outdated', () => {
    expect(statusFor('2.0.0', false)).toBe('current');
  });

  it('reports unknown with no latest version — we cannot claim currency without a feed', () => {
    expect(statusFor('', false)).toBe('unknown');
  });

  it('lets an explicit outdated flag win over a missing latest version', () => {
    expect(statusFor('', true)).toBe('outdated');
  });
});
