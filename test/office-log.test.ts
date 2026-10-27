import { expect, it } from 'vitest';
import { Office } from '../server/office.ts';
import type { Account, AccountStatus, ServerMessage } from '../shared/types.ts';

it('keeps image markers after evicting previews and never stores the full image', () => {
  const office = new Office('', {} as Record<Account, AccountStatus>);
  for (let i = 0; i < 4; i++) {
    office.write('equipe', 'user', 'test', [{
      name: `image-${i}.png`, mime: 'image/png', data: 'FULL_IMAGE',
      thumbnail: { mime: 'image/jpeg', data: 'PREVIEW' },
    }], `request-${i}`);
  }
  const snapshot = office.snapshot() as Extract<ServerMessage, { type: 'snapshot' }>;
  expect(snapshot.log[0].images).toEqual([{ name: 'image-0.png', mime: 'image/jpeg', data: '' }]);
  expect(snapshot.log[3].images?.[0].data).toBe('PREVIEW');
  expect(snapshot.log[3].requestId).toBe('request-3');
  expect(JSON.stringify(snapshot)).not.toContain('FULL_IMAGE');
});

it('retains accepted ids after log eviction and identifies a fresh server instance', () => {
  const office = new Office('', {} as Record<Account, AccountStatus>);
  office.acceptSubmission('accepted');
  for (let i = 0; i < 510; i++) office.write('equipe', 'text', 'test');
  expect(office.hasSubmission('accepted')).toBe(true);
  expect(office.hasSubmission('unknown')).toBe(false);
  const restarted = new Office('', {} as Record<Account, AccountStatus>);
  expect(restarted.serverId).not.toBe(office.serverId);
  expect(restarted.hasSubmission('accepted')).toBe(false);
});
