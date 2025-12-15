const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];
  const maxPages = 368;

  for (let i = 1; i <= maxPages; i++) {
    const url =
      i === 1
        ? 'https://www.bayut.com/companies/'
        : `https://www.bayut.com/companies/page-${i}/`;

    console.log(`Scraping ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const agencies = await page.$$('[data-testid="agency-card"]');

    for (const agency of agencies) {
      const name = await agency.$eval('h2', el => el.innerText).catch(() => '');
      const link = await agency.$eval('a', el => el.href).catch(() => '');
      const listings = await agency
        .$eval('span', el => el.innerText)
        .catch(() => '');

      if (name && link) {
        results.push({
          company_name: name.trim(),
          agency_url: link,
          listings: listings.trim()
        });
      }
    }
  }

  // Remove duplicates
  const unique = Array.from(
    new Map(results.map(x => [x.agency_url, x])).values()
  );

  // Save CSV
  const csv =
    'company_name,agency_url,listings\n' +
    unique
      .map(
        r =>
          `"${r.company_name.replace(/"/g, '""')}","${r.agency_url}","${r.listings}"`
      )
      .join('\n');

  fs.writeFileSync('bayut_agencies.csv', csv);
  await browser.close();
})();
