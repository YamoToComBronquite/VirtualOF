import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { RunImage } from '../server/agents/runner.ts';

// spawnOpencode is only checked for the command line it builds; nothing is started.
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => ({})) }));
const { spawn } = await import('node:child_process');
const { fileArgs, spawnOpencode } = await import('../server/agents/opencode.ts');

const folder = mkdtempSync(join(tmpdir(), 'virtualof teste ção~'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function file(name: string): RunImage {
  const path = join(folder, name);
  writeFileSync(path, 'x');
  return { name, mime: 'image/png', data: '', path };
}

describe('fileArgs', () => {
  const tricky = file('meu print ~ação.png');

  it('attaches a path with spaces, accents and ~ as one argument', () => {
    for (const exe of ['C:\\npm\\opencode.cmd', 'C:\\bin\\opencode.exe']) {
      expect(fileArgs(exe, [tricky])).toEqual({ args: ['--file', tricky.path], skipped: [] });
    }
  });

  it('skips files that are gone', () => {
    const gone: RunImage = { ...tricky, path: join(folder, 'sumiu.png') };
    expect(fileArgs('opencode.exe', [gone])).toEqual({ args: [], skipped: [gone] });
  });

  it('skips paths cmd.exe would expand, only when the launcher goes through cmd', () => {
    const percent = file('100%done.png');
    expect(fileArgs('C:\\npm\\opencode.cmd', [percent]).skipped).toEqual([percent]);
    expect(fileArgs('C:\\bin\\opencode.exe', [percent]).args).toEqual(['--file', percent.path]);
  });
});

describe('spawnOpencode', () => {
  it('quotes every argument for the .cmd launcher, so the path stays whole', () => {
    spawnOpencode('C:\\npm\\opencode.cmd', ['run', '--file', tricky()], folder);
    const [command, args, options] = vi.mocked(spawn).mock.calls.at(-1)!;
    expect(command).toBe('"C:\\npm\\opencode.cmd"');
    expect(args).toEqual(['"run"', '"--file"', `"${tricky()}"`]);
    expect(options).toMatchObject({ shell: true, cwd: folder });
  });

  it('passes arguments untouched to a real executable', () => {
    spawnOpencode('C:\\bin\\opencode.exe', ['run', '--file', tricky()], folder);
    const [command, args, options] = vi.mocked(spawn).mock.calls.at(-1)!;
    expect(command).toBe('C:\\bin\\opencode.exe');
    expect(args).toEqual(['run', '--file', tricky()]);
    expect(options).toMatchObject({ shell: false });
  });

  function tricky() {
    return join(folder, 'meu print ~ação.png');
  }
});
