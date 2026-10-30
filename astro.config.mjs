// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Provisional production URL. Step 0.6 replaces it with the deployed
  // workers.dev URL once the Cloudflare project exists.
  site: 'https://algorithm-stories.example.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [svelte(), mdx(), sitemap()],
});
