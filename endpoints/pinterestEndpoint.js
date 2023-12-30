const express = require('express');
const fetch = require("node-fetch");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const router = express.Router();
const fs = require('fs');

const clientID = process.env.ETSY_CLIENT_ID_DIGITAL;

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

router.get('/', async (req, res) => {
    const { access_token, shop_id, first_name, button_pressed, active_listings } = req.query;

    let etsyStateParam;
    active_listings === 'true' ? etsyStateParam = 'active' : etsyStateParam = 'draft';
    
    //Get shop category IDs first
    let shopCategoryTranslations = {};

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
    
    //Creating an array of objects with the shop category IDs and their corresponding names for later use
    if (sectionsResponse.ok) {
        sectionsData = await sectionsResponse.json();
        sectionsData.results.forEach(result => {
            shopCategoryTranslations[result.shop_section_id] = result.title;
        });
    } else {
        const errorData = await listingsResponse.json();
        console.log('Error:', errorData);
    }

    //Get the listing data
    let parsedData = [];
    let errorsArray = [];
    const limit = 100;
    let offset = 0;
    let stayInLoop = true;
    let listingCount;

    const requestOptions = {
        method: 'GET',
        headers: {
            'x-api-key': clientID,
            Authorization: `Bearer ${access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    };

    // Read the pinterest_description.txt file contents for creation of the Pinterest description later
    let pinterestDescriptionFile;

    if (fs.existsSync('pinterest_description.txt')) {
        pinterestDescriptionFile = fs.readFileSync('pinterest_description.txt', 'utf8');
        console.log(`Successfully using contents of pinterest_description.txt file`);
    } else {
        console.error('Unable to find pinterest_description.txt');
        res.send('Unable to find pinterest_description.txt');
        return;
    }
    
    if (!pinterestDescriptionFile) {
        res.send('Unable to find pinterest_description.txt');
    }
    

    while (stayInLoop) {
        
        const listingsResponse = await fetch(
            `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings?state=${etsyStateParam}&limit=${limit}&offset=${offset}&includes=Images,Videos`,
            requestOptions
            );
        
        let listingsData;
        if (listingsResponse.ok) {
            listingsData = await listingsResponse.json();
            listingsData.results.forEach(result => {
                //Creating the object based on whether the user is creating an image or video csv
                let obj = {};
                if (button_pressed === 'videoCSV') {
                    obj = {
                        title: result.title.split(',').slice(0, 3).join(','),
                        mediaURL: result.videos[0].video_url,
                        pinterestBoard: shopCategoryTranslations[result.shop_section_id] ? shopCategoryTranslations[result.shop_section_id] : null,
                        thumbnail: '0:00',
                        description: result.title + '\n\n' + pinterestDescriptionFile,
                        link: result.url,
                        publishDate: null,
                        keywords: result.tags.slice(0, 10).join(', ')
                    };
                } else {
                    obj = {
                        title: result.title.split(',').slice(0, 3).join(','),
                        mediaURL: result.images[0].url_fullxfull,
                        pinterestBoard: shopCategoryTranslations[result.shop_section_id] ? shopCategoryTranslations[result.shop_section_id] : null,
                        thumbnail: null,
                        description: result.title + '\n\n' + pinterestDescriptionFile,
                        link: result.url,
                        publishDate: null,
                        keywords: result.tags.slice(0, 10).join(', ')
                    };
                }
                parsedData.push(obj);
            });

            //res.send(`<pre>${JSON.stringify(listingsData, null, 4)}</pre>`);

        } else {
            const errorData = await listingsResponse.json();
            console.log('Error:', errorData);
            errorsArray.push(errorData);
        }
        listingCount = listingsData.count;
        offset = offset + 100;
        if (offset >= listingCount) {
            stayInLoop = false;
        };
    }

    const dateForFilename = getFormattedDate();
    const newFileName = `./pinterest_${dateForFilename}.csv`;

    const csvWriter = createCsvWriter({
        path: newFileName,
        header: [
            {id: 'title', title: 'Title'},
            {id: 'mediaURL', title: 'Media URL'},
            {id: 'pinterestBoard', title: 'Pinterest board'},
            {id: 'thumbnail', title: 'Thumbnail'},
            {id: 'description', title: 'Description'},
            {id: 'link', title: 'Link'},
            {id: 'publishDate', title: 'Publish date'},
            {id: 'keywords', title: 'Keywords'}
        ]
    });

    try {
        await csvWriter.writeRecords(parsedData);
        console.log('Pinterest CSV file was written successfully');
    } catch (error) {
        console.error('Error writing CSV file:', error);
    }

    if (errorsArray.length > 0) {
        res.render('welcomeDigital', {
            first_name_hbs: first_name,
            access_token_hbs: access_token,
            shop_id_hbs: shop_id,
            pinterestCsvCreated: true,
            pinterestCsvErrors: errorsArray
        });
    } else {
        console.log('No errors');
        res.render('welcomeDigital', {
            first_name_hbs: first_name,
            access_token_hbs: access_token,
            shop_id_hbs: shop_id,
            pinterestCsvCreated: true,
            pinterestCsvNoErrors: true
        });
    }
    
});

module.exports = router;