#!/usr/bin/env node
/**
 * Record a short design-review capture of the story runtime.
 *
 * Usage:
 *   pnpm build
 *   node scripts/capture-runtime.mjs
 *
 * The script starts `astro preview` on 127.0.0.1:4399, records the first
 * development story at 1440×900 (scroll, pause, speed, article mode, share),
 * and writes an ignored WebM under `test-results/design-review/`. Nothing is
 * committed: the artifact is for design review only.
 *
 * Requires Playwright's Chromium (`pnpm exec playwright install chromium`).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const PORT = 4399;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = path.resolve('test-results/design-review');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'story-runtime-review.webm');

function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // The preview server is still starting.
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(poll, 200);
    };
    void poll();
  });
}

async function main() {
  if (!existsSync(path.resolve('dist/index.html'))) {
    console.error('[capture-runtime] dist/ is missing. Run `pnpm build` first.');
    process.exit(2);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const server = spawn(
    'pnpm',
    ['exec', 'astro', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--ignore-lock'],
    { stdio: 'ignore', env: process.env },
  );

  const stopServer = () => {
    if (!server.killed) server.kill('SIGTERM');
  };
  process.on('exit', stopServer);

  try {
    await waitForServer(BASE_URL);

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            // The share status message is the visible result in the capture.
          },
        },
      });
    });

    const page = await context.newPage();
    const video = page.video();
    await page.goto(`${BASE_URL}/dev/story-smoke?lenis=off`);
    await page.waitForFunction(() => {
      const controller = document.querySelector('[data-story-controller]');
      const stage = document.querySelector('[data-story-stage]');
      return (
        controller?.dataset.storyController === 'ready' && stage?.dataset.stageStatus === 'ready'
      );
    });

    const hold = (milliseconds) => page.waitForTimeout(milliseconds);

    const scrollToChapter = async (id) => {
      await page.evaluate((chapterId) => {
        const element = document.getElementById(chapterId);
        if (!element) throw new Error(`Missing chapter ${chapterId}`);
        const top =
          element.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + 40;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }, id);
      await hold(1_100);
    };

    // A quiet lead-in, then the chapter sequence.
    await hold(1_000);
    await scrollToChapter('a-closer-look');
    await scrollToChapter('the-turn');
    await scrollToChapter('pulling-back');

    // Pause, read the frozen frame, resume, then run at 2×.
    await page.getByTestId('stage-play-pause').click();
    await hold(1_300);
    await page.getByTestId('stage-play-pause').click();
    await hold(500);
    await page.getByTestId('stage-speed').selectOption('2');
    await hold(900);

    // Article mode and back, then share.
    await page.getByTestId('article-mode-toggle').click();
    await hold(1_500);
    await page.getByTestId('article-mode-toggle').click();
    await hold(900);
    await page.getByTestId('stage-share').click();
    await hold(1_300);

    // Close on the stage.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await hold(1_200);

    await page.close();
    const rawPath = await video.path();
    await context.close();
    await browser.close();

    await rename(rawPath, OUTPUT_FILE);
    const { size } = await stat(OUTPUT_FILE);
    console.log(`[capture-runtime] wrote ${OUTPUT_FILE} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  } finally {
    stopServer();
  }
}

await main();
