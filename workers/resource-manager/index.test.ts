import { describe, it, expect, vi } from 'vitest';
import { listResources, type Env } from './index';

describe('Resource Manager', () => {
  it('returns empty array when no bindings', async () => {
    expect(await listResources({})).toEqual([]);
  });

  it('detects D1 binding', async () => {
    const mockDB = { prepare: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ '1': 1 }) }) } as unknown as D1Database;
    const resources = await listResources({ DB: mockDB });
    expect(resources[0]).toMatchObject({ type: 'D1', status: 'connected' });
  });

  it('detects R2 binding', async () => {
    const mockBucket = { list: vi.fn().mockResolvedValue({ truncated: false, objects: [] }) } as unknown as R2Bucket;
    const resources = await listResources({ BUCKET: mockBucket });
    expect(resources[0]).toMatchObject({ type: 'R2', status: 'connected' });
  });

  it('detects KV binding', async () => {
    const mockKV = { get: vi.fn().mockResolvedValue(null) } as unknown as KVNamespace;
    const resources = await listResources({ KV: mockKV });
    expect(resources[0]).toMatchObject({ type: 'KV', status: 'connected' });
  });
});
