import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  publicDir: path.resolve(__dirname, '../client/public'),
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // allow importing and serving files from our project tree and linked
      // workspace packages.  missing the renderer folder itself previously
      // caused "outside of allow list" warnings when electron requested the
      // HTML file.
      allow: [
        path.resolve(__dirname, './src/renderer'),
        path.resolve(__dirname, '../client/src'),
        path.resolve(__dirname, '../../packages'),
        path.resolve(__dirname, '../../node_modules'),
      ],
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      // when we build the renderer we want all required modules bundled into
      // the output; earlier resolution problems are handled by aliases and an
      // expanded `resolve.modules` search path, so we no longer need to treat
      // the JSX runtime as external.
    },
  },
  optimizeDeps: {
    include: ['react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  define: {
    VITE_APP_VERSION: JSON.stringify(pkg.version)
  },
  resolve: {
    // also look in the ui package's own node_modules during resolution so
    // imports from that source tree (e.g. radix packages) can be found.
    modules: [
      path.resolve(__dirname, '../../packages/ui/node_modules'),
      'node_modules',
    ],
    alias: {
      '@/helpers/storage': path.resolve(__dirname, './src/renderer/helpers/storage.ts'),
      '@': path.resolve(__dirname, '../client/src'),
      '@sharkord/shared': path.resolve(__dirname, '../../packages/shared'),
      '@sharkord/ui': path.resolve(__dirname, '../../packages/ui/src'),
      // ensure the automatic JSX runtime imports always resolve to the
      // electron project's react installation instead of trying to walk up
      // from packages/ui (which has no node_modules).  This mirrors the
      // behaviour we already rely on for React itself.
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
    },
  },
})

