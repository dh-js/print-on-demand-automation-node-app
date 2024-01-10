const express = require('express');
const fetch = require("node-fetch");
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const router = express.Router();

puppeteer.use(StealthPlugin());

router.post('/', async function(req, res) {
    var urls = req.body.urls.split('\n');
    var buttonType = req.body.scrapeButtonType;

    let scrapeSinglePage = false;
    if (buttonType === 'scrapebuttonsinglepage') {
        scrapeSinglePage = true;
    }

    var allScrapedListings = [];

    console.log("Starting Etsy Scraping Via API.")

    browser = await puppeteer.launch({
        //executablePath: './chromium/puppeteer/chrome/win64-114.0.5735.133/chrome-win64/chrome.exe',
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: false,
        //headless: "new"
        //userDataDir: 'C:/Users/David/AppData/Local/Google/Chrome/User Data/'
    });

    const page = await browser.newPage();
    // Read the cookies from the file
    const cookiesString = fs.readFileSync('./cookies.txt', 'utf8');
    // Parse the cookies into an array
    const cookies = JSON.parse(cookiesString);
    // Use the cookies in Puppeteer
    await page.setCookie(...cookies);
    //await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36');

    let isFirstIteration = true;

    for (let url of urls) {
        let pageCounter = 1;
        let listings = [];
        let isFullPage = true;
    
        while (isFullPage) {
            let pageUrl = url + (pageCounter > 1 ? `&page=${pageCounter}#items` : '');
            await page.goto(pageUrl, {waitUntil: 'networkidle0'});
            // Random pause for bot safety
            await page.waitForTimeout(Math.floor(Math.random() * 10000) + 10000);

            //Captcha check
            try {
                // Wait for the iframe to load
                await page.waitForSelector('iframe[src*="captcha-delivery.com"]', { timeout: 10000 });
                const iframeElement = await page.$('iframe[src*="captcha-delivery.com"]');
                const frame = await iframeElement.contentFrame();
            
                // Wait for the captcha container to appear within the iframe
                await frame.waitForSelector('#captcha-container', { timeout: 10000 });
                const captchaContainer = await frame.$('#captcha-container');
                if (captchaContainer) {
                    console.log("Captcha is being displayed.");
                    await page.waitForTimeout(30000);
                } else {
                    console.log("Captcha is not being displayed.");
                }
            } catch (error) {
                console.log("Captcha container did not appear within the timeout period.");
            }
    
            if (isFirstIteration) {
                try {
                    await page.waitForTimeout(Math.floor(Math.random() * 10000) + 10000);
            
                    // Attempt to close the cookie popup
                    await page.waitForSelector('button[data-gdpr-single-choice-accept="true"]', { timeout: 10000 });
                    await page.click('button[data-gdpr-single-choice-accept="true"]');
                    await page.waitForTimeout(Math.floor(Math.random() * 10000) + 10000);
                } catch (error) {
                    console.log("Cookie popup did not appear");
                }
                isFirstIteration = false;
            }
            
            // Random pause for bot saftey
            let delay = Math.floor(Math.random() * 15000) + 20000;

            await new Promise(resolve => setTimeout(resolve, delay));
    
            let pageListings = await page.$$eval('.js-merch-stash-check-listing.v2-listing-card', elements => elements.map(item => {
                let titleElement = item.querySelector('.v2-listing-card__info h3');
                let title = titleElement ? titleElement.textContent.trim() : 'No title found';
                let imgElement = item.querySelector('.placeholder-content img');
                let imgSrcset = imgElement ? imgElement.srcset : 'No image found';
                let imgUrl = imgSrcset.split(', ').pop().split(' ')[0];
                return { title, imgUrl };
            }));
    
            listings.push(...pageListings);
    
            // Check if the page is full
            isFullPage = pageListings.length >= 36;
            //If the button type is scrape single page, then only scrape the first page
            if (scrapeSinglePage) {
                isFullPage = false;
                console.log("Scraped first page only.")
            } else {
                console.log("Scraped page " + pageCounter);
            }

            pageCounter++;
        }

        if (scrapeSinglePage === false) {
            console.log("Scraped all pages.")
        }
    
        allScrapedListings.push(...listings);
    }

    //await browser.close();

    console.log(allScrapedListings.length + " listings scraped.");

    function getFormattedDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
    
        return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
        
    }

    // Create a new directory if it doesn't exist
    const mainDirectory = `./webscrape-${getFormattedDate()}`;
    if (!fs.existsSync(mainDirectory)){
        fs.mkdirSync(mainDirectory);
    }

    // Function to download image
    async function downloadImage(url, filePath) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const buffer = await response.buffer();
                if (buffer.byteLength > 0) { // Check if buffer is not empty
                    await fs.promises.writeFile(filePath, buffer);
                } else {
                    console.error(`Received empty data. URL: ${url}, Filename: ${filePath}`);
                }
            } else {
                console.error(`Failed to download image. URL: ${url}, Filename: ${filePath}, Status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Failed to download image. URL: ${url}, Filename: ${filePath}, Error: ${error}`);
        }
    }

    // Loop through all listings and download images
    async function downloadAllImages(listings) {
        let textFileContent = '';
        let currentSubDir = '';
        let currentSubDirName = '';
        for (let i = 0; i < listings.length; i++) {
            // Check if both title and imgUrl exist
            if (listings[i].title && listings[i].imgUrl) {
                // Create a new subdirectory for every hundred images
                const subDirName = `${Math.floor(i / 108) + 1}`;
                const subDir = `${mainDirectory}/${subDirName}`;
                if (!fs.existsSync(subDir)){
                    fs.mkdirSync(subDir);
                    console.log(`Created new subdirectory ${subDirName} inside of ${mainDirectory}`);
    
                    // If there is a previous subdirectory, write the text file for it
                    if (currentSubDir) {
                        fs.writeFileSync(path.join(mainDirectory, `${currentSubDirName}_titles.txt`), textFileContent);
                        textFileContent = ''; // Reset the text file content for the new subdirectory
                    }
                    currentSubDir = subDir; // Update the current subdirectory
                    currentSubDirName = subDirName; // Update the current subdirectory name
                }
    
                const titleWords = listings[i].title.replace(/[^a-z0-9 ]/gi, '').split(' ').slice(0, 3).join('_');
                const filename = `${i + 1}_${titleWords}.jpg`;
                await downloadImage(listings[i].imgUrl, path.join(subDir, filename));
                
                // A random pause for bot safety
                let delay = Math.floor(Math.random() * 5000) + 1000;
                await new Promise(resolve => setTimeout(resolve, delay));

                // Add title to text file content
                textFileContent += `${i + 1}. ${listings[i].title}\n`;
            } else {
                console.error(`Failed to download image ${i + 1}. URL: ${listings[i].imgUrl}, Filename: ${listings[i].title}`);
            }
        }
    
        // Write text file for the last subdirectory
        if (currentSubDir) {
            fs.writeFileSync(path.join(mainDirectory, `${currentSubDirName}_titles.txt`), textFileContent);
        }
    }

    // Call the function
    await downloadAllImages(allScrapedListings).catch(console.error);

    console.log("Finished Etsy Scraping.")

    res.render("etsyWebScrapeUI", {
        completedScrape: true
    });

});

module.exports = router;