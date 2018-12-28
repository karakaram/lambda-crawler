'use strict';

const launchChrome = require('@serverless-chrome/lambda');
const CDP = require('chrome-remote-interface');
const puppeteer = require('puppeteer');
let AWS = require('aws-sdk');
AWS.config.update({region: 'ap-northeast-1'});
/** @type {SSM} */
const ssm = new AWS.SSM();

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

    let params = {
        Names: ['ProxyUrl', 'ProxyUserName', 'ProxyPassword', 'SignInUrl', 'SignInUserName', 'SignInPassword'],
    };
    const ssmParameters = await ssm.getParameters(params).promise();
    const parameters = ssmParameters.Parameters.reduce((o, x) => {
        o[x.Name] = x.Value;
        return o;
    }, {});

    try {
        slsChrome = await launchChrome({
            flags: [`--proxy-server=${parameters['ProxyUrl']}`, '--headless'],
        });
        browser = await puppeteer.connect({
            browserWSEndpoint: (await CDP.Version()).webSocketDebuggerUrl,
        });
        page = await browser.newPage();
        await page.authenticate({username: parameters['ProxyUserName'], password: parameters['ProxyPassword']});

        await page.goto(parameters['SignInUrl'], {waitUntil: 'domcontentloaded'});

        let title = await page.evaluate(() => {
            return document.title;
        });
        console.log(title);

        await page.type('input[name="user_id"]', parameters['SignInUserName']);
        await page.type('input[name="password"]', parameters['SignInPassword']);
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

        return callback(null, JSON.stringify({result: 'Success'}));
    } catch (err) {
        console.error(err);
        return callback(null, JSON.stringify({result: 'Failure'}));
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
