const csv = require("csv-parser");
const express = require('express');
const fetch = require("node-fetch");
const fs = require('fs'); 
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const router = express.Router();

const printfulApiKey = process.env.PRINTFUL_API_KEY;

const sweatshirtPrintfulVariantIds = [
    ['Sweatshirt Black / S', 5434],
    ['Sweatshirt Black / M', 5435],
    ['Sweatshirt Black / L', 5436],
    ['Sweatshirt Black / XL', 5437],
    ['Sweatshirt Black / 2X', 5438],
    ['Sweatshirt Black / 3X', 5439],
    ['Sweatshirt Black / 4X', 5440],
    ['Sweatshirt Black / 5X', 5441],
    ['Sweatshirt Navy / S', 5498],
    ['Sweatshirt Navy / M', 5499],
    ['Sweatshirt Navy / L', 5500],
    ['Sweatshirt Navy / XL', 5501],
    ['Sweatshirt Navy / 2X', 5502],
    ['Sweatshirt Navy / 3X', 5503],
    ['Sweatshirt Navy / 4X', 5504],
    ['Sweatshirt Navy / 5X', 5505],
    ['Sweatshirt Dark Heather / S', 10833],
    ['Sweatshirt Dark Heather / M', 10834],
    ['Sweatshirt Dark Heather / L', 10835],
    ['Sweatshirt Dark Heather / XL', 10836],
    ['Sweatshirt Dark Heather / 2X', 10837],
    ['Sweatshirt Dark Heather / 3X', 10838],
    ['Sweatshirt Dark Heather / 4X', 10839],
    ['Sweatshirt Dark Heather / 5X', 10840],
    ['Sweatshirt Sport Grey / S', 5514],
    ['Sweatshirt Sport Grey / M', 5515],
    ['Sweatshirt Sport Grey / L', 5516],
    ['Sweatshirt Sport Grey / XL', 5517],
    ['Sweatshirt Sport Grey / 2X', 5518],
    ['Sweatshirt Sport Grey / 3X', 5519],
    ['Sweatshirt Sport Grey / 4X', 5520],
    ['Sweatshirt Sport Grey / 5X', 5521],
    ['Sweatshirt White / S', 5426],
    ['Sweatshirt White / M', 5427],
    ['Sweatshirt White / L', 5428],
    ['Sweatshirt White / XL', 5429],
    ['Sweatshirt White / 2X', 5430],
    ['Sweatshirt White / 3X', 5431],
    ['Sweatshirt White / 4X', 5432],
    ['Sweatshirt White / 5X', 5433]
];

const shirtPrintfulVariantIds = [
    ['Shirt Black / S', 474],
    ['Shirt Black / M', 505],
    ['Shirt Black / L', 536],
    ['Shirt Black / XL', 567],
    ['Shirt Black / 2X', 598],
    ['Shirt Black / 3X', 629],
    ['Shirt Navy / S', 496],
    ['Shirt Navy / M', 527],
    ['Shirt Navy / L', 558],
    ['Shirt Navy / XL', 589],
    ['Shirt Navy / 2X', 620],
    ['Shirt Navy / 3X', 651],
    ['Shirt Dark Heather / S', 483],
    ['Shirt Dark Heather / M', 514],
    ['Shirt Dark Heather / L', 545],
    ['Shirt Dark Heather / XL', 576],
    ['Shirt Dark Heather / 2X', 607],
    ['Shirt Dark Heather / 3X', 638],
    ['Shirt Sport Grey / S', 503],
    ['Shirt Sport Grey / M', 534],
    ['Shirt Sport Grey / L', 565],
    ['Shirt Sport Grey / XL', 596],
    ['Shirt Sport Grey / 2X', 627],
    ['Shirt Sport Grey / 3X', 658],
    ['Shirt White / S', 473],
    ['Shirt White / M', 504],
    ['Shirt White / L', 535],
    ['Shirt White / XL', 566],
    ['Shirt White / 2X', 597],
    ['Shirt White / 3X', 628]
];

router.put("/", async (req, res) => {

    const {access_token, shop_id, first_name} = req.body;

    const headers = {
        'Authorization': `Bearer ${printfulApiKey}`,
        'Content-Type': 'application/json'
    };

    let printfulErrorsArray = [];

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    console.log("STARTING PRINTFUL LINKING PROCESS...")

    const readRowsArray = [];
    const csvErrorArray = []; //store csv rows that have errors

    let readFile;

    if (fs.existsSync('printful_linking_file.txt')) {
        readFile = fs.readFileSync('printful_linking_file.txt', 'utf8');
        console.log(`Using file: ${readFile}`);
    } else {
        console.error('Unable to find printful_linking_file.txt');
        res.send('Unable to find printful_linking_file.txt');
        return;
    }
    
    if (!readFile) {
        csvErrorArray.push("There was a problem reading the printful_linking_file.txt file. Please check the file and try again.");
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

    const readCsv = () => {
        return new Promise((resolve, reject) => {
            csvStream.on('data', (row) => {
                readRowsArray.push(row);
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
    } catch (err) {
        console.error(`Unable to read the CSV file ${readFile}:`, err);
        res.send(`Unable to read the CSV file ${readFile}: ${err}`);
        return;
    }


    const processRow = async (row) => {
        let isShirt = Boolean(row[shirtPrintfulVariantIds[0][0]]);
        let isSweatshirt = Boolean(row[sweatshirtPrintfulVariantIds[0][0]]);
        try {
            let isSingleImage = Boolean(row['Single Image File']);
            let isDoubleImage = Boolean(row['Primary Image File']);
            let arrayToUse;
            let primaryImageLength;
            let secondaryImageStart;
            if (isShirt) {
                arrayToUse = shirtPrintfulVariantIds;
            } else if (isSweatshirt) {
                arrayToUse = sweatshirtPrintfulVariantIds;
            };
        
            if (isSingleImage) {
                for (let i = 0; i < arrayToUse.length; i++) {
                    await delay(7000);
        
                    const variantID = "@" + row[arrayToUse[i][0]];
                    const printfulCatalogID = arrayToUse[i][1];
                    const url = `https://api.printful.com/sync/variant/${variantID}`;
                    const body = {
                        variant_id: printfulCatalogID,
                        files: [{
                            id: row['Single Image File']
                        }],
                        options: [{
                            id: "embroidery_type",
                            value: "flat"
                        }]
                    };
                    const response = await fetch(url, {
                        method: 'PUT',
                        headers: headers,
                        body: JSON.stringify(body)
                    });
        
                    if (response.ok) {
                        await response.json();
                    } else {
                        const errorData = await response.text();
                        if (response.status == 502) {
                            throw new Error(`Problem with Printful server. Re-run the automation in a few minutes time and it will attempt to re-link this variation.`);
                        } else {
                            throw new Error(`HTTP Status: ${response.status} - ${errorData}`);
                        }
                    }
                }
            }
            if (isDoubleImage) {
                if (isShirt) {
                    primaryImageLength = 18;
                } else if (isSweatshirt) {
                    primaryImageLength = 24;
                };
                //Add the primary print file
                for (let i = 0; i < primaryImageLength; i++) {
                    await delay(7000);
        
                    const variantID = "@" + row[arrayToUse[i][0]];
                    const printfulCatalogID = arrayToUse[i][1];
                    const url = `https://api.printful.com/sync/variant/${variantID}`;
                    const body = {
                        variant_id: printfulCatalogID,
                        files: [{
                            id: row['Primary Image File']
                        }],
                        options: [{
                            id: "embroidery_type",
                            value: "flat"
                        }]
                    };
                    const response = await fetch(url, {
                        method: 'PUT',
                        headers: headers,
                        body: JSON.stringify(body)
                    });
        
                    if (response.ok) {
                        await response.json();
                    } else {
                        const errorData = await response.text();
                        if (response.status == 502) {
                            throw new Error(`Problem with Printful server. Re-run the automation in a few minutes time and it will attempt to re-link this variation.`);
                        } else {
                            throw new Error(`HTTP Status: ${response.status} - ${errorData}`);
                        }
                    }
                }
                if (isShirt) {
                    secondaryImageStart = 18;
                } else if (isSweatshirt) {
                    secondaryImageStart = 24;
                };
                //Add the remaining print files
                for (let i = secondaryImageStart; i < arrayToUse.length; i++) {
                    await delay(7000);
        
                    const variantID = "@" + row[arrayToUse[i][0]];
                    const printfulCatalogID = arrayToUse[i][1];
                    const url = `https://api.printful.com/sync/variant/${variantID}`;
                    const body = {
                        variant_id: printfulCatalogID,
                        files: [{
                            id: row['Secondary Image File']
                        }],
                        options: [{
                            id: "embroidery_type",
                            value: "flat"
                        }]
                    };
                    const response = await fetch(url, {
                        method: 'PUT',
                        headers: headers,
                        body: JSON.stringify(body)
                    });
        
                    if (response.ok) {
                        await response.json();
                    } else {
                        const errorData = await response.text();
                        if (response.status == 502) {
                            throw new Error(`Problem with Printful server. Re-run the automation in a few minutes time and it will attempt to re-link this listing.`);
                        } else {
                            throw new Error(`HTTP Status: ${response.status} - ${errorData}`);
                        }
                    }
                }
            }

            // if all operations complete successfully, return the row with "Done" in the "Linked On Printful" column
            row['Linked On Printful'] = "Done";

        } catch (error) {

            if (isShirt) {
                console.error(`${error.message} --- Error linking the variations for ${row['Shirt Product Title']}`);
                printfulErrorsArray.push(`${error.message} --- Error linking the variations for ${row['Shirt Product Title']}`);
            } else if (isSweatshirt) {
                console.error(`${error.message} --- Error linking the variations for ${row['Sweatshirt Product Title']}`);
                printfulErrorsArray.push(`${error.message} --- Error linking the variations for ${row['Sweatshirt Product Title']}`);
            };

            // if an error occurs, return the row with "Error" in the "Linked On Printful" column
            row['Linked On Printful'] = "Error";
        }
        
    };

    const dateForFilename = getFormattedDate();
    const backupFileName = "printfulBackup_" + dateForFilename + ".csv";
    const backupDirectory = './backups/';
    const backupFilePath = backupDirectory + backupFileName;

    for (let i = 0; i < readRowsArray.length; i++) {
        if (readRowsArray[i]['Linked On Printful'] != "Done") {
            console.log(`Row ${i + 1} of ${readRowsArray.length}...`)

            await processRow(readRowsArray[i]);

            //write the backup file path to a .txt file so that Printul linking process can pick it up
            fs.writeFileSync('printful_linking_file.txt', backupFilePath, 'utf8');

            //Now write the rowsArrayAfterEtsyDraftCreation to a new CSV file, using the keys from the first row as the headers
            let csvWriter = createCsvWriter({
                path: backupFilePath,
                header: Object.keys(readRowsArray[0]).map(key => {
                    return {id: key, title: key};
                })
            });

            // write row to csv file
            await csvWriter.writeRecords(readRowsArray);

            console.log(`Updated ${backupFilePath}.csv`)
        } 
    }

    let successfullyWrittenCsv = true;

    console.log("Finished linking the variations to Printful.")

    res.json({
        first_name_hbs: first_name,
        shop_id_hbs: shop_id,
        access_token_hbs: access_token,
        successfullyWrittenCsv: successfullyWrittenCsv,
        printfulErrorsArray: printfulErrorsArray
    });
    
});

module.exports = router;