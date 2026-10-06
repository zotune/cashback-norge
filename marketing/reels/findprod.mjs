import { chromium } from 'playwright';
const [,, url, sel] = process.argv;
const b = await chromium.launch({channel:'chrome'});
const p = await (await b.newContext({locale:'nb-NO'})).newPage();
await p.goto(url, {waitUntil:'domcontentloaded', timeout:60000}); await p.waitForTimeout(4000);
const links = await p.$$eval('a[href]', as => as.map(a=>a.href));
console.log([...new Set(links.filter(h=>new RegExp(process.argv[3]).test(h)))].slice(0,8).join('\n'));
await b.close();
