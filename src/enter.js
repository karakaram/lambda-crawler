'use strict';

const launchChrome = require('@serverless-chrome/lambda');
const CDP = require('chrome-remote-interface');
const puppeteer = require('puppeteer');
let AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-northeast-1' });
/** @type {SSM} */
const ssm = new AWS.SSM();
/** @type {SNS} */
const sns = new AWS.SNS();

module.exports.main = async (event, context, callback) => {
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
        await page.authenticate({ username: parameters['ProxyUserName'], password: parameters['ProxyPassword'] });

        await page.goto(parameters['SignInUrl'], { waitUntil: 'domcontentloaded' });
        // await page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' });
        // console.log(await page.title());

        await page.type('input[name="user_id"]', parameters['SignInUserName']);
        await page.type('input[name="password"]', parameters['SignInPassword']);
        if (event.type === 'exit') {
            await page.click('body > form > table:nth-child(9) > tbody > tr > td:nth-child(2) > input[type="button"]', {
                waitUntil: 'domcontentloaded',
            });
        } else {
            await page.click('body > form > table:nth-child(9) > tbody > tr > td:nth-child(1) > input[type="button"]', {
                waitUntil: 'domcontentloaded',
            });
        }

        // console.log(await page.title());
        // await page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' });
        // await page.screenshot({path: 'enter.png', fullPage: true});
        let selector = 'body > form > table:nth-child(7) > tbody > tr > td > font > b';
        await page.waitFor(selector, { timeout: 10000 });
        let message = await page.$eval(selector, e => {
            return e.textContent.replace(/\t/g, '');
        });
        console.log(message);

        params = {
            Message: message,
            Subject: 'Succeeded entering',
            TopicArn: 'arn:aws:sns:ap-northeast-1:274682760725:my-topic',
        };
        await sns.publish(params, (err, data) => {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log(data);
            }
        });

        return callback(null, JSON.stringify({ result: 'Success' }));
    } catch (err) {
        console.error(err);
        params = {
            Message: err,
            Subject: 'Failed entering',
            TopicArn: 'arn:aws:sns:ap-northeast-1:274682760725:my-topic',
        };
        await sns.publish(params, (err, data) => {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log(data);
            }
        });
        return callback(null, JSON.stringify({ result: 'Failure' }));
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
