const csv = require("csv-parser");
const express = require('express');
const fetch = require("node-fetch");
const fs = require('fs'); 
const fsPromises = require('fs').promises;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const FormData = require('form-data');
const router = express.Router();

const clientID = process.env.ETSY_CLIENT_ID_DIGITAL;

const holidays = {
    "Christmas": 35,
    "Cinco de Mayo": 36,
    "Diwali": 4562,
    "Easter": 37,
    "Eid": 4564,
    "Father's Day": 38,
    "Halloween": 39,
    "Hanukkah": 40,
    "Holi": 4563,
    "Independence Day": 41,
    "Kwanzaa": 42,
    "Lunar New Year": 34,
    "Mother's Day": 43,
    "New Year's": 44,
    "Passover": 47,
    "St Patrick's Day": 45,
    "Thanksgiving": 46,
    "Valentine's Day": 48,
    "Veterans Day": 49
};

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

router.post('/', async (req, res) => {

    const {shop_id, first_name, type_of_run} = req.body;
    let {refresh_token, access_token} = req.body;

    let csvDirectory;

    if (type_of_run === "create") {
        console.log("Creating a new draft listing on Etsy");
        csvDirectory = './.csv/';
    } else if (type_of_run === "resume") {
        console.log("Resuming a previous draft listing upload");
        csvDirectory = './resume/';
    }

    const rowsArray = [];  //store the rows
    const csvErrorArray = []; //store csv rows that have errors
    let lineCount = 1; //for logging the row error message

    let isThisARepeatRun = false;

    //Get shop sections & section IDs first
    let shopSectionTranslations = {};

    const requestOptionsSections = {
        method: 'GET',
        headers: {
            'x-api-key': clientID,
            Authorization: `Bearer ${access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    };
        
    const sectionsResponse = await fetch(
        `https://openapi.etsy.com/v3/application/shops/${shop_id}/sections`,
        requestOptionsSections
        );
    
    //Creating the shopSectionTranslations object which has the shop section titles & the corresponding IDs
    if (sectionsResponse.ok) {
        let sectionsData = await sectionsResponse.json();
        sectionsData.results.forEach(result => {
            shopSectionTranslations[result.title] = result.shop_section_id;
        });
    } else {
        const errorData = await sectionsResponse.json();
        console.log('Error:', errorData);
        res.send({message: "An error occurred while getting the shop sections", error: errorData});
        return;
    }

    const delay = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    //Getting the .csv file from the .csv folder and assigning it to a variable
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
        res.render("welcomeDigital", {
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
                    if (row['Digital'] === 'No' && row['Digital Set'] === 'No') {
                        let csvErrorString = `.CSV Error Row ${lineCount}: No product type selected (Digital/Digital Set)`;
                        csvErrorArray.push(csvErrorString);
                    };
                    if (row['Digital'] === 'Yes' && (!row['Digital Single Image File'] || !row['Digital Product Title'] || !row['Digital Tags'])) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: Missing image or title or tags or section for Digital listing`;
                        csvErrorArray.push(csvErrorString);
                    };
                    if (row['Digital Set'] === 'Yes' && (!row['Digital Set Single Image File'] || !row['Digital Set Product Title'] || !row['Digital Set Tags'])) {
                        let csvErrorString = `.CSV Error Row ${lineCount}: No image or title or tags or section for Digital Set listing`;
                        csvErrorArray.push(csvErrorString);
                    };

                    // Check that the csv values exist in the holidays object
                    if (row['Digital'] === 'Yes' && row['Digital Holiday']){
                        if (!holidays.hasOwnProperty(row['Digital Holiday'])) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: Invalid holiday value for Digital listing`;
                            csvErrorArray.push(csvErrorString);
                            showHolidaysValue = true;
                        }
                    }
                    if (row['Digital Set'] === 'Yes' && row['Digital Set Holiday']){
                        if (!holidays.hasOwnProperty(row['Digital Set Holiday'])) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: Invalid holiday value for Digital Set listing`;
                            csvErrorArray.push(csvErrorString);
                            showHolidaysValue = true;
                        }
                    };

                    //Check that the csv values exist in the shopSectionTranslations object
                    if (row['Digital'] === 'Yes' && row['Digital Section']){
                        if (!shopSectionTranslations.hasOwnProperty(row['Digital Section'])) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No Shop Section '${row['Digital Section']}' found for Digital listing`;
                            csvErrorArray.push(csvErrorString);
                        }
                    }
                    if (row['Digital Set'] === 'Yes' && row['Digital Set Section']){
                        if (!shopSectionTranslations.hasOwnProperty(row['Digital Set Section'])) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No Shop Section '${row['Digital Set Section']}' found for Digital Set listing`;
                            csvErrorArray.push(csvErrorString);
                        }
                    };

                    //Check that the title is 140 characters or less
                    if (row['Digital'] === 'Yes'){
                        if (row['Digital Product Title'].length > 140) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: Digital Product Title is more than 140 characters`;
                            csvErrorArray.push(csvErrorString);
                        }
                    }
                    if (row['Digital Set'] === 'Yes'){
                        if (row['Digital Set Product Title'].length > 140) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: Digital Set Product Title is more than 140 characters`;
                            csvErrorArray.push(csvErrorString);
                        }
                    };

                    //Check that all tags are less than 20 characters
                    const checkTagsLength = (tags, type) => {
                        tags.split(',').forEach((tag) => {
                            if (tag.trim().length > 20) {
                                let csvErrorString = `.CSV Error Row ${lineCount}: The tag "${tag.trim()}" in ${type} listing is more than 20 characters`;
                                csvErrorArray.push(csvErrorString);
                            } else if (tag.trim().length === 0) {
                                let csvErrorString = `.CSV Error Row ${lineCount}: There is an extra comma in the ${type} listing tags`;
                                csvErrorArray.push(csvErrorString);
                            }
                        });
                    };

                    if (row['Digital'] === 'Yes') {
                        checkTagsLength(row['Digital Tags'], 'Digital');
                    }
                
                    if (row['Digital Set'] === 'Yes') {
                        checkTagsLength(row['Digital Set Tags'], 'Digital Set');
                    }

                    //Now check that mockup files exist in the mockup folders
                    function checkPathAndReportError(path, type, lineCount, csvErrorArray) {
                        if (!fs.existsSync(path)) {
                            let csvErrorString = `.CSV Error Row ${lineCount}: No ${type} found at ${path}`;
                            csvErrorArray.push(csvErrorString);
                        }
                    }
                    
                    if (row['Digital'] === 'Yes') {
                        let designFileNameWithoutExtension = row['Digital Single Image File'].replace(/\.png$/,'');
                        let testPhotoMockupFolderPath = './digital_listing_photos/' + designFileNameWithoutExtension;
                        let testVideoMockupFilePath = './digital_listing_videos/' + designFileNameWithoutExtension + '_video.mp4';
                        let testDownloadablesFolderPath = './digital_listing_files/' + designFileNameWithoutExtension;
                        
                        checkPathAndReportError(testPhotoMockupFolderPath, "photos folder", lineCount, csvErrorArray);
                        checkPathAndReportError(testVideoMockupFilePath, "video file", lineCount, csvErrorArray);
                        checkPathAndReportError(testDownloadablesFolderPath, "downloadable-files folder", lineCount, csvErrorArray);
                    }
                    if (row['Digital Set'] === 'Yes') {
                        let designFileNameWithoutExtension = row['Digital Set Single Image File'].replace(/\.png$/,'');
                        let testPhotoMockupFolderPath = './digital_listing_photos/' + designFileNameWithoutExtension;
                        let testVideoMockupFilePath = './digital_listing_videos/' + designFileNameWithoutExtension + '_video.mp4';
                        let testDownloadablesFolderPath = './digital_listing_files/' + designFileNameWithoutExtension;
                        
                        checkPathAndReportError(testPhotoMockupFolderPath, "photos folder", lineCount, csvErrorArray);
                        checkPathAndReportError(testVideoMockupFilePath, "video file", lineCount, csvErrorArray);
                        checkPathAndReportError(testDownloadablesFolderPath, "downloadable-files folder", lineCount, csvErrorArray);
                    }
                
                    //Now add all future required keys to the row
                    const additionalKeys = ["Draft Created On Etsy", "Listing ID", "Images Added On Etsy"].reduce((acc, key) => {
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

                    if (type_of_run === "create") {
                        csvErrorArray.push("This .CSV file has already been used to create draft listings. Click the 'Resume Etsy Drafts' button if you were trying to resume from this .csv");
                    }
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

    //a flag to set whether to show the holidays object in the app if there are holiday errors
    //needs to be here for scope outside of the try/catch
    let showHolidaysValue = false;

    try {

        await readCsv();

        if (csvErrorArray.length > 0) {
            //console.log("There are errors in the CSV file. Please fix them and try again.");
            res.render("welcomeDigital", {
                first_name_hbs: first_name,
                shop_id_hbs: shop_id,
                access_token_hbs: access_token,
                csvErrors: csvErrorArray,
                showHolidaysValue,
                holidays
            });
            return;
        }

        if (isThisARepeatRun) {
            console.log("RESUMING FROM PREVIOUS RUN OF THIS .CSV FILE");
        } else {
            console.log("No CSV errors found.")
        }

    } catch (error) {
        console.log(error);
    }
    
    //Now upload to Etsy

    /////////////////////////////ETSY LISTING FUNCTION START////////////////////////////////////////
    const createListing = async (rowParam, productType) => {
        //create a copy of row so that the original object isn't modified
        let row = {...rowParam};

        try{
            // Load the JSON file to get the default listing data
            let defaultData;
            let isDigital = false;
            let isDigitalSet = false;
            //listing details
            let rowTitle;
            let tags;
            let section;
            let holiday;

            if (productType == "Digital"){
                isDigital = true;
            } else if (productType == "Digital Set"){
                isDigitalSet = true;
            };

            if (isDigital){
                defaultData = JSON.parse(await fsPromises.readFile('./templates/defaultListingDataDigital.json', 'utf8'));
                rowTitle = row['Digital Product Title'];
                tags = row['Digital Tags'].split(',').map(tag => tag.trim());
                if (row['Digital Section']) {
                    section = shopSectionTranslations[row['Digital Section']];
                }
            } else if (isDigitalSet){
                defaultData = JSON.parse(await fsPromises.readFile('./templates/defaultListingDataDigitalSet.json', 'utf8'));
                rowTitle = row['Digital Set Product Title'];
                tags = row['Digital Set Tags'].split(',').map(tag => tag.trim());
                if (row['Digital Set Section']) {
                    section = shopSectionTranslations[row['Digital Set Section']];
                }
            };
            const {quantity, price, who_made, when_made, taxonomy_id, type} = defaultData;
            let {description } = defaultData;

            //Add the title to the start of the description
            description = rowTitle + "\n\n" + description;

            //Calculate the id value of the shop section
            //console.log("Got up to before the POST")

            let requestBodyDraftCreation = {
                quantity,
                title: rowTitle,
                description,
                price,
                who_made,
                when_made,
                taxonomy_id,
                type,
                tags
            };

            if (section) {
                requestBody.shop_section_id = section;
            }

            const requestOptionsDraftCreation = {
                method: 'POST',
                headers: {
                    'x-api-key': clientID,
                    Authorization: `Bearer ${access_token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBodyDraftCreation)
            };

            const responseDraftCreation = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`, requestOptionsDraftCreation);
            //Saving the listing ID of the newly created draft listing so it can be used for adding the variations, or showing error
            let created_draft_listing_data;
            if (responseDraftCreation.ok) {
                created_draft_listing_data = await responseDraftCreation.json();
            } else {
                const errorData = await responseDraftCreation.json();
                console.log('Error data:', errorData);
                throw new Error(errorData.error);
            }
            let { listing_id } = created_draft_listing_data;

            //Now update the Holiday property///////////////////////////////

            //This is the fixed ID for the Holiday property (got from the taxonomy endpoint) 
            const property_id = 46803063659;

            let isThereAHolidayValueToSet = false;

            let holidayPropertyID = [];
            let holidayPropertyName = [];
            if (isDigital && row['Digital Holiday']){
                holidayPropertyID.push(holidays[row['Digital Holiday']]);
                holidayPropertyName.push(row['Digital Holiday']);
                isThereAHolidayValueToSet = true;
            } else if (isDigitalSet && row['Digital Set Holiday']){
                holidayPropertyID.push(holidays[row['Digital Set Holiday']]);
                holidayPropertyName.push(row['Digital Set Holiday']);
                isThereAHolidayValueToSet = true;
            };

            if (isThereAHolidayValueToSet){
                const requestOptionsAddProperty = {
                    method: 'PUT',
                    headers: {
                        'x-api-key': clientID,
                        Authorization: `Bearer ${access_token}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        value_ids: holidayPropertyID,
                        values: holidayPropertyName
                    })
                };
                const responseAddProperty = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${listing_id}/properties/${property_id}`, requestOptionsAddProperty);

                if (responseAddProperty.ok) {
                    let resultFromAddingProperty = await responseAddProperty.json();
                } else {
                    const errorData = await responseAddProperty.json();
                    throw new Error(errorData.error);
                }
            };

            //Set 'Yes' to only be only in the column Shirt or sweatshirt for this row
            if (isDigital){
                row['Digital Set'] = "No";
            } else if (isDigitalSet){
                row['Digital'] = "No";
            };

            //Add new info to the row object
            row['Listing ID'] = listing_id;
            row['Draft Created On Etsy'] = "Done";
            
            // Write the copy row object to the rowsArrayAfterEtsyDrafts array
            rowsArrayAfterEtsyDraftCreation.push(row);

        } catch (error) {
            console.log(`Error in catch block:`);
            console.log(error);
            logErrorEtsyDraftCreation(error, row, productType);
        }
    };
    ///////////ETSY LISTING FUNCTION END////////////////////

    let rowCount = 0;
    let rowsArrayAfterEtsyDraftCreation = [];
    let etsyListingCreationErrorsArray = [];

    //Function for logging errors
    const logErrorEtsyDraftCreation = (error, row, productType) => {
        console.log(`Error in function:`);
        console.log(error);
        const errorMessage = `Error creating ${productType} listing for ${row[`${productType} Product Title`]}: ${error.message}`;
        etsyListingCreationErrorsArray.push(errorMessage);
    }

    for (let row of rowsArray) {
        rowCount++;
        try {
            if (row['Draft Created On Etsy'] != "Done") {
                if (row['Digital'] == "Yes") {
                    await createListing(row, "Digital");
                    await delay(500);
                }
                if (row['Digital Set'] == "Yes") {
                    await createListing(row, "Digital Set");
                    await delay(500);
                }
            } else {
                // Add the row to rowsArrayAfterEtsyDraftCreation for the backup spreadsheet
                rowsArrayAfterEtsyDraftCreation.push(row);
            }
        } catch (error) {
            etsyListingCreationErrorsArray.push(`Error creating listing for ${row['Digital Product Title']} or ${row['Digital Set Product Title']}: ${error.message}`);
        }   
        
    }

    if (etsyListingCreationErrorsArray.length > 0) {
        res.render("welcomeDigital", {
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

    console.log("Uploading images & files to Etsy...");

    let image_upload_listing_id;
    let imageFolderName;
    let imageFilePath;
    let photoFilesArray;
    let imageFileData;
    let formData;
    let imageUploadCounter;
    let etsyImageUploadErrorsArray = [];
    let videoFilePath;
    let videoFileData;
    let videoFormData;
    let imageRowUploadingCounter = 0;

    let downloadableFilesPath;
    let downloadableFilesArray;
    let downloadableImageCounter;
    let downloadableFileData;
    let downloadableFileFormData;
    

    for (let thisRow of rowsArrayAfterEtsyDraftCreation) {

        imageRowUploadingCounter++;

        if (thisRow['Images Added On Etsy'] != "Done") {

            console.log(`Uploading photos for listing ${imageRowUploadingCounter} of ${rowsArrayAfterEtsyDraftCreation.length}...`)

            image_upload_listing_id = thisRow['Listing ID'];

            //First get all of the images from the photo folder into an array
            if (thisRow['Digital'] === 'Yes') {
                imageFolderName = thisRow['Digital Single Image File'].replace(/\.[^/.]+$/, '');
            } else if (thisRow['Digital Set'] === 'Yes') {
                imageFolderName = thisRow['Digital Set Single Image File'].replace(/\.[^/.]+$/, '');
            }
            imageFilePath = './digital_listing_photos/' + imageFolderName;
            try {
                photoFilesArray = await fsPromises.readdir(imageFilePath);
            } catch (error) {
                etsyImageUploadErrorsArray.push(`Error reading directory ${imageFilePath}: ${error.message}`);
            }

            photoFilesArray.sort((a, b) => {
                // Extract the leading numbers from the filenames
                const numberA = parseInt(a.match(/^\d+/));
                const numberB = parseInt(b.match(/^\d+/));
            
                // Compare the numbers
                return numberA - numberB;
            });

            for (let i = 0; i < photoFilesArray.length; i++) {
                try {
                    imageUploadCounter = i + 1;
                    
                    // Read the file to be uploaded
                    imageFileData = await fsPromises.readFile(imageFilePath + '/' + photoFilesArray[i]);
                    // Prepare the form data
                    formData = new FormData();
                    formData.append('image', imageFileData, photoFilesArray[i]);
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

                    let currentImage = "image " + imageUploadCounter.toString();
                    if (imageUploadResponse.ok) {
                        const json = await imageUploadResponse.json();
                    } else {
                        const errorData = await imageUploadResponse.json();
                        throw new Error(errorData.error);
                    }
                } catch (error) {
                    etsyImageUploadErrorsArray.push(`Error uploading image ${photoFilesArray[i]} to listing ${image_upload_listing_id}: ${error.message}`);
                }
            }

            //Now for this row upload the video
            try {

                console.log(`Uploading video for listing ${imageRowUploadingCounter} of ${rowsArrayAfterEtsyDraftCreation.length}...`)

                let videoFileName = imageFolderName + '_video.mp4';
                videoFilePath = './digital_listing_videos/' + videoFileName;

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

            //Now for this row upload the downloadable files

            try {

                console.log(`Uploading files for listing ${imageRowUploadingCounter} of ${rowsArrayAfterEtsyDraftCreation.length}...`)

                //First get all of the images from the downloadable files folder into an array
                downloadableFilesPath = './digital_listing_files/' + imageFolderName;
                try {
                    downloadableFilesArray = await fsPromises.readdir(downloadableFilesPath);
                } catch (error) {
                    etsyImageUploadErrorsArray.push(`Error reading directory ${downloadableFilesPath}: ${error.message}`);
                }

                downloadableFilesArray.sort((a, b) => {
                    // Extract the leading numbers from the filenames
                    const numberA = parseInt(a.match(/^\d+/));
                    const numberB = parseInt(b.match(/^\d+/));
                
                    // Compare the numbers
                    return numberA - numberB;
                });

                for (let i = 0; i < downloadableFilesArray.length; i++) {
                    try {
                        downloadableImageCounter = i + 1;
                        
                        // Read the file to be uploaded
                        downloadableFileData = await fsPromises.readFile(downloadableFilesPath + '/' + downloadableFilesArray[i]);
                        // Prepare the form data
                        downloadableFileFormData = new FormData();
                        downloadableFileFormData.append('file', downloadableFileData, downloadableFilesArray[i]);
                        downloadableFileFormData.append('name', downloadableFilesArray[i]);
                        downloadableFileFormData.append('rank', downloadableImageCounter);
    
                        const downloadableFileUploadResponse = await fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${image_upload_listing_id}/files`, {
                            method: 'POST',
                            headers: {
                                'x-api-key': clientID,
                                Authorization: `Bearer ${access_token}`,
                                ...downloadableFileFormData.getHeaders()
                            },
                            body: downloadableFileFormData,
                        });
    
                        if (downloadableFileUploadResponse.ok) {
                            const json = await downloadableFileUploadResponse.json();
                        } else {
                            const errorData = await downloadableFileUploadResponse.json();
                            throw new Error(errorData.error);
                        }
                    } catch (error) {
                        etsyImageUploadErrorsArray.push(`Error uploading downloadable file ${downloadableFilesArray[i]} to listing ${image_upload_listing_id}: ${error.message}`);
                    }
                }

            } catch (error) {
                console.log('Caught Error:', error);
                etsyImageUploadErrorsArray.push(`Error uploading downloadable files ${imageFolderName} to listing ${image_upload_listing_id}: ${error.message}`);
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

        //Refresh the access token every 20 rows
        if (imageRowUploadingCounter % 20 === 0) {
            try {
                const newTokens = await refreshTokens(refresh_token);
                refresh_token = newTokens.refresh_token;
                access_token = newTokens.access_token;
                console.log('API Tokens refreshed');
            } catch (error) {
                console.error('Error refreshing tokens:', error);
                etsyImageUploadErrorsArray.push('Error refreshing tokens');
            }
        }
    }

    console.log(`Image & file uploading process complete`);

    if (etsyImageUploadErrorsArray.length > 0) {
        res.render("welcomeDigital", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            catchErrorMessageEtsyImageUploads: etsyImageUploadErrorsArray
        });
    } else {
        res.render("welcomeDigital", {
            first_name_hbs: first_name,
            shop_id_hbs: shop_id,
            access_token_hbs: access_token,
            completedWithNoErrors: true
        });
    }

});

module.exports = router;