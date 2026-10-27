import { describe, expect, it, vi } from 'vitest';
import { runBackground } from '../server/tasks.ts';

describe('detached tasks', () => {
  it('reports execution and cleanup failures independently, without rejecting', async () => {
    const failure = new Error('runner failed');
    const cleanupFailure = new Error('cleanup failed');
    const onFailure = vi.fn();
    const onCleanupFailure = vi.fn();
    await expect(runBackground(async () => { throw failure; }, () => { throw cleanupFailure; }, onFailure, onCleanupFailure)).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(onCleanupFailure).toHaveBeenCalledWith(cleanupFailure);
  });

  it('cleans up after success, and a cleanup failure does not report execution failure', async () => {
    const onFailure = vi.fn();
    const cleanup = vi.fn(() => { throw new Error('cleanup failed'); });
    const onCleanupFailure = vi.fn();
    await runBackground(async () => undefined, cleanup, onFailure, onCleanupFailure);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onCleanupFailure).toHaveBeenCalledOnce();
  });

  it('still cleans up and resolves if reporting a failure throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const cleanup = vi.fn();
      await expect(runBackground(async () => { throw new Error('runner failed'); }, cleanup,
        () => { throw new Error('report failed'); }, vi.fn())).resolves.toBeUndefined();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
});
