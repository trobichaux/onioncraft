import { sanitizeString, validatePartitionKey, maskApiKey } from '@/lib/security';

describe('sanitizeString', () => {
  it('strips HTML tags', () => {
    expect(sanitizeString('<script>alert("xss")</script>Hello')).toBe(
      'alert("xss")Hello',
    );
  });

  it('strips nested HTML tags', () => {
    expect(sanitizeString('<div><b>bold</b></div>')).toBe('bold');
  });

  it('enforces default max length of 1000', () => {
    const longInput = 'a'.repeat(2000);
    expect(sanitizeString(longInput)).toHaveLength(1000);
  });

  it('enforces custom max length', () => {
    const longInput = 'a'.repeat(100);
    expect(sanitizeString(longInput, 50)).toHaveLength(50);
  });

  it('trims whitespace', () => {
    expect(sanitizeString('  hello world  ')).toBe('hello world');
  });

  it('preserves legitimate text without tags', () => {
    const text = 'Hello, this is a normal sentence with 100% legit content!';
    expect(sanitizeString(text)).toBe(text);
  });

  it('handles empty string', () => {
    expect(sanitizeString('')).toBe('');
  });
});

describe('validatePartitionKey', () => {
  it('allows own userId', () => {
    expect(validatePartitionKey('user123', 'user123')).toBe(true);
  });

  it('allows shared partition', () => {
    expect(validatePartitionKey('user123', 'shared')).toBe(true);
  });

  it('rejects a different userId', () => {
    expect(validatePartitionKey('user123', 'user456')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validatePartitionKey('user123', '')).toBe(false);
  });

  it('rejects partial match', () => {
    expect(validatePartitionKey('user', 'user123')).toBe(false);
  });
});

describe('maskApiKey', () => {
  it('masks a long key showing first 4 and last 4 chars', () => {
    expect(maskApiKey('ABCDEFGHIJKLMNOP')).toBe('ABCD...MNOP');
  });

  it('masks a 12-character key', () => {
    expect(maskApiKey('123456789012')).toBe('1234...9012');
  });

  it('returns **** for keys shorter than 12 characters', () => {
    expect(maskApiKey('SHORT')).toBe('****');
  });

  it('returns **** for empty string', () => {
    expect(maskApiKey('')).toBe('****');
  });

  it('returns **** for 11-character key', () => {
    expect(maskApiKey('12345678901')).toBe('****');
  });
});
