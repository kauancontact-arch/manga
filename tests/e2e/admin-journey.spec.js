/**
 * E2E de navegador (Playwright).
 *
 * Não roda no ambiente de build usado para desenvolver o projeto porque não há
 * navegador instalado lá. Para executar localmente:
 *
 *   npm i -D @playwright/test && npx playwright install chromium
 *   npm run migrate && npm run seed
 *   ADMIN_INITIAL_PASSWORD='...' npm run bootstrap:admin
 *   npm start   (em outro terminal)
 *   npx playwright test
 *
 * A jornada equivalente já é coberta, no nível HTTP, por
 * tests/integration/journey.test.js, que roda na suíte padrão.
 */
import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const USER = process.env.E2E_ADMIN_USER || 'kauan';
const PASS = process.env.E2E_ADMIN_PASSWORD || '';

test.describe('leitura pública', () => {
  test('o visitante lê um mangá no celular sem cadastro', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('próximo capítulo');

    await page.getByRole('link', { name: 'Ler os mangás' }).click();
    await expect(page).toHaveURL(/\/mangas/);

    const primeira = page.locator('.manga-card').first();
    await expect(primeira).toBeVisible();
    await primeira.click();

    await page.getByRole('link', { name: 'Ler agora' }).click();
    await expect(page).toHaveURL(/\/ler$/);
    await expect(page.locator('[data-page]').first()).toBeVisible();

    // Navegação por teclado e modo página a página.
    await page.getByRole('button', { name: 'Página a página' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-page][data-active="true"]')).toHaveCount(1);

    await expect(page.getByText('Transcrição acessível')).toBeVisible();
  });

  test('a página individual traz metadados sociais', async ({ page, request }) => {
    await page.goto(`${BASE}/mangas`);
    const href = await page.locator('.manga-card').first().getAttribute('href');
    const res = await request.get(`${BASE}${href}`);
    const html = await res.text();
    expect(html).toContain('og:image');
    expect(html).toContain('rel="canonical"');
  });
});

test.describe('painel editorial', () => {
  test.skip(!PASS, 'defina E2E_ADMIN_PASSWORD para rodar a jornada administrativa');

  test('login, gerador social e fila de revisão', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await page.fill('input[name="username"]', USER);
    await page.fill('input[name="password"]', PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();

    await page.getByRole('link', { name: 'Gerador de roteiros' }).click();
    await page.selectOption('select[name="preset"]', 'P01');
    await page.getByRole('button', { name: 'Gerar roteiro' }).click();
    await expect(page.locator('[data-script-box]')).toContainText('Nós vamos transformar um comentário deste vídeo em um mangá de verdade.');
    await expect(page.locator('[data-script-box]')).not.toContainText('[TEMA DA SEMANA]');
    await expect(page.locator('[data-duration-out]')).toContainText('palavras');

    await page.getByRole('link', { name: 'Revisão' }).click();
    await expect(page.getByRole('heading', { name: 'Revisão' })).toBeVisible();
  });
});
