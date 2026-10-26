import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startOffice } from './app.ts';

// Development entry (npm start): the page comes from Vite so edits show up right away.
const office = await startOffice({ web: 'dev', root: fileURLToPath(new URL('..', import.meta.url)) });

console.log(`\n  Escritório aberto em ${office.url}\n  Deixe esta janela aberta; fechar ela desliga o escritório.\n`);
if (process.argv.includes('--abrir')) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', office.url]] : ['open', [office.url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}
