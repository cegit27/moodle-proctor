# DSC Unique ID & QR Generation Module (Express.js)

This module is designed for a remote proctor application. It generates a unique token for each student completing a test, and produces a QR Code that links directly to a mobile client URL with the appended token. Students can scan this QR code with their mobile devices to securely upload their physical answer sheets.

## Features
- Generates a **cryptographically strong unique student token** (27+ characters using secure random bytes).
- Constructs a full target URL combining a **configurable mobile client base URL** and the student's unique token.
- Generates a **QR Code image** encoding the full target URL via Node.js backend.
- Includes a **simple modern frontend (HTML/JS + Express)** presenting a premium UI styled like a mobile scanner.

## Project Structure
- `server.js`: The Express.js backend containing the ID generation API and QR code encoding logic.
- `templates/index.html`: The frontend demo interface showcasing the generation process and results.
- `package.json`: Node dependencies.

## Setup & Running Locally

1. **Install Node.js dependencies**:
   Ensure you have Node.js installed, then run:
   ```bash
   npm install
   ```

2. **Run the Express server**:
   ```bash
   node server.js
   ```

3. **View the demo application**:
   Open a web browser and navigate to: [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Configuration
The mobile app URL (`MOBILE_CLIENT_URL`) can be found in `server.js`. By default, it's set to `https://www.scanningmobile.com`. 

For production, you can set the `MOBILE_CLIENT_URL` system environment variable before running the script.

Example to overwrite base URL locally:
```shell
# Windows PowerShell
$env:MOBILE_CLIENT_URL="https://myapp.studentscan.test"
node server.js
```
