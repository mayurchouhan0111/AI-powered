# AI File Manager

An AI-powered file management system with Chrome extension integration.

## Features
- AI-powered file operations
- Chrome extension interface
- Voice command support
- Real-time status updates

## Setup

### Backend
```bash
cd backend
npm install
npm start
```

### Chrome Extension
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable Developer Mode
4. Click "Load unpacked"
5. Select the `chrome-extension` folder

## Environment Variables
Copy `.env.example` to `.env` and fill in:
- GEMINI_API_KEY
- PORT (optional, defaults to 3000)