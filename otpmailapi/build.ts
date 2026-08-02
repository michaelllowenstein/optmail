import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

const isProd = process.argv.includes('--env=production');

esbuild
  .build({
    entryPoints: ['src/api.ts'],
    bundle: true,
    outdir: 'dist',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: !isProd,
    minify: isProd,
    plugins: [nodeExternalsPlugin()],
    alias: {
      '@config': './src/config/index.ts',
      '@plugins': './src/plugins',
      '@routes': './src/routes',
      '@services': './src/services',
      '@db': './src/db',
      '@schema': './src/schema',
      '@types': './src/types',
    },
  })
  .then(() => console.log('✓ Build complete'))
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });