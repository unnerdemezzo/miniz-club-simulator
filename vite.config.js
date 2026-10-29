import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// La versione mostrata nell'app viene sempre da package.json: va aumentata a ogni deploy su Vercel
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
