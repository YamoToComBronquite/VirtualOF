import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discardImages, saveImages } from '../server/uploads.ts';
import type { ImageAttachment } from '../shared/types.ts';

vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn() }));
const images: ImageAttachment[] = [
  { name: 'first.png', mime: 'image/png', data: 'AA==' },
  { name: 'second.png', mime: 'image/png', data: 'AA==' },
];
beforeEach(() => vi.resetAllMocks());

describe('upload failure recovery', () => {
  it('rolls back earlier files and the partially written file when a later write fails', () => {
    const failure = new Error('ENOSPC');
    vi.mocked(writeFileSync).mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw failure; });
    expect(() => saveImages(images)).toThrow(failure);
    expect(mkdirSync).toHaveBeenCalledOnce();
    expect(vi.mocked(rmSync).mock.calls.map(([path]) => path)).toEqual(vi.mocked(writeFileSync).mock.calls.map(([path]) => path));
  });

  it('attempts every removal even when one fails, retaining write and cleanup errors', () => {
    const failure = new Error('ENOSPC');
    const cleanupFailure = new Error('EACCES');
    vi.mocked(writeFileSync).mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw failure; });
    vi.mocked(rmSync).mockImplementationOnce(() => { throw cleanupFailure; });
    let caught: unknown;
    try { saveImages(images); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AggregateError);
    const errors = (caught as AggregateError).errors;
    expect(errors[0]).toBe(failure);
    expect(errors[1].errors).toEqual([cleanupFailure]);
    expect(rmSync).toHaveBeenCalledTimes(2);
  });

  it('also attempts every removal during normal cleanup', () => {
    vi.mocked(rmSync).mockImplementationOnce(() => { throw new Error('EACCES'); });
    expect(() => discardImages(images.map((image, index) => ({ ...image, path: `file-${index}` })))).toThrow(AggregateError);
    expect(rmSync).toHaveBeenCalledTimes(2);
  });
});
