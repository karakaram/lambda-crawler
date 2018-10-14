'use strict';

const launchChrome = require('@serverless-chrome/lambda');
const CDP = require('chrome-remote-interface');
const puppeteer = require('puppeteer');

module.exports.main = async (event, context, callback) => {
    console.log(context);
    // const req = JSON.parse(event.body);
    // if (req.TOKEN != process.env.TOKEN) {
    //     return {
    //         statusCode: 400,
    //         body: JSON.stringify({
    //             message: 'Bad Request',
    //             input: event.body
    //         }),
    //     };
    // }

    let slsChrome = null;
    let browser = null;
    let page = null;

    const proxyUrl = process.env.PROXY_SERVER;
    const proxyUserName = process.env.PROXY_USER_NAME;
    const proxyPassword = process.env.PROXY_PASSWORD;
    const signInUrl = process.env.SIGN_IN_URL;
    const signInUserName = process.env.SIGN_IN_USER_NAME;
    const signInPassword = process.env.SIGN_IN_PASSWORD;

    try {
        slsChrome = await launchChrome({
            flags: [`--proxy-server=${proxyUrl}`, '--headless'],
        });
        browser = await puppeteer.connect({
            browserWSEndpoint: (await CDP.Version()).webSocketDebuggerUrl,
        });
        page = await browser.newPage();
        await page.authenticate({username: proxyUserName, password: proxyPassword});

        await page.goto(signInUrl, {waitUntil: 'domcontentloaded'});

        let title = await page.evaluate(() => {
            return document.title;
        });
        console.log(title);

        await page.type('input[name="user_id"]', signInUserName);
        await page.type('input[name="password"]', signInPassword);
        let buttonElement = await page.$(
            'body > form > table:nth-child(9) > tbody > tr > td:nth-child(1) > input[type="button"]'
        );
        await buttonElement.click({waitUntil: 'domcontentloaded'});
        await page.waitForNavigation({timeout: 60000, waitUntil: "domcontentloaded"});
        // await page.screenshot({path: 'enter.png', fullPage: true});
        let data = await page.$eval('body > form > table:nth-child(7) > tbody > tr > td > font > b', e => {
            return e.textContent;
        });
        console.log(data);

        return callback(null, JSON.stringify({result: 'OK'}));
    } catch (err) {
        console.error(err);
        return callback(null, JSON.stringify({result: 'NG'}));
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
