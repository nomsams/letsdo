import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: '0.0.0.0', watch: { ignored: ['**/.publish/**', '**/dist/**'] } }, build: { target: 'es2022' } });
