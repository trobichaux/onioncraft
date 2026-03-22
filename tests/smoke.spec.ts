import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('OnionCraft');
});

test('has legal disclaimer in footer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('ArenaNet');
});

test('skip link is present', async ({ page }) => {
  await page.goto('/');
  const skipLink = page.locator('a.skip-link');
  await expect(skipLink).toHaveAttribute('href', '#main-content');
});
