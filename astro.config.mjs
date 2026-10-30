// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import { defineConfig } from 'astro/config';
import { SITE_URL } from './src/config/site.ts';

// https://astro.build/config
export default defineConfig({
  // Provisional production URL. Step 0.6 replaces it with the deployed
  // workers.dev URL once the Cloudflare project exists. It lives in
  // src/config/site.ts so canonicals, tests, and the config share one origin.
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  integrations: [svelte(), mdx(), sitemap()],
});
