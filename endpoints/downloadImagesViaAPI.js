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
const multer = require('multer');

//defining the storage for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'database/')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

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

router.post('/', upload.single('csvfile'), async (req, res) => {
    
    const {shop_id, first_name, scrapeButtonType, remove_final_word} = req.body;
    let {refresh_token, access_token} = req.body;

    console.log(`Started process for downloading images via API`);
    console.log(`Using file: ${req.file.originalname}`);

    const rowsArray = [];
    const errorsArray = [];

    try {
        const csvStream = fs.createReadStream(req.file.path).pipe(csv());
        
        await new Promise((resolve, reject) => {
            csvStream.on('data', (row) => rowsArray.push(row))
                     .on('end', () => resolve())
                     .on('error', (err) => reject(err));
        });

        console.log(`CSV processing complete`);

    } catch (error) {
        console.error("Error processing CSV:", error);
        res.status(500).send("Failed to process CSV");
    }
    
    // Sort rowsArray by est_mo_sales in descending order
    rowsArray.sort((a, b) => Number(b.est_mo_sales) - Number(a.est_mo_sales));

    // Now for each item in rowsArray, get the listing ID from the URL
    console.log(`Getting URLs for ${rowsArray.length} listings`);
    let imageURLArray = [];
    let rowCounter = 1;
    for (let row of rowsArray) {
        rowCounter++
        let listingID;
        const url = row.product_link;
        const regex = /\/listing\/(\d+)\//;
        const match = url.match(regex);
        if (match) {
            listingID = match[1];
        } else {
            const errorMessage = `No listing ID found for URL: ${url}. This might indicate the URL format is incorrect or the listing ID is missing.`;
            console.log(errorMessage);
            errorsArray.push(errorMessage);
            continue; // Skipping to the next row in the loop
        }
        // Listing ID found, so now fecth listing data
        try {
            let indiv_listing_api_url = `https://openapi.etsy.com/v3/application/listings/${listingID}/images`;
            let getImagesResponse = await getApiCall(indiv_listing_api_url, clientID, access_token);
            // Get all images
            // for (let image of getImagesResponse.results) {
            //     imageURLArray.push(image.url_fullxfull);
            // }
            // Just get first image
            imageURLArray.push({
                imageURL: getImagesResponse.results[0].url_fullxfull,
                product_name: row.product_name
            });

        } catch (error) {
            let errorString = `Failed to fetch images for row ${rowCounter}, listing ${url}: ${error}`;
            console.error(errorString);
            console.log('Process is continuing...')
            errorsArray.push(errorString);
        }
    }
    console.log(`Finished getting URLs for ${rowsArray.length} listings`);

    // So now imageURLArray contains all image URLs to be downloaded & also the product title from the .csv

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
    const downloadedImagesDirectory = `./downloaded_images-${getFormattedDate()}`;
    if (!fs.existsSync(downloadedImagesDirectory)){
        fs.mkdirSync(downloadedImagesDirectory);
        console.log(`Created directory ${downloadedImagesDirectory}`);
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

    // Now download all images to the 'downloaded_images' folder
    console.log(`Starting download of ${imageURLArray.length} images`);
    let imageCounter = 1;
    for (let image of imageURLArray) {
        rowCounter++;
        let baseFilename = `${imageCounter + 1}_${image.product_name}`
        let extension = '.jpg';
        let maxLength = 255; // Max filename length for windows
        // Calculate the full path for the file
        let fullPath = path.join(downloadedImagesDirectory, baseFilename + extension);
        //console.log(`First full path: ${fullPath}`);
        // Check if the full path exceeds the maxLength and truncate if necessary
        if (fullPath.length > maxLength) {
            // Calculate how many characters to remove to meet the maxLength requirement
            let excessLength = fullPath.length - maxLength;
            // Truncate the baseFilename accordingly
            baseFilename = baseFilename.substring(0, baseFilename.length - excessLength - 1); // -1 to account for potential rounding issues
        }
        // Reconstruct the full path with the potentially truncated filename
        fullPath = path.join(downloadedImagesDirectory, baseFilename + extension);
        //console.log(`Second full path: ${fullPath}`);
        await downloadImage(image.imageURL, fullPath);
        if (imageCounter % 10 === 0) {
            console.log(`${imageCounter} images of ${imageURLArray.length} have been downloaded`);
        }
        imageCounter++;
    }

    //res.send(`<pre>${JSON.stringify(imageURLArray, null, 2)}</pre>`);
    
    console.log(`Downloading images via API process complete`);
    console.log(`Images can be found in ${downloadedImagesDirectory}`);

    if (errorsArray.length > 0) {
        res.render("welcomeDigital", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            refresh_token_hbs: refresh_token,
            completedDownloadImagesViaAPIErrors: errorsArray,
            completedDownloadImagesViaAPI: false
        });
    } else {
        res.render("welcomeDigital", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            refresh_token_hbs: refresh_token,
            completedDownloadImagesViaAPI: true
        });
    }

});

module.exports = router;