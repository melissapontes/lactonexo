// Gera todos os ícones e telas de abertura (splash) a partir de public/logo.svg.
// Rodar depois de trocar o logo: npm run icons
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(raiz, 'public');
const logo = await readFile(path.join(pub, 'logo.svg'));
const splash = JSON.parse(await readFile(path.join(raiz, 'scripts/splash.json'), 'utf8'));
const config = await readFile(path.join(raiz, 'src/config/app.ts'), 'utf8');
const corTema = config.match(/corTema:\s*'([^']+)'/)[1];
const corFundo = config.match(/corFundo:\s*'([^']+)'/)[1];

await mkdir(path.join(pub, 'icons'), { recursive: true });
await mkdir(path.join(pub, 'splash'), { recursive: true });

const png = (tamanho) => sharp(logo, { density: 384 }).resize(tamanho, tamanho).png();

for (const t of [48, 72, 96, 128, 144, 152, 192, 256, 384, 512]) {
  await png(t).toFile(path.join(pub, 'icons', `icon-${t}.png`));
}
// Maskable: logo ocupando 70% (zona segura) sobre fundo da cor do tema.
for (const t of [192, 512]) {
  const interno = Math.round(t * 0.7);
  const img = await png(interno).toBuffer();
  await sharp({ create: { width: t, height: t, channels: 4, background: corTema } })
    .composite([{ input: img, gravity: 'center' }])
    .png()
    .toFile(path.join(pub, 'icons', `maskable-${t}.png`));
}
// apple-touch-icon: iOS não aceita transparência; fundo sólido.
{
  const img = await png(180).toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: corTema } })
    .composite([{ input: img }])
    .flatten({ background: corTema })
    .png()
    .toFile(path.join(pub, 'apple-touch-icon.png'));
}
await png(32).toFile(path.join(pub, 'favicon-32.png'));

for (const s of splash) {
  const W = s.w * s.dpr, H = s.h * s.dpr;
  const lado = Math.round(Math.min(W, H) * 0.32);
  const img = await png(lado).toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: corFundo } })
    .composite([{ input: img, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(pub, 'splash', `splash-${W}x${H}.png`));
}
console.log('Ícones e splash gerados.');
