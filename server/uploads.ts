import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IMAGE_MIMES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES, MAX_THUMBNAIL_BYTES, MAX_IMAGES, type ImageAttachment, type ImageMime } from '../shared/types.ts';
import type { RunImage } from './agents/runner.ts';

/** Never inside the user's project: agents only get these paths, they don't land in a commit. */
const UPLOADS = join(tmpdir(), 'virtualof-uploads');

const EXTENSIONS: Record<ImageMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Whether the bytes really are the format the page said, so the SDKs don't reject them later. */
function matches(mime: ImageMime, bytes: Buffer) {
  const hex = bytes.subarray(0, 12).toString('hex');
  if (mime === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mime === 'image/gif') return hex.startsWith('474946383');
  return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250'; // RIFF....WEBP
}

/** Checks the images a message brought. Returns them, or a message for the user. */
export function checkImages(raw: unknown): { images: ImageAttachment[] } | { error: string } {
  if (raw === undefined || raw === null) return { images: [] };
  if (!Array.isArray(raw)) return { error: 'Não consegui ler as imagens anexadas.' };
  if (raw.length > MAX_IMAGES) return { error: `Mande no máximo ${MAX_IMAGES} imagens por mensagem.` };
  const images: ImageAttachment[] = [];
  let total = 0;
  for (const item of raw as Partial<ImageAttachment>[]) {
    const name = typeof item?.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 120) : 'imagem';
    if (!item || !IMAGE_MIMES.includes(item.mime as ImageMime)) {
      return { error: `"${name}" não é uma imagem aceita. Use PNG, JPEG, GIF ou WebP.` };
    }
    if (typeof item.data !== 'string' || !BASE64.test(item.data)) return { error: `Não consegui ler a imagem "${name}".` };
    if (item.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return { error: `"${name}" excede o limite por imagem.` };
    const bytes = Buffer.from(item.data, 'base64');
    total += bytes.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) return { error: 'As imagens juntas passam de 15 MB.' };
    if (bytes.length > MAX_IMAGE_BYTES) return { error: `"${name}" passa de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Mande uma imagem menor.` };
    if (!matches(item.mime as ImageMime, bytes)) return { error: `"${name}" não parece ser ${item.mime}.` };
    let thumbnail: ImageAttachment['thumbnail'];
    if (item.thumbnail !== undefined) {
      const preview = item.thumbnail;
      if (preview?.mime !== 'image/jpeg' || typeof preview.data !== 'string' ||
          preview.data.length > Math.ceil(MAX_THUMBNAIL_BYTES / 3) * 4 || !BASE64.test(preview.data)) {
        return { error: `Miniatura inválida: "${name}".` };
      }
      const decoded = Buffer.from(preview.data, 'base64');
      if (decoded.length > MAX_THUMBNAIL_BYTES || !matches('image/jpeg', decoded)) return { error: `Miniatura inválida: "${name}".` };
      thumbnail = { mime: 'image/jpeg', data: preview.data };
    }
    images.push({ name, mime: item.mime as ImageMime, data: item.data, thumbnail });
  }
  return { images };
}

/** Writes each image to a temp file for the agents. */
export function saveImages(images: ImageAttachment[]): RunImage[] {
  if (!images.length) return [];
  mkdirSync(UPLOADS, { recursive: true });
  const saved: RunImage[] = [];
  try {
    for (const image of images) {
      const path = join(UPLOADS, `${randomUUID()}.${EXTENSIONS[image.mime]}`);
      // Include this path before writing: a failed write may leave a partial file too.
      saved.push({ ...image, path });
      writeFileSync(path, Buffer.from(image.data, 'base64'));
    }
    return saved;
  } catch (error) {
    try { discardImages(saved); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Falha ao salvar imagens e remover os arquivos temporários.');
    }
    throw error;
  }
}

/** Deletes the temp files once the task that needed them is over. */
export function discardImages(images: RunImage[]) {
  const errors: unknown[] = [];
  for (const image of images) {
    try { rmSync(image.path, { force: true }); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Não foi possível remover todas as imagens temporárias.');
}
