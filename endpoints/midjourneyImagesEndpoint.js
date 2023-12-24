const express = require('express');
const path = require('path');
const fsPromises = require('fs').promises;
const router = express.Router();
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

router.post('/', upload.single('txtfile'), async function(req, res) {

    const batch = req.body.batch;
    const uploadedFile = req.file;

    if (batch === 'batch1') {
        console.log("Starting Batch 1 midjourney process...")
    } else {
        console.log("Starting Batch 2 midjourney process...")
    }

    let newSubFolderPath;

    try {

        // Read the uploaded .txt file and store the lines in allOriginalTitles
        let allNumberedTitles = [];
        try {
            const fileContent = await fsPromises.readFile(uploadedFile.path, 'utf8');
            allNumberedTitles = fileContent.split('\n')
                                        .map(line => line.trim())
                                        .filter(line => line); // filter out empty strings

        } catch (err) {
            console.error('Error reading file:', err);
        }

        let titlesForRenamingImages = {};
        allNumberedTitles.forEach((title, index) => {
            let parts = title.split('.');
            let firstPartTitle = parts[0];
            let secondPartTitle = parts[1];
            if (!secondPartTitle) {
                console.log(`Skipping line ${index + 1}: ${title}`);
                return; // skip this iteration if secondPartTitle is undefined
            }
            let editedTitle = secondPartTitle.trim().replace(/,$/g, '').replace(/,/g, '_');
            titlesForRenamingImages[firstPartTitle] = editedTitle;
        });
        
        // Get all subdirectories from the 'midjourney_images' folder
        const dirPath = './midjourney_images';
        const files = await fsPromises.readdir(dirPath, { withFileTypes: true });

        // Filter out non-directory files
        const subDirs = files.filter(file => file.isDirectory());
        // Assuming there's only one subdirectory, get its name
        const subDirName = subDirs[0].name;

        // Construct the path to the subdirectory
        const subDirPath = path.join(dirPath, subDirName);

        // Read all files from the subdirectory
        const subDirFiles = await fsPromises.readdir(subDirPath);

        // Filter out non-image files and sort the files alphabetically
        const imageFiles = subDirFiles.filter(file => file.endsWith('.jpg') || file.endsWith('.png')).sort();

        for (let i = 0; i < imageFiles.length; i++) {
            const fileName = imageFiles[i];
            const namePart = fileName.split('_')[0];

            // find a match in titlesForRenamingImages
            const match = titlesForRenamingImages[namePart];

            if (match) {
                // rename the image file
                const oldPath = path.join(subDirPath, fileName);
                const newPath = path.join(subDirPath, `${namePart}_${match}_${fileName.split('_')[1]}`);
                try {
                    await fsPromises.rename(oldPath, newPath);
                } catch (err) {
                    console.error('Error renaming and moving file:', err);
                }
            } else {
                console.log(`No match found for file: ${fileName}`);
            }
        }

        // Construct the old and new paths for the subfolder
        const oldSubFolderPath = subDirPath;
        newSubFolderPath = path.join('./midjourney_renamed_images', subDirName);

        // Move the subfolder
        await fsPromises.rename(oldSubFolderPath, newSubFolderPath);

    } catch (err) {
        console.error('Error during operation 1:', err);
    }

    //Now start what used to be the stage 2 process

    try {

        // Get all image files from the created sub folder
        const files = await fsPromises.readdir(newSubFolderPath);

        // Filter out non-image files and sort the files numerically
        const imageFiles = files
        .filter(file => file.endsWith('.jpg') || file.endsWith('.png'))
        .sort((a, b) => {
            const numA = parseInt(a.split('_')[0]);
            const numB = parseInt(b.split('_')[0]);
            return numA - numB;
        });

        // Group the files into an object where the keys are the numbers at the
        //start of the filenames, and the values are arrays of filenames that start with that number
        const groupedFilesObject = imageFiles.reduce((groups, file) => {
            const num = parseInt(file.split('_')[0]);
            if (!groups[num]) {
                groups[num] = [];
            }
            groups[num].push(file);
            return groups;
        }, {});

        for (let key in groupedFilesObject) {
            const files = groupedFilesObject[key];
            for (let i = 0; i < 1; i++) {
        
                // Extract the number and the rest of the filename
                const [_, number, rest] = files[i].match(/^(\d+_)(.*)$/);
        
                // Split the filename into parts
                const parts = rest.split('_');
                const lastPart = parts.pop(); // Extract the last part (number and extension)
                const [lastNumber, extension] = lastPart.split('.'); // Separate the number and extension
        
                let newFilename;
                if (batch === 'batch2') { // Only perform swapping if it was the '(batch 2) button'
                    newFilename = [parts[1], parts[0], ...parts.slice(2)].join('_');
                } else {
                    newFilename = parts.join('_');
                }
        
                // Prepend the number back to the filename and append the extension
                let finalFilename = `${number}${newFilename}.${extension}`;

                // Correct
                const oldFilePath = path.join(newSubFolderPath, files[i]);
                const newFilePath = path.join(newSubFolderPath, finalFilename);
                await fsPromises.rename(oldFilePath, newFilePath);

            }
        }


        // Get all image files from the new subfolder
        const newImageFiles = await fsPromises.readdir(newSubFolderPath);

        // Prepare the content for the .txt file
        const txtContent = newImageFiles.map(filename => {
            // Remove the extension
            let nameWithoutExtension = path.parse(filename).name;

            // Replace the first underscore with a period
            let nameWithPeriod = nameWithoutExtension.replace('_', '.');

            // Replace the remaining underscores with commas
            let finalName = nameWithPeriod.replace(/_/g, ',');

            return finalName;
        }).join('\n');

        // Define the path for the new .txt file
        const txtFilePath = path.join(newSubFolderPath, 'image_prompts.txt');

        // Write the filenames to the new .txt file
        await fsPromises.writeFile(txtFilePath, txtContent);

        console.log("Text file has been successfully created in the subfolder");

    } catch (err) {
        console.error('Error during operation 2:', err);
    }


    let batchMessage;
    if (batch === 'batch1') {
        console.log("Finished Batch 1 midjourney process")
        batchMessage = 'Batch 1 was successfully completed.';
    } else {
        console.log("Finished Batch 2 midjourney process")
        batchMessage = 'Batch 2 was successfully completed.';
    }

    res.render("etsyWebScrapeUI", {
        batchMessage: batchMessage
    });

});


module.exports = router;