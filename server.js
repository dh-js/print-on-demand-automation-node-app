require('dotenv').config();
const path = require("path");
const express = require('express');
const fetch = require("node-fetch");
const fsPromises = require('fs').promises;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const crypto = require("crypto");

const createEtsyDraftsShirtSweat = require('./endpoints/createEtsyDraftsShirtSweat');
const printfulSyncVariantsShirtSweat = require('./endpoints/printfulSyncVariantsShirtSweat');
const createDigitalEtsyDraftListings = require('./endpoints/digitalEtsyListing');
const getEtsyDescription = require('./endpoints/getEtsyDescription');
const etsyScraperEndpoint = require('./endpoints/etsyScraperEndpoint');
const cleanseTextfileEndpoint = require('./endpoints/cleanseTextfileEndpoint');
const midjourneyImagesEndpoint = require('./endpoints/midjourneyImagesEndpoint');
const pinterestEndpoint = require('./endpoints/pinterestEndpoint');

const app = express();
const { exec } = require('child_process');
const { count } = require("console");
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

app.use('/createEtsyDrafts', createEtsyDraftsShirtSweat);
app.use('/printful-sync-variants', printfulSyncVariantsShirtSweat);
app.use('/createDigitalEtsyDrafts', createDigitalEtsyDraftListings);
app.use('/getEtsyDescription', getEtsyDescription);
app.use('/etsyScraperEndpoint', etsyScraperEndpoint);
app.use('/cleanseTextfileEndpoint', cleanseTextfileEndpoint);
app.use('/midjourneyImagesEndpoint', midjourneyImagesEndpoint);
app.use('/pinterestEndpoint', pinterestEndpoint);

//OAUTH Values
const base64URLEncode = (str) =>
  str
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest();

const oauthCodeVerifier = base64URLEncode(crypto.randomBytes(32));
const oauthCodeChallenge = base64URLEncode(sha256(oauthCodeVerifier));
const oauthState = Math.random().toString(36).substring(7);
const oauthRedirectUri = 'http://localhost:3003/oauth/redirect';

// Rendering the entry page which is the `index.hbs` file.
app.get('/', async (req, res) => {
    res.render("index", {
        ETSY_CLIENT_ID_PHYSICAL: process.env.ETSY_CLIENT_ID_PHYSICAL,
        ETSY_CLIENT_ID_DIGITAL: process.env.ETSY_CLIENT_ID_DIGITAL,
        oauth_state: oauthState,
        oauth_code_challenge: oauthCodeChallenge,
        oauth_redirect_uri: oauthRedirectUri
    });
});

//Render the hbs file for the Etsy web scraper
app.get('/etsyWebScrapeUI', (req, res) => {
    res.render('etsyWebScrapeUI');
});

//ETSY AUTH PROCESS
app.get("/oauth/redirect", async (req, res) => {
    const state = req.query.state;
    // Check if the state parameter matches the set oauthState value from above
    if (state !== (oauthState + "_physical") && state !== (oauthState + "_digital")) {
        res.send("Error: state mismatch");
    }
    const storeType = state.split("_")[1];
    let oauthEtsyAPIKey;
    if (storeType === 'physical') {
        oauthEtsyAPIKey = process.env.ETSY_CLIENT_ID_PHYSICAL;
    } else if (storeType === 'digital') {
        oauthEtsyAPIKey = process.env.ETSY_CLIENT_ID_DIGITAL;
    }
    // req.query object has query params that Etsy auth sends to this route.
    // -> Auth code is in `code` param
    const authCode = req.query.code;
    const requestOptions = {
        method: 'POST',
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: oauthEtsyAPIKey,
            redirect_uri: oauthRedirectUri,
            code: authCode,
            code_verifier: oauthCodeVerifier,
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const response = await fetch(
        'https://api.etsy.com/v3/public/oauth/token',
        requestOptions
        );

    // Extract the access token from the response access_token data field
    if (response.ok) {
        const tokenData = await response.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;

        if (storeType === 'physical') {
            res.redirect(`/welcome_physical?access_token=${accessToken}`);
        } else {
            res.redirect(`/welcome_digital?access_token=${accessToken}&refresh_token=${refreshToken}`);
        }
    } else {
        res.send("oops");
    }
});

// After OAUTH, render the welcome page if the 'physical' store was selected
app.get("/welcome_physical", async (req, res) => {
    const { access_token } = req.query;
    const user_id = access_token.split('.')[0];

    const requestOptions = {
        headers: {
            'x-api-key': process.env.ETSY_CLIENT_ID_PHYSICAL,
            Authorization: `Bearer ${access_token}`,
            'Accept': 'application/json',
        }
    };

    //Get the user's name
    const responseUser = await fetch(
        `https://api.etsy.com/v3/application/users/${user_id}`,
        requestOptions
    );
    let firstName;
    if (responseUser.ok) {
        const userData = await responseUser.json();
        firstName = userData.first_name;
    } else {
        console.log(responseUser.status, responseUser.statusText);
        const errorData = await responseUser.json();
        console.log(errorData);
        res.send("Error getting user's name");
    }

    // Get the user's shop ID
    const responseMe = await fetch(
        "https://openapi.etsy.com/v3/application/users/me",
        requestOptions
    )
    let shopID;
    if (responseMe.ok) {
        const meData = await responseMe.json();
        shopID = meData.shop_id;
    } else {
        console.log(responseMe.status, responseMe.statusText);
        const errorDataMe = await responseMe.json();
        console.log(errorDataMe);
        res.send("Error getting shop ID")
    }


    res.render("welcome", {
        first_name_hbs: firstName,
        shop_id_hbs: shopID,
        access_token_hbs: access_token
    });
    
});

// After OAUTH, render the welcome page if the 'digital' store was selected
app.get("/welcome_digital", async (req, res) => {
    const { access_token, refresh_token } = req.query;
    const user_id = access_token.split('.')[0];

    const requestOptions = {
        headers: {
            'x-api-key': process.env.ETSY_CLIENT_ID_DIGITAL,
            Authorization: `Bearer ${access_token}`,
            'Accept': 'application/json',
        }
    };

    // Get the user's name
    const responseUser = await fetch(
        `https://api.etsy.com/v3/application/users/${user_id}`,
        requestOptions
    );
    let firstName;
    if (responseUser.ok) {
        const userData = await responseUser.json();
        firstName = userData.first_name;
    } else {
        console.log(responseUser.status, responseUser.statusText);
        const errorData = await responseUser.json();
        console.log(errorData);
        res.send("Error getting user's name");
    }

    // Get the user's shop ID
    const responseMe = await fetch(
        "https://openapi.etsy.com/v3/application/users/me",
        requestOptions
    )
    let shopID;
    if (responseMe.ok) {
        const meData = await responseMe.json();
        shopID = meData.shop_id;
    } else {
        console.log(responseMe.status, responseMe.statusText);
        const errorDataMe = await responseMe.json();
        console.log(errorDataMe);
        res.send("Error getting shop ID")
    }


    res.render("welcomeDigital", {
        first_name_hbs: firstName,
        shop_id_hbs: shopID,
        access_token_hbs: access_token,
        refresh_token_hbs: refresh_token
    });
    
});

// Printful Puppeteer login / cookies
app.get('/login', async (req, res) => {
    const {access_token, shop_id, first_name} = req.query;

    try {
        let cookies;
        try {
            const cookiesString = await fsPromises.readFile('./database/cookies.json', 'utf-8');
            cookies = JSON.parse(cookiesString);
        } catch (error) {
            if (error.code === 'ENOENT') {
                cookies = [];
            } else {
                throw error;
            }
        }

        const browser = await puppeteer.launch({ executablePath: './chromium/puppeteer/chrome/win64-114.0.5735.133/chrome-win64/chrome.exe', headless: false });
        const page = await browser.newPage();
        if (cookies.length > 0) {
            await page.setCookie(...cookies);
        }
        
        // Listen for "targetchanged" event
        browser.on('targetchanged', async () => {
            const cookies = await page.cookies();
            await fsPromises.writeFile('./database/cookies.json', JSON.stringify(cookies, null, 2));
        });

        await page.goto('https://www.printful.com/dashboard/default');

        try {
            await page.waitForNavigation({ timeout: 0 });
        } catch (error) {
            // Catch the browser disconnection error
            if (error.message.includes('Navigation failed because browser has disconnected')) {
            } else {
                throw error;
            }
        }
        
        res.render("welcome", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            loginChecked: true
        });

    } catch (error) {
        if (error.message.includes('Navigation failed because browser has disconnected')) {
        } else {
            console.error(error);
        }
        res.render("welcome", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            loginChecked: true
        });
    }
    
});

const port = 3003;
app.listen(port, () => {
    console.log(`Hi! Go to the following link in your browser to start the app: http://localhost:${port}`);
    exec(`start http://localhost:${port}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error: ${err}`);
            return;
        }
    });
});