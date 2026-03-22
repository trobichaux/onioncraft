import { retryWithBackoff } from './retryWithBackoff';
import { Gw2ApiError } from '@/lib/gw2Client';

const noDelay = () => Promise.resolve();

describe('retryWithBackoff', () => {
  it('returns immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('data');

    const result = await retryWithBackoff(fn, { delayFn: noDelay });
    expect(result).toBe('data');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Gw2ApiError(429, 'Rate limited', '/items'))
      .mockResolvedValue('ok');

    const result = await retryWithBackoff(fn, { delayFn: noDelay });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Gw2ApiError(503, 'Service Unavailable', '/items'))
      .mockResolvedValue('ok');

    const result = await retryWithBackoff(fn, { delayFn: noDelay });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on non-retryable status (400)', async () => {
    const fn = jest.fn().mockRejectedValue(new Gw2ApiError(400, 'Bad Request', '/items'));

    await expect(retryWithBackoff(fn, { delayFn: noDelay })).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts max retries and throws last error', async () => {
    const fn = jest.fn().mockRejectedValue(new Gw2ApiError(429, 'Rate limited', '/items'));

    await expect(retryWithBackoff(fn, { maxRetries: 2, delayFn: noDelay })).rejects.toThrow(
      'Rate limited'
    );
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('uses exponentially increasing delays', async () => {
    const delays: number[] = [];
    const trackDelay = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Gw2ApiError(429, 'Rate limited', '/items'))
      .mockRejectedValueOnce(new Gw2ApiError(429, 'Rate limited', '/items'))
      .mockResolvedValue('ok');

    await retryWithBackoff(fn, { baseDelayMs: 100, delayFn: trackDelay });

    expect(delays).toEqual([100, 200]); // 100*2^0, 100*2^1
  });
});
