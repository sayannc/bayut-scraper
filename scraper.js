const { chromium } = require('playwright');
const fs = require('fs');

/* ---------- AUTO SCROLL (FOR LAZY LOAD) ---------- */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 600;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

/* ---------- MAIN SCRAPER ---------- */
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });

  const results = [];
  const MAX_PAGES = 368;

  for (let i = 1; i <= MAX_PAGES; i++) {
    const url =
      i === 1
        ? 'https://www.bayut.com/companies/'
        : `https://www.bayut.com/companies/page-${i}/`;

    console.log(`➡️ Visiting ${url}`);

    let loaded = false;

    /* ---------- RETRY PAGE LOAD ---------- */
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`   Attempt ${attempt}`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 90000
        });
        loaded = true;
        break;
      } catch (err) {
        console.log(`   ⏱️ Timeout on attempt ${attempt}`);
        await page.waitForTimeout(5000);
      }
    }

    if (!loaded) {
      console.log(`   ❌ Skipping page ${i}`);
      continue;
    }

    /* ---------- WAIT FOR AGENCY CARDS ---------- */
    try {
      await page.waitForSelector('[data-testid="agency-card"]', {
        timeout: 30000
      });
    } catch {
      console.log(`   ⚠️ No agency cards found, skipping`);
      continue;
    }

    /* ---------- TRIGGER LAZY LOAD ---------- */
    await autoScroll(page);
    await page.waitForTimeout(2000);

    const cards = await page.$$('[data-testid="agency-card"]');
    console.log(`   Found ${cards.length} agencies`);

    /* ---------- EXTRACT DATA ---------- */
    for (const card of cards) {
      try {
        const name = await card.$eval('h2', el => el.innerText.trim());
        const link = await card.$eval('a', el => el.href);
        const listings = await card
          .$eval('span', el => el.innerText.trim())
          .catch(() => '');

        if (name && link) {
          results.push({
            company_name: name,
            agency_url: link,
            listings: listings
          });
        }
      } catch {
        // skip broken card
      }
    }
  }

  /* ---------- DEDUPLICATE ---------- */
  const unique = Array.from(
    new Map(results.map(r => [r.agency_url, r])).values()
  );

  /* ---------- SAVE CSV ---------- */
  const csv =
    'company_name,agency_url,listings\n' +
    unique
      .map(
        r =>
          `"${r.company_name.replace(/"/g, '""')}","${r.agency_url}","${r.listings}"`
      )
      .join('\n');

  fs.writeFileSync('bayut_agencies.csv', csv);
  console.log(`✅ Saved ${unique.length} unique agencies`);

  await browser.close();
})();
