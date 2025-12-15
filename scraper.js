const { chromium } = require('playwright');
const fs = require('fs');

/* ---------- AUTO SCROLL (TRIGGER LAZY LOAD) ---------- */
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
        ? 'https://www.bayut.com/companies/search/'
        : `https://www.bayut.com/companies/search/page-${i}/`;

    console.log(`➡️ Visiting ${url}`);

    let loaded = false;

    // retry page load
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`   Attempt ${attempt}`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 90000
        });
        loaded = true;
        break;
      } catch {
        console.log(`   ⏱️ Timeout, retrying...`);
        await page.waitForTimeout(5000);
      }
    }

    if (!loaded) {
      console.log(`   ❌ Skipping page ${i}`);
      continue;
    }

    // wait for agency cards
    try {
      await page.waitForSelector('article[role="article"]', {
        timeout: 30000
      });
    } catch {
      console.log(`   ⚠️ No agency cards found, skipping`);
      continue;
    }

    // trigger lazy-load
    await autoScroll(page);
    await page.waitForTimeout(2000);

    const cards = await page.$$('article[role="article"]');
    console.log(`   Found ${cards.length} agencies`);

    for (const card of cards) {
      try {
        const name = await card
          .$eval('a', el => el.innerText.trim())
          .catch(() => '');

        const link = await card
          .$eval('a', el => el.href)
          .catch(() => '');

        if (name && link) {
          results.push({
            company_name: name,
            agency_url: link
          });
        }
      } catch {
        // skip broken card
      }
    }
  }

  // deduplicate
  const unique = Array.from(
    new Map(results.map(r => [r.agency_url, r])).values()
  );

  // save CSV
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
