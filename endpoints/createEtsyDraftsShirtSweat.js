const csv = require("csv-parser");
const express = require('express');
const fetch = require("node-fetch");
const fs = require('fs'); 
const fsPromises = require('fs').promises;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const FormData = require('form-data');
const router = express.Router();

puppeteer.use(StealthPlugin());

const printfulStoreURL = process.env.PRINTFUL_STORE_URL;
const clientID = process.env.ETSY_CLIENT_ID_PHYSICAL;

//defining the variation types
const allVariationTypes = [
    'Shirt Black / S', 'Shirt Black / M', 'Shirt Black / L', 'Shirt Black / XL', 'Shirt Black / 2X', 'Shirt Black / 3X',
    'Shirt Navy / S', 'Shirt Navy / M', 'Shirt Navy / L', 'Shirt Navy / XL', 'Shirt Navy / 2X', 'Shirt Navy / 3X',
    'Shirt Dark Heather / S', 'Shirt Dark Heather / M', 'Shirt Dark Heather / L', 'Shirt Dark Heather / XL', 'Shirt Dark Heather / 2X', 'Shirt Dark Heather / 3X',
    'Shirt Sport Grey / S', 'Shirt Sport Grey / M', 'Shirt Sport Grey / L', 'Shirt Sport Grey / XL', 'Shirt Sport Grey / 2X', 'Shirt Sport Grey / 3X',
    'Shirt White / S', 'Shirt White / M', 'Shirt White / L', 'Shirt White / XL', 'Shirt White / 2X', 'Shirt White / 3X',
    'Sweatshirt Black / S', 'Sweatshirt Black / M', 'Sweatshirt Black / L', 'Sweatshirt Black / XL', 'Sweatshirt Black / 2X', 'Sweatshirt Black / 3X', 'Sweatshirt Black / 4X', 'Sweatshirt Black / 5X',
    'Sweatshirt Navy / S', 'Sweatshirt Navy / M', 'Sweatshirt Navy / L', 'Sweatshirt Navy / XL', 'Sweatshirt Navy / 2X', 'Sweatshirt Navy / 3X', 'Sweatshirt Navy / 4X', 'Sweatshirt Navy / 5X',
    'Sweatshirt Dark Heather / S', 'Sweatshirt Dark Heather / M', 'Sweatshirt Dark Heather / L', 'Sweatshirt Dark Heather / XL', 'Sweatshirt Dark Heather / 2X', 'Sweatshirt Dark Heather / 3X', 'Sweatshirt Dark Heather / 4X', 'Sweatshirt Dark Heather / 5X',
    'Sweatshirt Sport Grey / S', 'Sweatshirt Sport Grey / M', 'Sweatshirt Sport Grey / L', 'Sweatshirt Sport Grey / XL', 'Sweatshirt Sport Grey / 2X', 'Sweatshirt Sport Grey / 3X', 'Sweatshirt Sport Grey / 4X', 'Sweatshirt Sport Grey / 5X',
    'Sweatshirt White / S', 'Sweatshirt White / M', 'Sweatshirt White / L', 'Sweatshirt White / XL', 'Sweatshirt White / 2X', 'Sweatshirt White / 3X', 'Sweatshirt White / 4X', 'Sweatshirt White / 5X'
];

const additionalHeadersForImages = [
    'Listing ID', 'Image Folder', 'Image1', 'Image2', 'Image3', 'Image4', 'Image5',
    'Image6', 'Image7', 'Image8', 'Image9', 'Image10'
    ];

const shirtMockupImages = [
    "1_shirt_black.jpg",
    "2_shirt_white.jpg",
    "3_shirt_dark_heather.jpg",
    "4_shirt_sport_grey.jpg",
    "5_shirt_navy.jpg",
    "6_shirt_black.jpg",
    "7_shirt_white.jpg",
    "8_shirt_dark_heather.jpg",
    "9_shirt_sport_grey.jpg",
    "10_shirt_size_chart.jpg"
];
    
const sweatshirtMockupImages = [
    "1_sweatshirt_black.jpg",
    "2_sweatshirt_white.jpg",
    "3_sweatshirt_dark_heather.jpg",
    "4_sweatshirt_sport_grey.jpg",
    "5_sweatshirt_navy.jpg",
    "6_sweatshirt_black.jpg",
    "7_sweatshirt_white.jpg",
    "8_sweatshirt_dark_heather.jpg",
    "9_sweatshirt_sport_grey.jpg",
    "10_sweatshirt_size_chart.jpg"
];
    
let objectsForVariationImages = [
    {
        "property_id": 200,
        //"value_id": 49928889190,
        "value_id": 51991371509,
        "color": "Black",
        "image_id": null
    },
    {
        "property_id": 200,
        //"value_id": 49974750696,
        "value_id": 52015917113,
        "color": "White",
        "image_id": null
    },
    {
        "property_id": 200,
        "value_id": 77069646428,
        "color": "Dark heather",
        "image_id": null
    },
    {
        "property_id": 200,
        "value_id": 79618515957,
        "color": "Sport grey",
        "image_id": null
    },
    {
        "property_id": 200,
        "value_id": 52178634305,
        "color": "Navy",
        "image_id": null
    }
    
];

router.post('/', async (req, res) => {
    const {access_token, shop_id, first_name} = req.body;
    const csvDirectory = './.csv/';
    let browser;
    const rowsArray = [];  //store the rows
    const csvErrorArray = []; //store csv rows that have errors
    let lineCount = 1; //for logging the row number in the error message

    let isThisARepeatRun = false;

    const delay = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    const readFile = await (async () => {
        try {
            const allFilesInCsvDirectory = await fsPromises.readdir(csvDirectory);

            const allCsvFiles = allFilesInCsvDirectory.filter(file => file.endsWith('.csv'));

            if (allCsvFiles.length === 0) {
                throw new Error("No CSV file found in the .csv folder");
            } else if (allCsvFiles.length > 1) {
                throw new Error("Multiple CSV files found. Please ensure only one CSV file exists in the .csv folder");
            }
            
            return csvDirectory + allCsvFiles[0];

        } catch (error) {
            csvErrorArray.push(`${error.message}`);
        }
    })();

    if (!readFile) {
        csvErrorArray.push("There was a problem reading the CSV file. Please check the file and try again.");
    }

    if (csvErrorArray.length > 0) {
        res.render("welcome", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            csvErrors: csvErrorArray
        });
        return;
    }

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


    const csvStream = fs.createReadStream(readFile).pipe(csv());

    // Promisify the csvStream events
    const readCsv = () => {
        return new Promise((resolve, reject) => {
            csvStream.on('data', (row) => {

                lineCount++;

                // Check if the 'row' already has the key "Draft Created On Etsy"
                if (!row.hasOwnProperty("Draft Created On Etsy")) {

                    // Validate the row data (only needs to be done if it wasn't previously validated the first time this script was run)
                    if (!row['Single Image File'] && !row['Primary Image File'] && !row['Secondary Image File']) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: No image file entered`;
                        csvErrorArray.push(csvErrorString);
                    };
                    if (row['Single Image File'] && row['Primary Image File'] && row['Secondary Image File']) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: You can only enter either a 'Single image' or a 'Primary/Secondary' image`;
                        csvErrorArray.push(csvErrorString);
                    };
                    if (!row['Single Image File']) {
                        if (row['Primary Image File'] && !row['Secondary Image File']) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: You must enter both a 'Primary image' and a 'Secondary image'`;
                            csvErrorArray.push(csvErrorString);
                        } else if (!row['Primary Image File'] && row['Secondary Image File']) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: You must enter both a 'Primary image' and a 'Secondary image'`;
                            csvErrorArray.push(csvErrorString);
                        };
                    };
                    if (!row['Shirt'] && !row['Sweatshirt']) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: No product type selected (Shirt/Sweatshirt)`;
                        csvErrorArray.push(csvErrorString);
                    };
                    if (row['Shirt'] && !row['Shirt Product Title']) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: No title entered for shirt`;
                        csvErrorArray.push(csvErrorString);
                    };
                    if (row['Sweatshirt'] && !row['Sweatshirt Product Title']) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: No title entered for sweatshirt`;
                        csvErrorArray.push(csvErrorString);
                    };

                    //Now check that mockup files exist in the mockup folders
                    
                    if (row['Shirt']) {
                        let testMockupFilePath;
                        let testVideoMockupFilePath;
                        if (row['Single Image File']) {
                            //set the folder to the single image name
                            let testMockupImageNameWithoutExtension = row['Single Image File'].replace(/\.png$/,'');
                            let testMockupFolderName = testMockupImageNameWithoutExtension + "_shirt";
                            testMockupFilePath = './shirt_listing_photos/' + '/' + testMockupFolderName;
                            let videoFileName = testMockupImageNameWithoutExtension.split('_').slice(0, 2).join('_') + "_video.mp4";
                            testVideoMockupFilePath = './shirt_listing_videos/' + videoFileName;
                        } else if (row['Primary Image File']) {
                            //set the folder to the primary image name
                            let testMockupImageNameWithoutExtension = row['Primary Image File'].replace(/\.png$/,'');
                            let testMockupFolderName = testMockupImageNameWithoutExtension + "_shirt";
                            testMockupFilePath = './shirt_listing_photos/' + '/' + testMockupFolderName;
                            let videoFileName = testMockupImageNameWithoutExtension.split('_').slice(0, 2).join('_') + "_video.mp4";
                            testVideoMockupFilePath = './shirt_listing_videos/' + videoFileName;
                        }
                    
                        if (!fs.existsSync(testMockupFilePath)) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No photos folder found at ${testMockupFilePath}`;
                            csvErrorArray.push(csvErrorString);
                        }

                        // Check if testVideoMockupFilePath exists
                        if (!fs.existsSync(testVideoMockupFilePath)) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No video file found at ${testVideoMockupFilePath}`;
                            csvErrorArray.push(csvErrorString);
                        }
                    }
                    
                    if (row['Sweatshirt']) {
                        let testMockupFilePath;
                        let testVideoMockupFilePath;
                        if (row['Single Image File']) {
                            //set the folder to the single image name
                            let testMockupImageNameWithoutExtension = row['Single Image File'].replace(/\.png$/,'');
                            let testMockupFolderName = testMockupImageNameWithoutExtension + "_sweatshirt";
                            testMockupFilePath = './sweatshirt_listing_photos/' + '/' + testMockupFolderName;
                            let videoFileName = testMockupImageNameWithoutExtension.split('_').slice(0, 2).join('_') + "_video.mp4";
                            testVideoMockupFilePath = './sweatshirt_listing_videos/' + videoFileName;
                        } else if (row['Primary Image File']) {
                            //set the folder to the primary image name
                            let testMockupImageNameWithoutExtension = row['Primary Image File'].replace(/\.png$/,'');
                            let testMockupFolderName = testMockupImageNameWithoutExtension + "_sweatshirt";
                            testMockupFilePath = './sweatshirt_listing_photos' + '/' + testMockupFolderName;
                            let videoFileName = testMockupImageNameWithoutExtension.split('_').slice(0, 2).join('_') + "_video.mp4";
                            testVideoMockupFilePath = './sweatshirt_listing_videos/' + videoFileName;
                        }
                    
                        if (!fs.existsSync(testMockupFilePath)) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No photos folder found at ${testMockupFilePath}`;
                            csvErrorArray.push(csvErrorString);
                        }

                        // Check if testVideoMockupFilePath exists
                        if (!fs.existsSync(testVideoMockupFilePath)) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No video file found at ${testVideoMockupFilePath}`;
                            csvErrorArray.push(csvErrorString);
                        }
                    }
                
                    //Now add all future required keys to the row
                    // create an object with keys from allVariationTypes and additionalHeadersForImages with all values set to empty string
                    const additionalKeys = ["Draft Created On Etsy", "Images Added On Etsy", "Linked On Printful", ...additionalHeadersForImages, ...allVariationTypes].reduce((acc, key) => {
                        acc[key] = "";
                        return acc;
                    }, {});

                    // Use Object.assign() to add these keys to create 'updatedRow'
                    const updatedRow = Object.assign({}, row, additionalKeys);

                    rowsArray.push(updatedRow);

                } else {
                    //else if this is a 2nd run of this .csv then add the existing unmodified 'row' to rowsArray
                    rowsArray.push(row);
                    isThisARepeatRun = true;
                }

            });

            csvStream.on('end', () => {
                resolve();
            });

            csvStream.on('error', (err) => {
                reject(err);
            });
        });
    };  

    try {
        await readCsv();

        if (csvErrorArray.length > 0) {
            //console.log("There are errors in the CSV file. Please fix them and try again.");
            res.render("welcome", {
                first_name_hbs: first_name,
                shop_id_hbs: shop_id,
                access_token_hbs: access_token,
                csvErrors: csvErrorArray
            });
            return;
        }

        if (isThisARepeatRun) {
            console.log("RESUMING FROM PREVIOUS RUN OF THIS .CSV FILE");
        } else {
            console.log("No CSV errors found.")
        }

        // If no .csv errors then get IDs from Printful - only if this is the first run of this script
        if (!isThisARepeatRun) {
            console.log("Getting image IDs from Printful.")
            const cookiesString = await fsPromises.readFile('./database/cookies.json', 'utf-8');
            const cookies = JSON.parse(cookiesString);
            browser = await puppeteer.launch({
                executablePath: './chromium/puppeteer/chrome/win64-114.0.5735.133/chrome-win64/chrome.exe', 
                headless: "new"
            });
            const page = await browser.newPage();
            await page.setCookie(...cookies);
            await page.goto('https://www.printful.com/dashboard/library/index', {waitUntil: 'networkidle0'});
            await page.waitForSelector('#file-library-search', { timeout: 20000 });

            for (let row of rowsArray) {
                if (row['Single Image File']) {
                    await page.$eval('#file-library-search', el => el.value = '');
                    await page.type('#file-library-search', row['Single Image File']);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                    try {
                        await page.waitForSelector('.pf-library-item__details ul li', { timeout: 12000 });
                    } catch (error) {
                        throw new Error(`Unable to find the file ${row['Single Image File']} on Printful.`);
                    }
                    //GETTING THE FILE ID
                    let fileId = await page.evaluate(() => {
                        let elements = Array.from(document.querySelectorAll('.pf-library-item__details ul li'));
                        let fileIdElement = elements.find(element => element.textContent.includes('File ID:'));
                        return fileIdElement ? fileIdElement.textContent.split(':')[1].trim() : null;
                    });
                    if (fileId) {
                        let imageNameWithoutExtension = row['Single Image File'].replace(/\.png$/,'');
                        row['Image Folder'] = imageNameWithoutExtension;
                        row['Single Image File'] = fileId;
                    }
                }
                if (row['Primary Image File']){
                    await page.$eval('#file-library-search', el => el.value = '');
                    await page.type('#file-library-search', row['Primary Image File']);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                    try {
                        await page.waitForSelector('.pf-library-item__details ul li', { timeout: 12000 });
                    } catch (error) {
                        throw new Error(`Unable to find the file ${row['Primary Image File']} on Printful.`);
                    }
                    //GETTING THE FILE ID
                    let fileId = await page.evaluate(() => {
                        let elements = Array.from(document.querySelectorAll('.pf-library-item__details ul li'));
                        let fileIdElement = elements.find(element => element.textContent.includes('File ID:'));
                        return fileIdElement ? fileIdElement.textContent.split(':')[1].trim() : null;
                    });
                    if (fileId) {
                        let imageNameWithoutExtension = row['Primary Image File'].replace(/\.png$/,'');
                        // Check if the 'row' already has the key "Draft Created On Etsy" because don't want to overwrite the image folder with the ID
                        row['Image Folder'] = imageNameWithoutExtension;
                        row['Primary Image File'] = fileId;
                    }
                }
                if (row['Secondary Image File']){
                    await page.$eval('#file-library-search', el => el.value = '');
                    await page.type('#file-library-search', row['Secondary Image File']);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(3000);
                    try {
                        await page.waitForSelector('.pf-library-item__details ul li', { timeout: 12000 });
                    } catch (error) {
                        throw new Error(`Unable to find the file ${row['Secondary Image File']} on Printful.`);
                    }
                    //GETTING THE FILE ID
                    let fileId = await page.evaluate(() => {
                        let elements = Array.from(document.querySelectorAll('.pf-library-item__details ul li'));
                        let fileIdElement = elements.find(element => element.textContent.includes('File ID:'));
                        return fileIdElement ? fileIdElement.textContent.split(':')[1].trim() : null;
                    });
                    if (fileId) {
                        row['Secondary Image File'] = fileId;
                    }
                }
            }

            await browser.close();
        }

    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.log("There was a problem getting the Image IDs from Printful, check you're logged in and that all images are uploaded to Printful, and try again");
        res.render("welcome", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            catchErrorMessage: error.message
        });
        return;
    }

    //below variable needs to be outside of the below if statement so that it is available for later use in the etsy draft check
    let startingNumberOfDraftListings;
    const listingStateForCheck = "draft"

    //Now check how many draft listings there are currently on Etsy - only if this isn't a repeat run 
    if (!isThisARepeatRun) {

        console.log("All image IDs found. Now checking how many draft listings there are currently on Etsy.");
        
        const startingNumberOfDraftListingsRequestOptions = {
            headers: {
                'x-api-key': clientID,
                Authorization: `Bearer ${access_token}`,
                'Accept': 'application/json',
            },
        };

        const startingNumberOfDraftListingsResponse = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings?state=${listingStateForCheck}`, startingNumberOfDraftListingsRequestOptions);

        if (startingNumberOfDraftListingsResponse.ok) {
            const startingDraftsData = await startingNumberOfDraftListingsResponse.json();
            startingNumberOfDraftListings = startingDraftsData.count
        } else {
            console.log("Unable to find the starting number of draft listings");
            console.log(startingNumberOfDraftListingsResponse.status, startingNumberOfDraftListingsResponse.statusText);
        }

        console.log(`There are already ${startingNumberOfDraftListings} draft listings on Etsy. Creating new draft listings from the .csv if they haven't already been created.`);
    
    }
        //Now upload to Etsy
    // Error handling related functions

    /////////////////////////////ETSY LISTING FUNCTION START////////////////////////////////////////
    const createListing = async (rowParam, productType) => {
        //create a copy of row so that the original object isn't modified
        let row = {...rowParam};

        try{
            // Load the JSON file to get the default listing data
            let defaultData;
            let rowTitle;
            let isShirt = false;
            let isSweatshirt = false;
            let tags;

            if (productType == "Shirt"){
                isShirt = true;
            } else if (productType == "Sweatshirt"){
                isSweatshirt = true;
            };

            if (isShirt){
                defaultData = JSON.parse(await fsPromises.readFile('./templates/defaultListingDataShirt.json', 'utf8'));
                rowTitle = row['Shirt Product Title'];
                tags = row['Shirt Tags'].split(',').map(tag => tag.trim());
            } else if (isSweatshirt){
                defaultData = JSON.parse(await fsPromises.readFile('./templates/defaultListingDataSweatshirt.json', 'utf8'));
                rowTitle = row['Sweatshirt Product Title'];
                tags = row['Sweatshirt Tags'].split(',').map(tag => tag.trim()); 
            };
            const {quantity, description, price, who_made, when_made, taxonomy_id, shipping_profile_id} = defaultData;

            const requestOptionsDraftCreation = {
                method: 'POST',
                headers: {
                    'x-api-key': clientID,
                    Authorization: `Bearer ${access_token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    quantity,
                    title: rowTitle,
                    description,
                    price,
                    who_made,
                    when_made,
                    taxonomy_id,
                    shipping_profile_id,
                    tags
                })
            };
            const responseDraftCreation = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`, requestOptionsDraftCreation);
            //Saving the listing ID of the newly created draft listing so it can be used for adding the variations, or showing error
            let created_draft_listing_data;
            if (responseDraftCreation.ok) {
                created_draft_listing_data = await responseDraftCreation.json();
            } else {
                const errorData = await responseDraftCreation.json();
                throw new Error(errorData.error);
            }
            let { listing_id } = created_draft_listing_data;

            //ADDING THE VARIATIONS TO THE CREATED LISTING
            //Reading the JSON template that contains all of the variation info
            let jsonDataVariations;
            if (isShirt){
                jsonDataVariations = await fsPromises.readFile('./templates/updateInventoryTemplateShirts.json', 'utf8');
            } else if (isSweatshirt) {
                jsonDataVariations = await fsPromises.readFile('./templates/updateInventoryTemplateSweatshirts.json', 'utf8');
            };
            //Parse the JSON data to JS object
            const products = JSON.parse(jsonDataVariations);
            const requestOptionsInventory = {
                method: 'PUT',
                headers: {
                    'x-api-key': clientID,
                    Authorization: `Bearer ${access_token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(products)
            };
            const responseInventory = await fetch(`https://openapi.etsy.com/v3/application/listings/${listing_id}/inventory`, requestOptionsInventory);
            if (responseInventory.ok) {
                const data = await responseInventory.json();
                // Get product_id values from the JSON data
                const productIds = data.products.map(product => product.product_id);
                // Find the index of either 'Shirt Black / S' or 'Sweatshirt Black / S' in the allVariationTypes array
                let startIndex;
                if (isShirt){
                    startIndex = allVariationTypes.indexOf('Shirt Black / S');
                } else if (isSweatshirt) {
                    startIndex = allVariationTypes.indexOf('Sweatshirt Black / S');
                };
                // Update the copy row object with the product IDs
                allVariationTypes.slice(startIndex).forEach((variationType, index) => {
                    if (productIds[index]) {
                        row[variationType] = productIds[index];
                    }
                });
            } else {
                const errorData = await responseInventory.json();
                throw new Error(errorData.error);
            }

            //Set 'Yes' to only be only in the column Shirt or sweatshirt for this row
            if (isShirt){
                row['Sweatshirt'] = "";
            } else if (isSweatshirt){
                row['Shirt'] = "";
            };

            //Add new info to the row object
            row['Listing ID'] = listing_id;
            row['Draft Created On Etsy'] = "Done";
            
            // Write the copy row object to the rowsArrayAfterEtsyDrafts array
            const record = {};
            Object.keys(row).forEach((key) => {
                record[key] = row[key];
            });
            rowsArrayAfterEtsyDraftCreation.push(record);
        } catch (error) {
            logErrorEtsyDraftCreation(error, row, productType);
        }
    };
    ///////////ETSY LISTING FUNCTION END////////////////////

    let rowCount = 0;
    let rowsArrayAfterEtsyDraftCreation = [];
    let etsyListingCreationErrorsArray = [];

    //Function for logging errors
    const logErrorEtsyDraftCreation = (error, row, productType) => {
        const errorMessage = `Error creating ${productType} listing for ${row[`${productType} Product Title`]}: ${error.message}`;
        etsyListingCreationErrorsArray.push(errorMessage);
    }

    for (let row of rowsArray) {
        rowCount++;
        try {
            if (row['Draft Created On Etsy'] != "Done") {
                if (row['Shirt'] == "Yes") {
                    await createListing(row, "Shirt");
                    await delay(500);
                }
                if (row['Sweatshirt'] == "Yes") {
                    await createListing(row, "Sweatshirt");
                    await delay(500);
                }
            } else {
                // Add the row to rowsArrayAfterEtsyDraftCreation
                const record = {};
                Object.keys(row).forEach((key) => {
                    record[key] = row[key];
                });
                rowsArrayAfterEtsyDraftCreation.push(record);
            }
        } catch (error) {
            etsyListingCreationErrorsArray.push(`Error creating listing for ${row['Shirt Product Title']} or ${row['Sweatshirt Product Title']}: ${error.message}`);
        }
    }

    if (etsyListingCreationErrorsArray.length > 0) {
        res.render("welcome", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            catchErrorMessageEtsyDrafts: etsyListingCreationErrorsArray
        });
        return;
    }

    //Now create the first backup file

    const dateForFilename = getFormattedDate();
    const backupFileName = "EtsyDraftBackup_" + dateForFilename + ".csv";
    const backupDirectory = './backups/';
    const backupFilePath = backupDirectory + backupFileName;

    //Only need to create backup at this point if it isn't a re-run
    if (!isThisARepeatRun) {

        let createBackupFile = createCsvWriter({
            path: backupFilePath,
            header: Object.keys(rowsArrayAfterEtsyDraftCreation[0]).map(key => {
                return {id: key, title: key};
            })
        });

        await createBackupFile.writeRecords(rowsArrayAfterEtsyDraftCreation);

        console.log("All draft listings created");
        console.log(`--> ${backupFilePath}.csv has been created so that you can resume uploading images later if needed.`);

    }

    console.log("Uploading images to Etsy...");

    let image_upload_listing_id;
    let imageName;
    let imageFilePath;
    let imageFolderName;
    let imageFileData;
    let formData;
    let imageUploadCounter;
    let etsyImageUploadErrorsArray = [];
    let videoFilePath;
    let videoFileData;
    let videoFormData;
    let imageRowUploadingCounter = 0;

    for (let thisRow of rowsArrayAfterEtsyDraftCreation) {
        imageRowUploadingCounter++; 
        if (thisRow['Images Added On Etsy'] != "Done") {   
            console.log(`Uploading images for row ${imageRowUploadingCounter} of ${rowsArrayAfterEtsyDraftCreation.length}...`)
            for (let i = 0; i < 10; i++) {
                try {
                    imageUploadCounter = i + 1;
                    image_upload_listing_id = thisRow['Listing ID'];
                    if (thisRow['Shirt']) {
                        imageName = shirtMockupImages[i];
                        imageFolderName = thisRow['Image Folder'] + "_shirt";
                        imageFilePath = './shirt_listing_photos/'+ imageFolderName + '/' + imageName;
                    } else if (thisRow['Sweatshirt']) {
                        imageName = sweatshirtMockupImages[i];
                        imageFolderName = thisRow['Image Folder'] + "_sweatshirt";
                        imageFilePath = './sweatshirt_listing_photos/' + imageFolderName + '/' + imageName;
                    }

                    // Read the file to be uploaded
                    imageFileData = await fsPromises.readFile(imageFilePath);
                    // Prepare the form data
                    formData = new FormData();
                    formData.append('image', imageFileData, imageName);
                    formData.append('rank', imageUploadCounter);
                    formData.append('overwrite', 'true');

                    const imageUploadResponse = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${image_upload_listing_id}/images`, {
                        method: 'POST',
                        headers: {
                            'x-api-key': clientID,
                            Authorization: `Bearer ${access_token}`,
                            ...formData.getHeaders()
                        },
                        body: formData,
                    });

                    let currentImage = "Image" + imageUploadCounter.toString();
                    if (imageUploadResponse.ok) {
                        const json = await imageUploadResponse.json();
                        let uploadedImageID = json.listing_image_id;
                        thisRow[currentImage] = uploadedImageID;
                        //console.log(`Uploaded image ${imageName} to listing ${image_upload_listing_id} with image ID ${uploadedImageID}`)
                        //res.send(`<pre>${JSON.stringify(json, null, 2)}</pre>`);
                    } else {
                        const errorData = await imageUploadResponse.json();
                        throw new Error(errorData.error);
                    }
                } catch (error) {
                    etsyImageUploadErrorsArray.push(`Error uploading image ${imageName} to listing ${image_upload_listing_id}: ${error.message}`);
                }
            }

            //Now for this row assign the variation images
            try {
                //remove the color property from the objectsForVariationImages array
                let newVariationImageArray = objectsForVariationImages.map(({ color, ...rest }) => rest);
                //loop through the newVariationImageArray and assign the image IDs to the objects
                for (let i = 0; i < newVariationImageArray.length; i++) {
                    let currentImage = "Image" + (i + 1).toString();
                    newVariationImageArray[i].image_id = thisRow[currentImage];
                }

                //Now send the newVariationImageArray in the body of an Etsy POST request
                let objectForRequest = {
                    variation_images: newVariationImageArray
                };

                const imageVariationRequestOptions = {
                    method: 'POST',
                    headers: {
                        'x-api-key': clientID,
                        Authorization: `Bearer ${access_token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(objectForRequest)
                };

                const imageVariationResponse = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${image_upload_listing_id}/variation-images`, imageVariationRequestOptions);
                if (imageVariationResponse.ok) {
                    const json = await imageVariationResponse.json();
                } else {
                    const errorData = await imageVariationResponse.json();
                    throw new Error(errorData.error);
                }
            } catch (error) {
                etsyImageUploadErrorsArray.push(`Error assigning variation images to listing ${image_upload_listing_id}: ${error.message}`);
            }

            //Now for this row upload the video
            try {

                let videoFileName = thisRow['Image Folder'].split('_').slice(0, 2).join('_') + "_video.mp4";
                
                if (thisRow['Shirt']) {
                    videoFilePath = './shirt_listing_videos/' + videoFileName;
                } else if (thisRow['Sweatshirt']) {
                    videoFilePath = './sweatshirt_listing_videos/' + videoFileName;
                }

                // Read the file to be uploaded
                videoFileData = await fsPromises.readFile(videoFilePath);
                // Prepare the form data
                videoFormData = new FormData();
                videoFormData.append('video', videoFileData, videoFileName);
                videoFormData.append('name', videoFileName);

                const videoUploadResponse = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${image_upload_listing_id}/videos`, {
                    method: 'POST',
                    headers: {
                        'x-api-key': clientID,
                        Authorization: `Bearer ${access_token}`,
                        ...videoFormData.getHeaders()
                    },
                    body: videoFormData,
                });

                if (videoUploadResponse.ok) {
                    const json = await videoUploadResponse.json();
                } else {
                    const errorData = await videoUploadResponse.json();
                    console.log('1st log of Error Data:', errorData);
                    throw new Error(errorData.error);
                    //throw new Error('A valid name must be provided with a new video file.');
                }

            } catch (error) {
                console.log('Caught Error:', error);
                etsyImageUploadErrorsArray.push(`Error uploading video ${videoFilePath} to listing ${image_upload_listing_id}: ${error.message}`);
            }

            thisRow['Images Added On Etsy'] = "Done";

            //Now overwrite or create the backup CSV file with the updated data from rowsArrayAfterEtsyDraftCreation
            let createBackupFile = createCsvWriter({
                path: backupFilePath,
                header: Object.keys(rowsArrayAfterEtsyDraftCreation[0]).map(key => {
                    return {id: key, title: key};
                })
            });

            await createBackupFile.writeRecords(rowsArrayAfterEtsyDraftCreation);

            console.log(`Updated ${backupFilePath}`)

        }
    }

    console.log(`Image uploading process complete`);

    //write the backup file path to a .txt file so that Printul linking process can pick it up
    fs.writeFileSync('printful_linking_file.txt', backupFilePath, 'utf8');
    console.log(`Printful linking process will use ${backupFilePath}`);

    //check how many Etsy draft listings have been created compared to before the process & confirm that all have been created
    let finalNumberOfDraftListings;
    
    const finalNumberOfDraftListingsRequestOptions = {
        headers: {
            'x-api-key': clientID,
            Authorization: `Bearer ${access_token}`,
            'Accept': 'application/json',
        },
    };

    if (!isThisARepeatRun) {
        console.log("Checking the number of draft listings now showing on Etsy...");
    }

    let finalDraftNumberCounter = 0;

    //loop until the final number of draft listings is equal to the starting number of draft listings + the number of rows in the CSV file
    //Only if the drafts werent previously created on a previous run of the script
    while (finalNumberOfDraftListings != startingNumberOfDraftListings + rowsArrayAfterEtsyDraftCreation.length && finalDraftNumberCounter < 3) {
        
        finalDraftNumberCounter++;
        await delay(5000);

        const finalNumberOfDraftListingsResponse = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings?state=${listingStateForCheck}`, finalNumberOfDraftListingsRequestOptions);

        if (finalNumberOfDraftListingsResponse.ok) {
            const finalDraftsData = await finalNumberOfDraftListingsResponse.json();
            finalNumberOfDraftListings = finalDraftsData.count
        }
    }

    //If the above loop has run 3 times and the number of draft listings on Etsy is still not correct
    if (finalDraftNumberCounter == 3 && isThisARepeatRun == false) {
        console.log("Unable to check that all created draft listings are showing on Etsy - please check manually and then manually sync the products on Printful.");
        if (etsyImageUploadErrorsArray.length > 0) {
            res.render("welcome", {
                first_name_hbs: first_name,
                shop_id_hbs: shop_id,
                access_token_hbs: access_token,
                catchErrorMessageEtsyImageUploads: etsyImageUploadErrorsArray,
                failedEtsyDraftCheck: true
            });
        } else {
            res.render("welcome", {
                first_name_hbs: first_name,
                shop_id_hbs: shop_id,
                access_token_hbs: access_token,
                completedWithNoErrors: true,
                failedEtsyDraftCheck: true
            });
        }
    //else if the number of draft listings showing on Etsy is correct
    } else {

        if (!isThisARepeatRun) {
            console.log("All draft listings are showing on Etsy.");
        }

        console.log("Now refreshing the data on Printful.");

        //Do the printful sync
        let printfulSyncFailed = false;
        const cookiesString = await fsPromises.readFile('./database/cookies.json', 'utf-8');
        const cookies = JSON.parse(cookiesString);
        browser = await puppeteer.launch({
            executablePath: './chromium/puppeteer/chrome/win64-114.0.5735.133/chrome-win64/chrome.exe', 
            headless: false
        });
        const page = await browser.newPage();
        await page.setCookie(...cookies);
        await page.goto(printfulStoreURL, {waitUntil: 'networkidle0'});
        try {
            await page.waitForSelector('span.pf-link.products-view-text-alignment');

            // Get all the elements with the specified selector
            const elements = await page.$$('span.pf-link.products-view-text-alignment');

            let targetElement;
            for (let i = 0; i < elements.length; i++) {
                const text = await page.evaluate(element => element.textContent, elements[i]);
                if (text === 'Refresh data') {
                    targetElement = elements[i];
                    break;
                }
            }

            await targetElement.click();

        } catch (error) {
            console.error('Error waiting for or clicking on element:', error);
            printfulSyncFailed = true;
        }

        if (etsyImageUploadErrorsArray.length > 0) {
            res.render("welcome", {
                first_name_hbs: first_name,
                shop_id_hbs: shop_id,
                access_token_hbs: access_token,
                catchErrorMessageEtsyImageUploads: etsyImageUploadErrorsArray,
                printfulSyncFailed: printfulSyncFailed
            });
        } else {
            res.render("welcome", {
                first_name_hbs: first_name,
                shop_id_hbs: shop_id,
                access_token_hbs: access_token,
                completedWithNoErrors: true,
                printfulSyncFailed: printfulSyncFailed
            });
        }
    }

});

module.exports = router;