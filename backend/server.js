const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class AICodeEditorBackend {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.configPath = path.join(__dirname, 'config.json');
        this.config = this.loadConfig();

        this.genAI = new GoogleGenerativeAI('AIzaSyC31LXYmj2jmpwt3isxn1vqqgucgPt4VJw');
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

        this.setupMiddleware();
        this.setupRoutes();
        this.errorHandler();
    }

    loadConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.warn('Config file not found or invalid, using defaults');
            return {
                targetFolderPath: '',
                aiModel: 'gemini-pro'
            };
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));
    }

    setupRoutes() {
        // Set folder route
        this.app.post('/api/set-folder', (req, res) => {
            const { folderPath } = req.body;
            if (!folderPath) {
                return res.status(400).json({ error: 'Folder path is required' });
            }
            this.config.targetFolderPath = folderPath;
            this.saveConfig();
            res.json({ success: true, message: 'Folder set successfully' });
        });

        // Write file route
        this.app.post('/api/write-file', async (req, res) => {
            const { filename, content } = req.body;
            if (!filename || !content) {
                return res.status(400).json({ error: 'Filename and content are required' });
            }
            const filePath = path.join(this.config.targetFolderPath, filename);
            try {
                await fs.writeFile(filePath, content, 'utf8');
                res.json({ success: true, message: 'File saved successfully' });
            } catch (error) {
                console.error('Error writing file:', error);
                res.status(500).json({ error: 'Failed to write file', details: error.message });
            }
        });

        // Read file route
        this.app.post('/api/read-file', async (req, res) => {
            const { filename } = req.body;
            if (!filename) {
                return res.status(400).json({ error: 'Filename is required' });
            }
            const filePath = path.join(this.config.targetFolderPath, filename);
            try {
                const content = await fs.readFile(filePath, 'utf8');
                res.json({ success: true, content });
            } catch (error) {
                console.error('Error reading file:', error);
                res.status(500).json({ error: 'Failed to read file', details: error.message });
            }
        });

        // AI task route
        this.app.post('/api/ai-task', async (req, res) => {
            const { prompt, code, filename } = req.body;
            if (!prompt || !code) {
                return res.status(400).json({ error: 'Prompt and code are required' });
            }
            try {
                const smartPrompt = `You are a code editor AI.  Update the code in file ${filename} based on the user prompt. Return ONLY the updated code.\n\nExisting Code:\n${code}\n\nPrompt: ${prompt}`;

                const result = await this.model.generateContent(smartPrompt);
                const response = await result.response;
                const updatedCode = response.text();

                res.json({ success: true, code: updatedCode });
            } catch (error) {
                console.error('AI processing error:', error);
                res.status(500).json({ error: 'AI processing failed', details: error.message });
            }
        });

          // Health check route
          this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok', message: 'Backend server is running' });
        });
    }

    errorHandler() {
        this.app.use((err, req, res, next) => {
            console.error(err.stack);
            res.status(500).send('Something broke!');
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`AI Code Editor backend listening on port ${this.port}`);
        });
    }
}

const backend = new AICodeEditorBackend();
backend.start()