import { build as esbuild } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SHARED_APP_URL =
  'https://ais-pre-loeljmh5i7djjk542y33kg-858326687669.us-east1.run.app';

async function main() {
  const distAssetsDir = path.join(rootDir, 'dist', 'assets');
  if (!fs.existsSync(distAssetsDir)) {
    throw new Error(
      'No se encontró dist/assets. Ejecuta primero "npm run build" para compilar Tailwind CSS.'
    );
  }

  // 1. Read compiled Tailwind CSS from Vite build
  const cssFiles = fs
    .readdirSync(distAssetsDir)
    .filter((f) => f.endsWith('.css'));
  if (cssFiles.length === 0) {
    throw new Error('No se encontró archivo CSS compilado en dist/assets.');
  }
  const compiledCss = cssFiles
    .map((f) => fs.readFileSync(path.join(distAssetsDir, f), 'utf8'))
    .join('\n');

  // 2. Read institutional LUZ + Facultad de Ingeniería logo as base64 data URI
  const logoPath = path.join(rootDir, 'public', 'assets', 'luz-fing-logo.png');
  if (!fs.existsSync(logoPath)) {
    throw new Error('No se encontró public/assets/luz-fing-logo.png.');
  }
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  const logoDataUri = `data:image/png;base64,${logoBase64}`;

  // 3. Bundle entire React + TypeScript simulator into a single classic IIFE script
  // (works natively on file:// in Chrome, Edge, Firefox, Safari and PowerPoint WebView)
  const bundleResult = await esbuild({
    entryPoints: [path.join(rootDir, 'src', 'main.tsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [
      {
        name: 'ignore-css-imports',
        setup(buildApi) {
          buildApi.onLoad({ filter: /\.css$/ }, () => ({
            contents: '',
            loader: 'js',
          }));
        },
      },
    ],
  });

  if (!bundleResult.outputFiles || bundleResult.outputFiles.length === 0) {
    throw new Error('esbuild no generó salida JS.');
  }

  let bundledJs = bundleResult.outputFiles[0].text;

  // Replace root-relative logo path with embedded base64 PNG data URI
  bundledJs = bundledJs.split('/assets/luz-fing-logo.png').join(logoDataUri);

  // Safely escape any closing script tags inside string literals
  const safeJs = bundledJs.replace(/<\/script/gi, '<\\/script');
  const safeCss = compiledCss.replace(/<\/style/gi, '<\\/style');

  // 4. Assemble the single self-contained HTML file
  const standaloneHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LabTracción FINGLUZ — Laboratorio Virtual de Ensayo de Tracción</title>
    <meta name="description" content="Simulador interactivo portable de una Máquina Universal de Ensayos desarrollado por el Prof. Ing. José Manuel Faría — Universidad del Zulia, Facultad de Ingeniería." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..600&family=IBM+Plex+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet" />
    <style>${safeCss}</style>
  </head>
  <body class="bg-[#F5F7FA] text-slate-950 font-bold antialiased selection:bg-blue-100 selection:text-blue-950">
    <div id="root"></div>
    <script>
      window.__LABTRACCION_STANDALONE__ = true;
      window.__LABTRACCION_API_BASE__ = ${JSON.stringify(SHARED_APP_URL)};
    </script>
    <script>${safeJs}</script>
  </body>
</html>
`;

  const outPath = path.join(
    rootDir,
    'public',
    'LabTraccion_FINGLUZ_Presentacion.html'
  );
  fs.writeFileSync(outPath, standaloneHtml, 'utf8');

  // Also mirror into dist/ if dist exists so production static serving has it immediately
  const distOutPath = path.join(
    rootDir,
    'dist',
    'LabTraccion_FINGLUZ_Presentacion.html'
  );
  if (fs.existsSync(path.join(rootDir, 'dist'))) {
    fs.writeFileSync(distOutPath, standaloneHtml, 'utf8');
  }

  const sizeKb = (Buffer.byteLength(standaloneHtml, 'utf8') / 1024).toFixed(1);
  console.log(
    `Standalone HTML generated successfully: public/LabTraccion_FINGLUZ_Presentacion.html (${sizeKb} KB)`
  );
}

main().catch((err) => {
  console.error('Error building standalone HTML:', err);
  process.exit(1);
});
