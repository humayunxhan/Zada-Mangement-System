import { build } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await build({ build: { outDir: 'dist-php', emptyOutDir: true }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('') } });
const allowedRoot = new Set(['assets', 'api', 'index.html', 'logo.png', '.htaccess', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icons']);
for (const entry of await readdir('dist-php')) {
    if (!allowedRoot.has(entry)) throw new Error(`Unexpected deployment file: ${entry}`);
}
const allowedApi = new Set(['index.php', 'config.php', 'db.php', 'jwt.php', 'ledger.php', 'finance.php', 'records.php']);
for (const entry of await readdir('dist-php/api')) {
    if (!allowedApi.has(entry)) throw new Error(`Unexpected API file: ${entry}`);
}
const config = await readFile(path.join('dist-php', 'api', 'config.php'), 'utf8');
if (config.includes('admin123') || config.includes('db_pass')) throw new Error('Secrets or default credentials found in public release');
console.log('PHP-only release verified: dist-php contains static frontend + PHP API, no Node server, Electron or dependencies.');
