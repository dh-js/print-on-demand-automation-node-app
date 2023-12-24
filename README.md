# Etsy Scraper App

This is a Node.js application that automates various tasks related to Etsy and Printful. It uses Puppeteer for web scraping and automation, Express for the server, and Handlebars for the user interface.

## Features

- **Etsy Scraping**: The application can scrape Etsy search results and analyze the data. It generates a text file with the most common keywords found in the listings. This is handled by the `etsyScraperEndpoint.js` file.

- **Creating Etsy Drafts**: The application can create Etsy drafts for shirts and sweatshirts. This is handled by the `createEtsyDraftsShirtSweat.js` file.

- **Syncing Variants with Printful**: The application can sync variants with Printful. This is handled by the `printfulSyncVariantsShirtSweat.js` file.

- **Text File Cleansing**: The application can cleanse text files in two stages. This is handled by the `cleanseTextfileEndpoint.js` file.

- **Getting Etsy Description**: The application can fetch the description of an Etsy listing. This is handled by the `getEtsyDescription.js` file.

- **Creating Digital Etsy Draft Listings**: The application can create digital Etsy draft listings. This is handled by the `digitalEtsyListing.js` file.

- **Pinterest Endpoint**: The application has a Pinterest endpoint, which is handled by the `pinterestEndpoint.js` file.

- **User Interface**: The application provides a simple user interface in the browser using Handlebars. After each operation is completed, a success message is displayed on the page.

## Running the App

The application is started by running the `server.js` file. The server listens on port 3003 and automatically opens the application in the default web browser.

The application can also be packaged into a portable executable file using PKG. This allows the client to run the app on their PC as needed.

## Dependencies

The application uses the following dependencies:

- express
- hbs
- puppeteer
- puppeteer-extra
- puppeteer-extra-plugin-stealth
- csv-parser
- csv-writer
- dotenv
- form-data
- node-fetch

## Note

The application uses Puppeteer's stealth plugin to avoid being detected as a bot by Etsy. If too many requests are made, Etsy may temporarily block the application. In this case, the application will inform the user and stop the scraping process. Random delays are used to mimic human behavior and further avoid bot detection.
