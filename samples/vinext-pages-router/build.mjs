// build.mjs
// Two-phase build:
//   1. vinext build (via Vite) → dist/server/entry.js + dist/client/
//   2. esbuild bundles everything into build/bundle.js for Spin's j2w
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { SpinEsbuildPlugin } from "@spinframework/build-tools/plugins/esbuild/index.js";

// Phase 1: Run vinext build to produce SSR server entry + client bundles
console.log('[build] Phase 1: Running vinext build...');
try {
  execSync('npx vinext build', { stdio: 'inherit', cwd: process.cwd() });
} catch (e) {
  console.error('[build] vinext build failed');
  process.exit(1);
}

// Phase 2: Collect client assets so they can be embedded in the bundle
console.log('[build] Phase 2: Collecting client assets...');
const clientDir = path.resolve('dist/client');
const clientAssets = {};

function collectFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip .vite metadata directory from client assets
      if (entry === '.vite') continue;
      collectFiles(fullPath, relativePath);
    } else {
      clientAssets['/' + relativePath] = fs.readFileSync(fullPath, 'utf-8');
    }
  }
}
collectFiles(clientDir);
console.log(`[build] Collected ${Object.keys(clientAssets).length} client assets`);

// Write embedded client assets module
const assetsModulePath = path.resolve('build/client-assets.js');
fs.mkdirSync(path.dirname(assetsModulePath), { recursive: true });
fs.writeFileSync(assetsModulePath, `export const clientAssets = ${JSON.stringify(clientAssets, null, 2)};\n`);

// Write the manifest
const manifestPath = path.resolve('dist/client/.vite/manifest.json');
let manifest = {};
if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}
const manifestModulePath = path.resolve('build/manifest.js');
fs.writeFileSync(manifestModulePath, `export const manifest = ${JSON.stringify(manifest, null, 2)};\n`);

const spinPlugin = await SpinEsbuildPlugin();

// Phase 3: Bundle server entry + Spin adapter into a single file
console.log('[build] Phase 3: Bundling for Spin...');
await build({
  entryPoints: ['./src/index.ts'],
  outfile: './build/bundle.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',     // Keep native class syntax for StarlingMonkey
  platform: 'browser',  // browser platform avoids Node.js builtins
  sourcemap: true,
  minify: false,
  plugins: [
    // Polyfill node:async_hooks with our simple implementation
    {
      name: 'polyfill-node-modules',
      setup(build) {
        // Redirect node:async_hooks to our polyfill
        build.onResolve({ filter: /^node:async_hooks$/ }, () => ({
          path: path.resolve('src/async-local-storage-polyfill.ts'),
        }));
        // Process is not available in StarlingMonkey, stub it
        build.onResolve({ filter: /^node:process$/ }, () => ({
          path: 'process-polyfill',
          namespace: 'polyfill',
        }));
        build.onLoad({ filter: /process-polyfill/, namespace: 'polyfill' }, () => ({
          contents: `export default { env: { NODE_ENV: 'production' } }; export const env = { NODE_ENV: 'production' };`,
          loader: 'js',
        }));
      },
    },
    spinPlugin,
  ],
  logLevel: 'info',
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.js': 'js',
  },
  resolveExtensions: ['.ts', '.tsx', '.js', '.mjs'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Allow external modules that can't be bundled (react is bundled from vinext output)
  external: [],
  sourceRoot: path.resolve(process.cwd(), 'src'),
});

console.log('[build] Build complete! Run: j2w -i build/bundle.js -o dist/vinext.wasm');