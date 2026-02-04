import { describe, it, expect } from 'vitest';
import { analyzeEnv, isSecret, detectBindingType, type Env } from './index';

describe('Env Introspector', () => {
  it('detects secret patterns', () => {
    expect(isSecret('API_TOKEN')).toBe(true);
    expect(isSecret('ANTHROPIC_API_KEY')).toBe(true);
    expect(isSecret('ENVIRONMENT')).toBe(false);
  });

  it('detects binding types', () => {
    expect(detectBindingType('DB', { prepare: () => {}, batch: () => {} })).toBe('D1');
    expect(detectBindingType('BUCKET', { put: () => {}, get: () => {}, list: () => {}, delete: () => {}, head: () => {} })).toBe('R2');
    expect(detectBindingType('KV', { put: () => {}, get: () => {}, list: () => {}, delete: () => {} })).toBe('KV');
  });

  it('generates complete report', () => {
    const env: Env = { DB: { prepare: () => {}, batch: () => {} }, API_KEY: 'secret', ENVIRONMENT: 'prod' };
    const report = analyzeEnv(env);
    expect(report.runtime).toBe('cloudflare-workers');
    expect(report.bindings[0]).toMatchObject({ name: 'DB', type: 'D1' });
    expect(report.secrets).toContain('API_KEY');
    expect(report.vars).toHaveProperty('ENVIRONMENT', 'prod');
  });

  it('never exposes secret values', () => {
    const env: Env = { ANTHROPIC_API_KEY: 'sk-ant-secret' };
    const report = analyzeEnv(env);
    expect(JSON.stringify(report)).not.toContain('sk-ant-secret');
  });
});
