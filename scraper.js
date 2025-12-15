const { chromium } = require('playwright');
const fs = require('fs');

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 2000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });

  const page = await context.newPage();

  const results = [];
  const MAX_PAGES = 368;

  for (let i = 1; i <= MAX_PAGES; i++) {
    const url =
      i === 1
        ? 'https://www.bayut.com/companies/search/'
        : `https://www.bayut.com/companies/search/page-${i}/`;

    console.log(`➡️ Visiting ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 90000
      });
    } catch {
      console.log('   ❌ Page load failed, skipping');
      continue;
    }

    // Accept cookies if banner appears
    try {
      const acceptBtn = await page.waitForSelector(
        'button:has-text("Accept")',
        { timeout: 5000 }
      );
      await acceptBtn.click();
      await page.waitForTimeout(2000);
    } catch {
      // cookie banner not present
    }

    // Scroll to trigger React render
    await autoScroll(page);
    await page.waitForTimeout(3000);

    let cards;
    try {
      cards = await page.$$('article');
    } catch {
      console.log('   ⚠️ No articles found');
      continue;
    }

    console.log(`   Found ${cards.length} agencies`);

    for (const card of cards) {
      try {
        const link = await card
          .$eval('a', el => el.href)
          .catch(() => '');

        const name = await card
          .$eval('a', el => el.innerText.trim())
          .catch(() => '');

        if (name && link) {
          results.push({
            company_name: name,
            agency_url: link
          });
        }
      } catch {}
    }
  }

  const unique = Array.from(
    new Map(results.map(r => [r.agency_url, r])).values()
  );

  const csv =
    'company_name,agency_url\n' +
    unique
      .map(
        r =>
          `"${r.company_name.replace(/"/g, '""')}","${r.agency_url}"`
      )
      .join('\n');

  fs.writeFileSync('bayut_agencies.csv', csv);
  console.log(`✅ Saved ${unique.length} unique agencies`);

  await browser.close();
})();
