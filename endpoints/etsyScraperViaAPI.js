const csv = require("csv-parser");
const express = require('express');
const fs = require('fs'); 
const fsPromises = require('fs').promises;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const FormData = require('form-data');
const router = express.Router();
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
        const response = await fetch(_url, {
            method: 'GET',
            headers: {
                'x-api-key': _clientID,
                Authorization: `Bearer ${_accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Failed API call for ${_url}: ${error}`);
        if (retries > 0) {
            console.log(`Retrying API call for ${_url}, (${retries} attempts left)...`);
            return getApiCall(_url, _clientID, _accessToken, retries - 1);
        } else {
            console.error(`No more retries left for ${_url}`);
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

    const {shop_id, first_name, scrapeButtonType, remove_final_word} = req.body;
    let {refresh_token, access_token} = req.body;
    const user_submitted_lines = req.body.textInput.split('\n');
    const {limit_results} = req.body;

    scrapeButtonType === 'scrapebuttonspecificsection' ? console.log(`Scraping specific section/s`) : null;
    scrapeButtonType === 'scrapebuttonphrase' ? console.log(`Scraping by phrase`) : null;
    scrapeButtonType === 'scrapebuttonentireshop' ? console.log(`Scraping entire shop/s`) : null;
    remove_final_word === 'true' ? console.log(`Removing final word from title`) : null;

    limit_results !== '' ? console.log(`Limiting results to ${limit_results} per line`) : console.log(`Not limiting results`);

    let allListingData = [];

    for (let row of user_submitted_lines) {

        let currentRowListingData = [];

        let splitRow = row.split(',');
        let user_provided_shop_id = splitRow[0];
        let user_provided_section_id;
        let user_provided_phrase;

        // Get the section ID
        if (scrapeButtonType === 'scrapebuttonspecificsection') {
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

        // Get the phrase
        if (scrapeButtonType === 'scrapebuttonphrase') {
            user_provided_phrase = splitRow[1];
            if (user_provided_phrase === undefined) {
                // Handle the error here
                console.error('No phrase provided');
                console.log(row);
                res.status(400).send('No phrase provided');
                return;
            } else {
                // Check if the provided phrase is a valid URL
                try {
                    new URL(user_provided_phrase);
                    console.error('URL provided when user has clicked scrape by phrase button.');
                    console.log(row);
                    res.status(400).send('URL provided when user has clicked scrape by phrase button.');
                    return;
                } catch (_) {
                    // Not a valid URL, continue with the process
                }
                user_provided_phrase = user_provided_phrase.trim().toLowerCase();
                console.log(`Searching for phrase: ${user_provided_phrase}`);
            }
        }

        // Just an exit if the user provided a section id or phrase but clicked the wrong button
        if (scrapeButtonType === 'scrapebuttonentireshop') {
            let user_provided_section_url = splitRow[1];
            if (user_provided_section_url !== undefined) {
                console.error('Section URL or Phrase provided when user has clicked scrape entire shop button.');
                console.log(row);
                res.status(400).send('Section URL or Phrase provided when user has clicked scrape entire shop button.');
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
                if (scrapeButtonType === 'scrapebuttonentireshop') {
                    const listingData = getListingsResponse.results
                    .map(listing => (
                        {
                            listingID: listing.listing_id,
                            title: listing.title
                        }
                    ));
                    currentRowListingData.push(...listingData);
                } else if (scrapeButtonType === 'scrapebuttonspecificsection') {
                    // Only push listing ids that are in the correct section
                    const listingData = getListingsResponse.results
                    .filter(listing => listing.shop_section_id == user_provided_section_id)
                        .map(listing => (
                            {
                                listingID: listing.listing_id,
                                title: listing.title
                            }
                        ));
                        currentRowListingData.push(...listingData);
                } else if (scrapeButtonType === 'scrapebuttonphrase') {
                    // Split the phrase into words
                    const phrase_words = user_provided_phrase.split(' ');
                    // Only push listing ids that have the correct phrase in the title
                    const listingData = getListingsResponse.results
                    // res.send(`<pre>${JSON.stringify(listingData, null, 2)}</pre>`);
                    // return;
                        .filter(listing => {
                            // Remove anything that isn't a letter, number, or space from the title and split it into words
                            const titleWords = listing.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(' ');
                            // Check if all words are included in the title
                            return phrase_words.every(word => titleWords.includes(word));
                        })
                        .map(listing => (
                            {
                                listingID: listing.listing_id,
                                title: listing.title
                            }
                        ));
                        currentRowListingData.push(...listingData);
                }

                //If we're limiting the results, then break out of the loop if we've reached the limit
                if (limit_results !== '' && currentRowListingData.length >= limit_results) {
                    break;
                }

                if (getListingsResponse.results.length < 100) {
                    break;
                }

                page_offset += 100;
            }
        } catch (error) {
            console.error(`Failed to fetch all listings at page offset ${page_offset}: ${error}`);
        }

        if (limit_results !== '') {
            currentRowListingData = currentRowListingData.slice(0, limit_results);
        }
        console.log(`Found ${currentRowListingData.length} matching listings for: ${row}`);
        allListingData.push(...currentRowListingData);

    }

    // For each listing, if remove_final_word is true, remove the last word from the title
    if (remove_final_word === 'true') {
        allListingData.forEach(listing => {
            listing.title = listing.title.split(' ').slice(0, -1).join(' ');
        });
    }

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
            const response = await fetch(url);
            const buffer = await response.buffer();
    
            if (buffer.byteLength > 0) {
                await fsPromises.writeFile(filePath, buffer);
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