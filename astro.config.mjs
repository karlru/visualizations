// @ts-check

import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { SITE_URL } from './src/config/site.ts';

// https://astro.build/config
export default defineConfig({
  // Provisional production URL. Step 0.6 replaces it with the deployed
  // workers.dev URL once the Cloudflare project exists. It lives in
  // src/config/site.ts so canonicals, tests, and the config share one origin.
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  /*
   * Astro 7 renders Markdown with Sätteri by default, which does not run
   * remark/rehype plugins. Math needs the unified pipeline: `remark-math`
   * turns `$...$` / `$$...$$` into math nodes, and `rehype-katex` renders them
   * to static HTML + MathML at build time. MDX inherits this processor, so the
   * `.mdx` story bodies use the same math pipeline as `.md` pages.
   *
   * `throwOnError` makes a malformed expression fail the build instead of
   * printing a red error node. `output: 'htmlAndMathml'` keeps the MathML copy
   * that screen readers consume.
   */
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [
          rehypeKatex,
          {
            throwOnError: true,
            output: 'htmlAndMathml',
            strict: 'ignore',
          },
        ],
      ],
    }),
  },
  integrations: [
    svelte(),
    mdx(),
    sitemap({
      // Development specimen pages stay in the build for Playwright, but they
      // are not public routes. OG images and the 404 page are not indexable.
      filter: (page) => !page.includes('/dev/') && !page.endsWith('/404') && !page.includes('/og/'),
    }),
  ],
});
