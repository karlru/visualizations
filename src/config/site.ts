/**
 * Site-wide identity shared by the layout, the SEO component, and tests.
 *
 * `SITE_URL` is the production origin attached as a Cloudflare Workers custom
 * domain in `wrangler.jsonc`. Keep it identical to `site` in astro.config.mjs.
 */
export const SITE_NAME = 'Algorithm Stories';

export const SITE_URL = 'https://visualizations.ruul.ee';

export const SITE_DESCRIPTION =
  'Interactive, scroll-driven visual essays that explain algorithms from the inside.';
