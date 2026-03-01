import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'src/renderer/index.html'),
    path.join(__dirname, 'src/renderer/**/*.{ts,tsx,js,jsx}'),
    path.join(projectRoot, 'apps/client/src/**/*.{ts,tsx,js,jsx}'),
    path.join(projectRoot, 'packages/ui/src/**/*.{ts,tsx,js,jsx}'),
  ],
}

