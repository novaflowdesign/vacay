import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://novaflowdesign.github.io',
  base: '/vacay',
  integrations: [react()],
  devToolbar: { enabled: false }
});