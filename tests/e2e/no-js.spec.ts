import { expect, test } from '@playwright/test';

const HARNESS = '/dev/story-smoke';

test.describe('no-JavaScript article layout', () => {
  test.use({ javaScriptEnabled: false });

  test('renders prose, formula, figure, citation, and a native Predict without a stage', async ({
    page,
  }) => {
    await page.goto(HARNESS);

    // The article is the only layout: no stage shell, canvas, controls, metrics,
    // or article-mode button that could do nothing without JavaScript.
    await expect(page.locator('[data-story-controller]')).toHaveCount(1);
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-controls-panel]')).toHaveCount(0);
    await expect(page.locator('[data-metrics]')).toHaveCount(0);
    await expect(page.getByTestId('article-mode-toggle')).toHaveCount(0);
    await expect(page.locator('[data-story-controller]')).not.toHaveAttribute(
      'data-story-enhanced',
    );

    // All four chapters and their prose are in the served HTML and visible.
    const chapters = page.locator('[data-story-chapter]');
    await expect(chapters).toHaveCount(4);
    const chapterTitles = ['The moving point', 'A closer look', 'The turn', 'Pulling back'];
    for (let index = 0; index < chapterTitles.length; index += 1) {
      const chapter = chapters.nth(index);
      await expect(chapter).toBeVisible();
      await expect(chapter.locator('.story-chapter__title')).toHaveText(
        chapterTitles[index] as string,
      );
      await expect(chapter.locator('.story-chapter__prose p').first()).toBeVisible();
    }

    // A formula survives as real text, not as a canvas or script.
    const formula = page.getByTestId('story-formula');
    await expect(formula).toBeVisible();
    await expect(formula).toContainText('τ');
    await expect(formula).toContainText('ρ');
    await expect(page.getByTestId('story-citation')).toBeVisible();

    // A static SVG figure with title/description is part of the article.
    const figure = page.getByTestId('story-figure');
    await expect(figure).toBeVisible();
    await expect(figure.locator('svg')).toBeVisible();
    await expect(figure.locator('figcaption')).toContainText('return edge');

    // A real, stable citation link with safe external-link rel values.
    const citation = page.getByTestId('story-citation');
    await expect(citation).toContainText('Dorigo');
    const doi = citation.locator('a');
    await expect(doi).toHaveAttribute('href', 'https://doi.org/10.1109/3477.484436');
    await expect(doi).toHaveAttribute('rel', /noopener/);
    await expect(doi).toHaveAttribute('rel', /noreferrer/);

    // Predict is native details/summary: the answer is closed until the reader
    // opens it, and opening works with no JavaScript at all.
    const predict = page.locator('[data-predict]');
    await expect(predict).toBeVisible();
    expect(await predict.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(false);
    await expect(page.locator('[data-predict-answer]')).not.toBeVisible();
    await predict.locator('summary').click();
    expect(await predict.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);
    await expect(page.locator('[data-predict-answer]')).toBeVisible();
    await expect(page.locator('[data-predict-answer]')).toContainText('No ant sees the whole tour');

    // Reading order is document order: h1, then the article example, then the
    // chapter headings, with the formula before the first chapter.
    const structure = await page.evaluate(() => {
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>('main h1, main h2'),
        (element) => ({ tag: element.tagName, text: element.textContent?.trim() ?? '' }),
      );
      return headings;
    });
    expect(structure[0]?.tag).toBe('H1');
    const exampleIndex = structure.findIndex((heading) =>
      heading.text.startsWith('Everything the article carries'),
    );
    const firstChapterIndex = structure.findIndex((heading) => heading.text === 'The moving point');
    expect(exampleIndex).toBeGreaterThan(0);
    expect(firstChapterIndex).toBeGreaterThan(0);
    expect(firstChapterIndex).toBeLessThan(exampleIndex);

    const chaptersBeforeFormula = await page.evaluate(() => {
      const formulaElement = document.querySelector('[data-testid="story-formula"]');
      const chapter = document.querySelector('[data-story-chapter]');
      if (!formulaElement || !chapter) return false;
      return Boolean(
        chapter.compareDocumentPosition(formulaElement) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(chaptersBeforeFormula).toBe(true);

    // The chapter rail is real links, so it remains useful without scripting.
    const rail = page.getByRole('navigation', { name: 'Chapters' });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('link')).toHaveCount(4);
    await expect(rail.getByRole('link', { name: /The turn/ })).toHaveAttribute('href', '#the-turn');
  });

  test('the second config also renders as a readable article with no empty stage', async ({
    page,
  }) => {
    await page.goto('/dev/pulse-smoke');

    await expect(page.locator('[data-story-controller]')).toHaveCount(1);
    await expect(page.locator('[data-story-stage]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-controls-panel]')).toHaveCount(0);

    const chapters = page.locator('[data-story-chapter]');
    await expect(chapters).toHaveCount(4);
    await expect(page.locator('.story-chapter__title')).toHaveText([
      'The pulse',
      'The interval',
      'The lattice',
      'The return',
    ]);
    for (let index = 0; index < 4; index += 1) {
      await expect(chapters.nth(index).locator('.story-chapter__prose p').first()).toBeVisible();
    }

    const rail = page.getByRole('navigation', { name: 'Chapters' });
    await expect(rail.getByRole('link')).toHaveCount(4);
    await expect(rail.getByRole('link', { name: /The lattice/ })).toHaveAttribute(
      'href',
      '#the-lattice',
    );
  });
});
