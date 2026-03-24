const express = require('express');
const crypto = require('crypto');
const qrcode = require('qrcode');
const path = require('path');

const app = express();

// Configuration
// This is the base URL for the mobile client.
const MOBILE_CLIENT_URL = process.env.MOBILE_CLIENT_URL || "https://www.scanningmobile.com";

// Middleware to parse JSON
app.use(express.json());

// Serve the index.html from templates directory
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Endpoint to generate QR code
app.post('/generate_qr', async (req, res) => {
    try {
        // Generate a URL-safe token of ~27 characters
        const unique_token = crypto.randomBytes(20).toString('base64url');
        
        // Construct the final URL
        const base_url = MOBILE_CLIENT_URL.endsWith('/') ? MOBILE_CLIENT_URL.slice(0, -1) : MOBILE_CLIENT_URL;
        const final_url = `${base_url}/${unique_token}`;
        
        // Generate QR Code as Data URI
        const qrDataUrl = await qrcode.toDataURL(final_url, {
            errorCorrectionLevel: 'L',
            margin: 4,
            width: 250,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        
        // Extract just the base64 part since the frontend expects just that
        const qr_code_base64 = qrDataUrl.split(',')[1];
        
        res.json({
            token: unique_token,
            url: final_url,
            qr_code_base64: qr_code_base64
        });
    } catch (error) {
        console.error("Error generating QR code:", error);
        res.status(500).json({ error: "Failed to generate QR code" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Express server running on http://127.0.0.1:${PORT}`);
});
