import { describe, it, expect, vi } from 'vitest';
import { checkSyncHealth, type Env } from './index';

describe('Sync Monitor', () => {
  it('returns healthy when sync is recent', async () => {
    const mockBucket = {
      get: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(new Date().toISOString()) }),
      list: vi.fn().mockResolvedValue({ objects: [{ key: 'file1' }], truncated: false }),
    } as unknown as R2Bucket;
    const status = await checkSyncHealth({ BUCKET: mockBucket });
    expect(status.healthy).toBe(true);
  });

  it('detects stale sync', async () => {
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const mockBucket = {
      get: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(staleTime) }),
      list: vi.fn().mockResolvedValue({ objects: [{ key: 'file1' }], truncated: false }),
    } as unknown as R2Bucket;
    const status = await checkSyncHealth({ BUCKET: mockBucket });
    expect(status.healthy).toBe(false);
  });

  it('detects empty bucket', async () => {
    const mockBucket = {
      get: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(new Date().toISOString()) }),
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    } as unknown as R2Bucket;
    const status = await checkSyncHealth({ BUCKET: mockBucket });
    expect(status.healthy).toBe(false);
  });
});
