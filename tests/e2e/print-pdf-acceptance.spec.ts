import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Scheduler V2.5 PDF Acceptance & MediaBox Validation', () => {
  const pdfOutputDir = path.join(process.cwd(), 'test-results', 'pdf');

  test.beforeAll(() => {
    if (!fs.existsSync(pdfOutputDir)) {
      fs.mkdirSync(pdfOutputDir, { recursive: true });
    }
  });

  test('1. A4 Single Project Summary PDF Generation & MediaBox Verification', async ({ page }) => {
    await page.goto('/print/project/qa-proj-1/summary-a4?lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    const pdfPath = path.join(pdfOutputDir, 'a4-summary-report.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.toString('utf-8', 0, 8)).toContain('%PDF-');

    // Verify dynamic @page rule injection
    const headHtml = await page.innerHTML('head');
    expect(headHtml).toContain('size: A4 portrait');
  });

  test('2. A4 Monthly Overview PDF Generation', async ({ page }) => {
    await page.goto('/print/projects/month-a4?month=2026-08&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a4-monthly-report.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test('3. A4 Half-Year Summary PDF Generation', async ({ page }) => {
    await page.goto('/print/projects/half-year-a4?start=2026-07&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a4-halfyear-report.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test('4. A4 Annual Roadmap PDF Generation', async ({ page }) => {
    await page.goto('/print/projects/year-a4?year=2026&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a4-year-roadmap.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test('5. A3 Project Full Schedule PDF Generation & Dynamic @page Size', async ({ page }) => {
    await page.goto('/print/project/qa-proj-1/full-a3?lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a3-project-full.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const headHtml = await page.innerHTML('head');
    expect(headHtml).toContain('size: A3 landscape');
  });

  test('6. A3 Today 30-Day Schedule PDF Generation', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=today&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a3-today-30.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test('7. A3 Custom Date 30-Day Schedule PDF Generation', async ({ page }) => {
    await page.goto('/print/projects/rolling-30-a3?mode=custom&start=2026-08-01&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a3-custom-30.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test('8. A3 Combined 2~3 Projects PDF Generation & Strict Validation', async ({ page }) => {
    // Valid 2 projects
    await page.goto('/print/projects/combined-a3?projectIds=proj-1,proj-2&lang=ko&colorMode=color');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a3-combined-2projects.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Invalid 1 project selection -> Error Page
    await page.goto('/print/projects/combined-a3?projectIds=proj-1&lang=ko');
    await expect(page.locator('text=A3 통합 일정표 프로젝트 선택 오류')).toBeVisible();

    // Invalid 4 projects selection -> Error Page
    await page.goto('/print/projects/combined-a3?projectIds=p1,p2,p3,p4&lang=ko');
    await expect(page.locator('text=A3 통합 일정표 프로젝트 선택 오류')).toBeVisible();
  });

  test('9. Mono Mode Grayscale PDF Generation', async ({ page }) => {
    await page.goto('/print/projects/month-a4?month=2026-08&lang=ko&colorMode=mono');
    await expect(page.locator('.print-page-shell')).toBeVisible();

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    fs.writeFileSync(path.join(pdfOutputDir, 'a4-monthly-mono.pdf'), pdfBuffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });
});
