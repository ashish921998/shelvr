import { describe, expect, it } from 'vitest';

import { formatErrorDetail } from './error-detail';

describe('formatErrorDetail', () => {
  it('preserves Error name, message, and data diagnostics', () => {
    const error = Object.assign(new TypeError('sign-in failed'), {
      data: { code: 'AUTH_FAILED' },
    });

    expect(formatErrorDetail(error)).toBe(
      'TypeError: sign-in failed | data={"code":"AUTH_FAILED"}',
    );
  });

  it('formats circular values without throwing', () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(formatErrorDetail(value)).toBe('{"self":"[Circular]"}');
  });

  it('formats BigInt values without throwing', () => {
    expect(formatErrorDetail({ status: 401n })).toBe('{"status":"401n"}');
  });

  it('returns a useful string when JSON.stringify returns undefined', () => {
    expect(formatErrorDetail(undefined)).toBe('undefined');
  });
});
