const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('http://localhost:8000/user-dashboard.html', {waitUntil: 'networkidle0'});
    
    await browser.close();
})();
