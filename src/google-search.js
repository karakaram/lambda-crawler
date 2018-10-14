'use strict';

const launchChrome = require('@serverless-chrome/lambda');
const CDP = require('chrome-remote-interface');
const puppeteer = require('puppeteer');

module.exports.main = async (event, context, callback) => {
    let slsChrome = null;
    let browser = null;
    let page = null;

    try {
        slsChrome = await launchChrome({
            flags: ['--headless'],
        });
        browser = await puppeteer.connect({
            browserWSEndpoint: (await CDP.Version()).webSocketDebuggerUrl
        });
        page = await browser.newPage();

        await page.goto('https://www.google.co.jp/', { waitUntil: 'domcontentloaded' });

        const title = await page.evaluate(() => {
            return document.title
        });
        console.log(title);

        await page.goto(`https://www.google.co.jp/search?q=${event.searchWord}`, { waitUntil: 'domcontentloaded' });
        const searchResults = await page.evaluate(() => {
            const ret = [];
            const nodeList = document.querySelectorAll("div#search h3")

            nodeList.forEach(node => {
                ret.push(node.innerText)
            });

            return ret
        });
        console.log(searchResults);

        return callback(null, JSON.stringify({ result: 'OK'}));
    } catch (err) {
        console.error(err);
        return callback(null, JSON.stringify({ result: 'NG' }));
    } finally {
        if (page) {
            await page.close();
        }

        if (browser) {
            await browser.disconnect();
        }

        if (slsChrome) {
            await slsChrome.kill();
        }
    }
};
