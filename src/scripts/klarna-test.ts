import { chromium } from "playwright";

async function check() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "nb-NO",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const page = await context.newPage();

  // Capture JSON API responses  
  const apiCalls: Array<{url: string, status: number, length: number, preview: string}> = [];
  
  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("json") && (url.includes("store") || url.includes("cashback") || url.includes("bff"))) {
      try {
        const body = await res.text();
        apiCalls.push({ url, status: res.status(), length: body.length, preview: body.substring(0, 500) });
      } catch {}
    }
  });

  console.log("Navigating to store page...");
  await page.goto("https://www.klarna.com/no/store/?type=CASHBACK", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  // Count initial stores
  let storeCount = await page.$$eval("a[href*='gotostore']", (links) => links.length);
  console.log("Initial store links:", storeCount);

  // Scroll down to load more stores
  let prevCount = 0;
  let scrollAttempts = 0;
  while (storeCount !== prevCount && scrollAttempts < 30) {
    prevCount = storeCount;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    storeCount = await page.$$eval("a[href*='gotostore']", (links) => links.length);
    scrollAttempts++;
    if (storeCount !== prevCount) {
      console.log(`  Scroll ${scrollAttempts}: ${storeCount} stores`);
    }
  }

  // Extract all store data
  const stores = await page.$$eval("a[href*='gotostore']", (links) =>
    links.map((a) => {
      const href = a.getAttribute("href") || "";
      const uuidMatch = href.match(/store\/([a-f0-9-]+)/);
      const text = a.textContent?.trim() || "";
      const cashbackMatch = text.match(/([\d,]+)%\s*cashback/i);
      return {
        name: text.replace(/Logo.*$/i, "").replace(/[\d,]+%.*$/i, "").trim(),
        cashback: cashbackMatch?.[1] ? `${cashbackMatch[1]}%` : "unknown",
        uuid: uuidMatch?.[1] || "",
      };
    })
  );

  console.log("\n=== ALL STORES ===");
  console.log("Total:", stores.length);
  stores.forEach((s) => console.log(`  ${s.name} - ${s.cashback} (${s.uuid})`));

  console.log("\n=== STORE API CALLS ===");
  apiCalls.forEach((c) => {
    console.log(`\n${c.status} ${c.url}`);
    console.log(`  ${c.length} bytes: ${c.preview.substring(0, 300)}`);
  });

  await browser.close();
}

check().catch((e) => console.error(e.message, e.stack));
