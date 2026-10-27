import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMAGE_MIMES, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_THUMBNAIL_BYTES, MAX_TOTAL_IMAGE_BYTES, type ImageMime } from '../shared/types.ts';
import { checkImages, discardImages, saveImages } from '../server/uploads.ts';

/** The first bytes each format starts with; the rest of the file is padding. */
const HEADERS: Record<ImageMime, Buffer> = {
  'image/png': Buffer.from('89504e470d0a1a0a', 'hex'),
  'image/jpeg': Buffer.from('ffd8ffe0', 'hex'),
  'image/gif': Buffer.from('GIF89a'),
  'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]),
};

/** A base64 image of `mime` that is exactly `size` bytes once decoded. */
function image(mime: ImageMime, size = 64, name = `foto.${mime.split('/')[1]}`) {
  const header = HEADERS[mime];
  const bytes = Buffer.concat([header, Buffer.alloc(Math.max(0, size - header.length))]);
  return { name, mime, data: bytes.toString('base64') };
}

const UPLOADS = join(tmpdir(), 'virtualof-uploads');

describe('checkImages', () => {
  it('accepts no images at all', () => {
    expect(checkImages(undefined)).toEqual({ images: [] });
  });

  it.each(IMAGE_MIMES)('accepts a valid %s', (mime) => {
    const result = checkImages([image(mime)]);
    expect(result).toEqual({ images: [expect.objectContaining({ mime, data: image(mime).data })] });
  });

  it('accepts MAX_IMAGES images and refuses one more', () => {
    const many = (n: number) => Array.from({ length: n }, () => image('image/png'));
    expect(checkImages(many(MAX_IMAGES))).toHaveProperty('images');
    expect(checkImages(many(MAX_IMAGES + 1))).toHaveProperty('error');
  });

  it('accepts an image of exactly MAX_IMAGE_BYTES and refuses one byte more', () => {
    expect(checkImages([image('image/png', MAX_IMAGE_BYTES)])).toHaveProperty('images');
    expect(checkImages([image('image/png', MAX_IMAGE_BYTES + 1)])).toHaveProperty('error');
  });

  const needed = Math.floor(MAX_TOTAL_IMAGE_BYTES / MAX_IMAGE_BYTES) + 1;
  it.skipIf(needed > MAX_IMAGES)('refuses images that together pass MAX_TOTAL_IMAGE_BYTES', () => {
    const images = Array.from({ length: needed }, () => image('image/png', MAX_IMAGE_BYTES));
    expect(checkImages(images)).toHaveProperty('error');
  });

  it('refuses SVG and other types', () => {
    const svg = { name: 'x.svg', mime: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') };
    expect(checkImages([svg])).toHaveProperty('error');
  });

  it('refuses bytes that are not the declared type', () => {
    expect(checkImages([{ ...image('image/png'), mime: 'image/jpeg' }])).toHaveProperty('error');
    expect(checkImages([{ ...image('image/gif'), mime: 'image/webp' }])).toHaveProperty('error');
  });

  it.each([
    ['not base64', '@@@@'],
    ['a data: prefix', `data:image/png;base64,${image('image/png').data}`],
    ['line breaks', `${image('image/png').data.slice(0, 8)}\n${image('image/png').data.slice(8)}`],
    ['a number', 42],
  ])('refuses data with %s', (_, data) => {
    expect(checkImages([{ name: 'a.png', mime: 'image/png', data }])).toHaveProperty('error');
  });

  it('refuses a list that is not an array', () => {
    expect(checkImages({ name: 'a.png' })).toHaveProperty('error');
  });

  it('keeps a valid JPEG thumbnail and refuses one over MAX_THUMBNAIL_BYTES', () => {
    const thumb = image('image/jpeg', 100);
    const ok = checkImages([{ ...image('image/png'), thumbnail: { mime: 'image/jpeg', data: thumb.data } }]);
    expect(ok).toEqual({ images: [expect.objectContaining({ thumbnail: { mime: 'image/jpeg', data: thumb.data } })] });
    const big = image('image/jpeg', MAX_THUMBNAIL_BYTES + 1);
    expect(checkImages([{ ...image('image/png'), thumbnail: { mime: 'image/jpeg', data: big.data } }])).toHaveProperty('error');
  });
});

describe('saveImages / discardImages', () => {
  it('writes to the temp uploads folder under a generated name, whatever the image is called', () => {
    const checked = checkImages([image('image/png', 64, '../../../projeto/evil.png'), image('image/jpeg', 64, '..\\..\\x.jpg')]);
    if (!('images' in checked)) throw new Error(checked.error);
    const saved = saveImages(checked.images);
    try {
      expect(saved).toHaveLength(2);
      for (const [i, file] of saved.entries()) {
        expect(dirname(file.path)).toBe(UPLOADS);
        expect(basename(file.path)).toMatch(/^[0-9a-f-]{36}\.(png|jpg)$/);
        expect(readFileSync(file.path).equals(Buffer.from(checked.images[i].data, 'base64'))).toBe(true);
      }
      expect(saved[0].path.endsWith('.png')).toBe(true);
      expect(saved[1].path.endsWith('.jpg')).toBe(true);
    } finally {
      discardImages(saved);
    }
    for (const file of saved) expect(existsSync(file.path)).toBe(false);
  });

  it('does nothing for no images, and cleaning up twice is harmless', () => {
    expect(saveImages([])).toEqual([]);
    const saved = saveImages([image('image/gif')]);
    discardImages(saved);
    expect(() => discardImages(saved)).not.toThrow();
  });
});
