const express = require('express');
const fs = require('fs');
const fsPromises = require('fs').promises;
const router = express.Router();
const multer = require('multer');

// Defining the storage for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'database/')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

router.post('/stage1', upload.single('txtfile'), async function(req, res) {
    console.log("Starting stage 1 cleansing of text file...")

    // Access the uploaded .txt file
    const uploadedFile = req.file;
    // Access the text entered into the text field
    const enteredText = req.body.textinput;

    // Only add new phrases if enteredText is not empty
    if (enteredText.trim() !== '') {
        // First add any new phrases to the find_and_delete_phrases.txt database
        try {
            // Remove empty lines from enteredText
            const cleanedText = enteredText.split('\n').filter(line => line.trim() !== '').join('\n');
        
            // Open the file for appending (this creates the file if it doesn't exist)
            const file = await fsPromises.open('./find_and_delete_phrases.txt', 'a');
            await file.close();
            
            // Read the existing content of the file & check if the existing content ends with a newline
            const existingContent = await fsPromises.readFile('./find_and_delete_phrases.txt', 'utf8');
            const suffix = existingContent.endsWith('\n') ? '' : '\n';
        
            // Append the cleaned text to existing .txt file in project root
            await fsPromises.appendFile('./find_and_delete_phrases.txt', suffix + cleanedText + '\n');
            console.log("The new phrases were added to 'find_and_delete_phrases.txt'!");
        } catch (err) {
            console.error('Error appending to file:', err);
        }
    }

    //Next read the newly updated find_and_delete_phrases.txt and add all phrases to an array
    let removalPhrases = [];
    try {
        // Read the updated file & split the file content into words
        const updatedFileContent = await fsPromises.readFile('./find_and_delete_phrases.txt', 'utf8');
        const replaceCommasWithSpaces = updatedFileContent.replace(/,/g, ' ');
        const replacedContent = replaceCommasWithSpaces.replace(/\s+/g, ' ');
        const removedCommas = replacedContent.replace(/,/g, '');
        // Split the file content into words
        removalPhrases = removedCommas.split(' ').map(word => word.trim()).filter(word => word !== '');
        
        // Sort the phrases by length in descending order
        removalPhrases.sort((a, b) => b.length - a.length);

    } catch (err) {
        console.error('Error reading updated file:', err);
    }

    //Now read the uploaded .txt file and store the lines in allOriginalTitles
    let allOriginalTitles = [];
    try {
        const fileContent = await fsPromises.readFile(uploadedFile.path, 'utf8');
        allOriginalTitles = fileContent.split('\n').map(line => line.trim());

        //console.log("allOriginalTitles: " + allOriginalTitles);
    } catch (err) {
        console.error('Error reading file:', err);
    }

    // Create a new array to store the edited titles
    let editedTitles = [];
    let moreThanThreeKeywords = [];

    // For each title, go through each item in removalPhrases
    // If the phrase appears in the title, remove it
    editedTitles = allOriginalTitles.map(title => {
        let newTitle = title;
        let titleParts = newTitle.split('.', 2); // Split the title into two parts at the first full stop
        let titlePrefix = titleParts.length > 1 ? titleParts[0] + '.' : ''; // Get the part before the first full stop
        let titleMain = titleParts.length > 1 ? titleParts[1] : titleParts[0]; // Get the part after the first full stop
    
        removalPhrases.forEach(phrase => {
            // Check if phrase is a symbol
            if (phrase.match(/^[^\w\s]$/)) {
                const symbolRegex = new RegExp(`\\${phrase}`, 'gi');
                titleMain = titleMain.replace(symbolRegex, '');
            } else {
                // The comparison is not case sensitive
                const escapedPhrase = phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
                titleMain = titleMain.replace(regex, '');
            }
        });

        //Remove any leading space
        titleMain = titleMain.trimStart();

        let newCombinedTitle = titlePrefix + titleMain;

        // Replace multiple commas with a single comma
        newCombinedTitle = newCombinedTitle.replace(/,+/g, ',');

        // Replace multiple spaces with a single space
        newCombinedTitle = newCombinedTitle.replace(/\s+/g, ' ');

        // Remove trailing commas and spaces
        newCombinedTitle = newCombinedTitle.replace(/[, ]*$/, '');

        // Remove a comma that is next to a full stop
        newCombinedTitle = newCombinedTitle.replace(/\.,/g, '.');

        // Remove spaces that are next to a full stop
        newCombinedTitle = newCombinedTitle.replace(/\. /g, '.');

        // Remove spaces that are before a comma
        newCombinedTitle = newCombinedTitle.replace(/ ,/g, ',');
    
        // Replace all spaces with commas
        //newCombinedTitle = newCombinedTitle.replace(/\s/g, ',');

        // Replace multiple commas with a single comma
        newCombinedTitle = newCombinedTitle.replace(/,+/g, ',');
    
        // If there are more than two commas in the title, add it to moreThanThreeKeywords
        if (titleMain.split(',').length > 2) {
            moreThanThreeKeywords.push(titleMain);
        }
    
        return newCombinedTitle; // Combine the prefix and the main part of the title
    });

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

    // Write the editedTitles to a new .txt file
    let filePath;
    try {
        const dirPath = './edited_text_files';
        if (!fs.existsSync(dirPath)) {
            await fsPromises.mkdir(dirPath);
        }

        const formattedDate = getFormattedDate();
        filePath = `./edited_text_files/stage_1_edit_${formattedDate}.txt`;
        const data = editedTitles.join('\n');
        await fsPromises.writeFile(filePath, data);
        console.log(`The edited titles were written to ${filePath}`);
    } catch (err) {
        console.error('Error writing to file:', err);
    }


    console.log("Finished stage 1 cleansing of text file.")

    res.render("etsyWebScrapeUI", {
        completedCleanse: true,
        filePath
    });

});

router.post('/stage2', upload.single('txtfile'), async function(req, res) {
    console.log("Starting stage 2 cleansing of text file...")

    // Access the uploaded .txt file
    const uploadedFile = req.file;

    //Now read the uploaded .txt file and store the lines in allOriginalTitles
    let allOriginalTitles = [];
    try {
        const fileContent = await fsPromises.readFile(uploadedFile.path, 'utf8');
        allOriginalTitles = fileContent.split('\n').map(line => line.trim());

        //console.log("allOriginalTitles: " + allOriginalTitles);
    } catch (err) {
        console.error('Error reading file:', err);
    }

    // Create a new array to store the edited titles
    let editedTitles = [];
    let moreThanThreeKeywords = [];

    // For each title, go through each item in removalPhrases
    // If the phrase appears in the title, remove it
    editedTitles = allOriginalTitles.map(title => {
        let newTitle = title.replace(/^\d+\./, ''); // This will remove the starting numbers and full stop
    
        // If there are more than two commas in the title, add it to moreThanThreeKeywords
        if (newTitle.split(',').length > 2) {
            moreThanThreeKeywords.push(newTitle);
        }
    
        return newTitle;
    });

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

    // Write the editedTitles to a new .txt file
    let filePath;
    try {
        const formattedDate = getFormattedDate();
        filePath = `./edited_text_files/stage_2_edit_${formattedDate}.txt`;
        const data = editedTitles.join('\n');
        await fsPromises.writeFile(filePath, data);
        console.log(`The edited titles were written to ${filePath}`);
    } catch (err) {
        console.error('Error writing to file:', err);
    }

    console.log("Finished Stage 2 cleansing of text file.")

    res.render("etsyWebScrapeUI", {
        completedCleanse: true,
        filePath,
        moreThanThreeKeywords
    });

});

module.exports = router;