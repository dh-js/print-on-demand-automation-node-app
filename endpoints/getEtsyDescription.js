const express = require('express');
const fetch = require("node-fetch");
const router = express.Router();

const clientID = process.env.ETSY_CLIENT_ID_DIGITAL;

router.get('/', async (req, res) => {
    const { access_token, listing_id } = req.query;

    const requestOptions = {
        headers: {
            'x-api-key': clientID,
            Authorization: `Bearer ${access_token}`,
            'Accept': 'application/json',
        }
    };

    const response = await fetch(
        `https://openapi.etsy.com/v3/application/listings/${listing_id}`,
        requestOptions
    );

    if (response.ok) {
        const data = await response.json();
        res.send(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
    } else {
        console.log(response.status, response.statusText);
        const errorData = await response.json();
        console.log(errorData);
        res.send("oops");
    }

});

module.exports = router;