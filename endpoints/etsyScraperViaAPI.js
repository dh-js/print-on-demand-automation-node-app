const csv = require("csv-parser");
const express = require('express');
const fs = require('fs'); 
const fsPromises = require('fs').promises;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const FormData = require('form-data');
const router = express.Router();
const axios = require('axios');
const url = require('url');
const path = require('path');
const fetch = require("node-fetch");

const clientID = process.env.ETSY_CLIENT_ID_DIGITAL;

async function refreshTokens(refresh_token) {
    
    const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=refresh_token&client_id=${clientID}&refresh_token=${refresh_token}`
    });

    if (!response.ok) {
        throw new Error(`Error getting refresh token: ${response.status}`);
    }

    const data = await response.json();

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token
    };
}

async function getApiCall(_url, _clientID, _accessToken, retries = 3) {
    try {
        const response = await axios.get(`${_url}`, {
            headers: {
                'x-api-key': _clientID,
                Authorization: `Bearer ${_accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
        });
        return response.data;
    } catch (error) {
        console.error(`Failed API call for ${url}: ${error}`);
        if (retries > 0) {
            console.log(`Retrying API call for ${url}, (${retries} attempts left)...`);
            return getApiCall(url, _clientID, _accessToken, retries - 1);
        } else {
            console.error(`No more retries left for ${url}`);
            return null;
        }
    }
}

// let sections_url = `https://openapi.etsy.com/v3/application/shops/${shop_id_for_test}/sections`
    // let sectionsResponse = await getApiCall(sections_url, clientID, access_token);
    // let shopSectionTranslations = {};
    // if (sectionsResponse) { 
    //     sectionsResponse.results.forEach(result => {
    //         shopSectionTranslations[result.title] = result.shop_section_id;
    //     });
    // }
    // console.log(shopSectionTranslations);
    // res.send(`<pre>${JSON.stringify(sectionsResponse, null, 2)}</pre>`);
    // return;

router.post('/', async (req, res) => {

    const delay = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    console.log(`Scraping process started`)

    const {shop_id, first_name, scrapeButtonType} = req.body;
    let {refresh_token, access_token} = req.body;
    var user_submitted_lines = req.body.textInput.split('\n');

    if (scrapeButtonType === 'scrapebuttonsspecificsection') {
        console.log(`Scraping specific section/s`);
    } else {
        console.log(`Scraping entire shop/s`);
    }

    let allListingData = [];

    for (let row of user_submitted_lines) {

        let startingLength = allListingData.length;

        let splitRow = row.split(',');
        let user_provided_shop_id = splitRow[0];
        let user_provided_section_id;

        // Get the section ID
        if (scrapeButtonType === 'scrapebuttonsspecificsection') {
            let user_provided_section_url = splitRow[1];
            if (user_provided_section_url === undefined) {
                // Handle the error here
                console.error('No section URL provided');
                console.log(row);
                res.status(400).send('No section URL provided');
                return;
            } else {
                let parsedSectionUrl = new url.URL(user_provided_section_url);
                user_provided_section_id = parsedSectionUrl.searchParams.get('section_id');
            }
        }

        // Just an exit if the user provided a section id but clicked the wrong button
        if (scrapeButtonType === 'scrapebuttonentireshop') {
            let user_provided_section_url = splitRow[1];
            if (user_provided_section_url !== undefined) {
                console.error('Section URL provided when scraping entire shop. Did you mean to select "Scrape Specific Section"?');
                console.log(row);
                res.status(400).send('Section URL provided when scraping entire shop. Did you mean to select "Scrape Specific Section"?');
                return;
            }
        }

        let all_listings_api_url = `https://openapi.etsy.com/v3/application/shops/${user_provided_shop_id}/listings/active?limit=100`;
        let getListingsResponse;
        try {
            let page_offset = 0;
            while (true) {
                getListingsResponse = await getApiCall(all_listings_api_url + `&offset=${page_offset}`, clientID, access_token);

                // If we're not limiting it by section then push all listing ids
                if (scrapeButtonType !== 'scrapebuttonsspecificsection') {
                    const listingData = getListingsResponse.results.map(listing => (
                        {
                            listingID: listing.listing_id,
                            title: listing.title
                        }
                    ));
                    allListingData.push(...listingData);
                } else {
                    // Otherwise only push listing ids that are in the correct section
                    const listingData = getListingsResponse.results
                        .filter(listing => listing.shop_section_id == user_provided_section_id)
                        .map(listing => (
                            {
                                listingID: listing.listing_id,
                                title: listing.title
                            }
                        ));
                    allListingData.push(...listingData);
                }

                if (getListingsResponse.results.length < 100) {
                    break;
                }

                page_offset += 100;
            }
        } catch (error) {
            console.error(`Failed to fetch all listings at page offset ${page_offset}: ${error}`);
        }

        console.log(`Found ${allListingData.length - startingLength} matching listings for: ${row}`);
        // res.send(`<pre>${JSON.stringify(allListingData, null, 2)}</pre>`);
        // return;

        // Now for each listing, get the image url
        let getImagesResponse;
        for (let listing of allListingData) {
            let indiv_listing_api_url = `https://openapi.etsy.com/v3/application/listings/${listing.listingID}/images`;
            getImagesResponse = await getApiCall(indiv_listing_api_url, clientID, access_token);
            listing.imageURL = getImagesResponse.results[0].url_fullxfull;
            // rate limiting
            await delay(500);
        }

        // res.send(`<pre>${JSON.stringify(allListingData, null, 2)}</pre>`);
        // return;

    }

    ////// So now allListingData is an array of objects with listingID, title, and imageURL //////
    console.log('Starting image download process')

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
    async function downloadImage(url, filePath, retries = 3) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            if (response.data.byteLength > 0) {
                await fs.promises.writeFile(filePath, response.data);
            } else {
                throw new Error(`Received empty data. URL: ${url}, Filename: ${filePath}`);
            }
        } catch (error) {
            console.error(`Error: ${error}`);
            if (retries > 0) {
                console.log(`Retrying download for ${url}, (${retries} attempts left)...`);
                return downloadImage(url, filePath, retries - 1);
            }
        }
    }

    // Loop through all listings and download images
    async function downloadAllImages(listings) {
        let textFileContent = '';
        let currentSubDir = '';
        let currentSubDirName = '';
        for (let i = 0; i < listings.length; i++) {
            // Check if both title and imageURL exist
            if (listings[i].title && listings[i].imageURL) {
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
                //const filename = `${i + 1}_${titleWords}.jpg`;
                // Create image file name and skip number 69
                let filename;
                i < 68 ? filename = `${i + 1}_${titleWords}.jpg` : filename = `${i + 2}_${titleWords}.jpg`;
                await downloadImage(listings[i].imageURL, path.join(subDir, filename));
                
                // A random pause for bot safety
                let delay = Math.floor(Math.random() * 5000) + 1000;
                await new Promise(resolve => setTimeout(resolve, delay));

                // Add title to text file content
                // Skipping number 69
                i < 68 ? textFileContent += `${i + 1}. ${listings[i].title}\n` : textFileContent += `${i + 2}. ${listings[i].title}\n`;
                //textFileContent += `${i + 1}. ${listings[i].title}\n`;
            } else {
                if (i < 68) {
                    console.error(`Failed to download image ${i + 1}. URL: ${listings[i].imageURL}, Filename: ${listings[i].title}`);
                } else {
                    console.error(`Failed to download image ${i + 2}. URL: ${listings[i].imageURL}, Filename: ${listings[i].title}`);
                }
            }
        }
    
        // Write text file for the last subdirectory
        if (currentSubDir) {
            fs.writeFileSync(path.join(mainDirectory, `${currentSubDirName}_titles.txt`), textFileContent);
        }
    }

    // Call the function
    await downloadAllImages(allListingData).catch(console.error);
    
    console.log(`Scraping process complete`);

    // if (etsyImageUploadErrorsArray.length > 0) {
    //     res.render("welcomeDigital", {
    //         first_name_hbs: first_name,
    //         shop_id_hbs: shop_id,
    //         access_token_hbs: access_token,
    //         catchErrorMessageEtsyImageUploads: etsyImageUploadErrorsArray
    //     });
    // } else {
        res.render("welcomeDigital", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            completedScrapeAPI: true
        });
    // }

});

module.exports = router;