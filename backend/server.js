const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class AIFileManagerServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.configPath = path.join(__dirname, 'config.json');
        this.config = this.loadConfig();
        this.commandHistory = [];

        this.initializeAI();
        this.setupMiddleware();
        this.setupRoutes();

        // Global error handler - must be last
        this.app.use((err, req, res, next) => {
            console.error('Unhandled error:', err);
            res.status(500).json({
                error: 'Internal server error',
                details: err.message,
                timestamp: new Date().toISOString()
            });
        });
    }

    loadConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.warn('Config file not found or invalid, using defaults');
            return {
                targetFolderPath: '',
                lastCommands: [],
                settings: {
                    maxFileSize: 10485760,
                    allowedExtensions: ['.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c', '.json', '.xml', '.md', '.txt', '.dart', '.swift', '.go', '.rs', '.php', '.rb', '.sql'],
                    autoBackup: true,
                    maxBackups: 5
                }
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

    initializeAI() {
        if (process.env.GEMINI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
            this.aiProvider = 'gemini';
            console.log('✅ Gemini AI initialized');
        } else {
            console.error('❌ No AI API key found. Please set GEMINI_API_KEY in .env file');
            process.exit(1);
        }
    }

    setupMiddleware() {
        // Improved CORS configuration
        this.app.use(cors({
            origin: (origin, callback) => {
                const allowedOrigins = [
                    'chrome-extension://',
                    'http://localhost:3000',
                    'http://127.0.0.1:3000'
                ];

                if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
                    callback(null, true);
                } else {
                    callback(new Error('CORS not allowed'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        }));

        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });

        // Ensure JSON responses
        this.app.use((req, res, next) => {
            res.setHeader('Content-Type', 'application/json');
            next();
        });
    }

    setupRoutes() {
        this.app.post('/smart-execute', async (req, res) => {
            try {
                const { command, code, filename } = req.body;

                if (!command) {
                    return res.status(400).json({
                        success: false,
                        error: 'Command is required'
                    });
                }

                // Process the AI command
                const result = await this.processAICommand(command, code, filename);

                res.json({
                    success: true,
                    message: 'Command processed',
                    code: result // Return the updated code
                });

            } catch (error) {
                console.error('Command execution error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to process command',
                    details: error.message
                });
            }
        });

        this.app.post('/set-folder', async (req, res) => {
            try {
                const { folderPath } = req.body;

                if (!folderPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Folder path is required'
                    });
                }

                // Store the folder path
                this.config.targetFolderPath = folderPath;
                await this.saveConfig();

                res.json({
                    success: true,
                    message: 'Folder registered successfully',
                    path: folderPath
                });

            } catch (error) {
                console.error('Set folder error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post('/write-file', async (req, res) => {
            try {
                const { filename, code } = req.body;

                if (!filename || !code) {
                    return res.status(400).json({
                        success: false,
                        error: 'Filename and code are required'
                    });
                }

                const filePath = path.join(this.config.targetFolderPath, filename);
                await fs.writeFile(filePath, code, 'utf8');

                res.json({
                    success: true,
                    message: 'File saved successfully'
                });

            } catch (error) {
                console.error('Write file error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/read-file', async (req, res) => {
            try {
                const { filename } = req.query;

                if (!filename) {
                    return res.status(400).json({
                        success: false,
                        error: 'Filename is required'
                    });
                }

                const filePath = path.join(this.config.targetFolderPath, filename);
                const code = await fs.readFile(filePath, 'utf8');

                res.json({
                    success: true,
                    code: code
                });

            } catch (error) {
                console.error('Read file error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Add detailed health check endpoint
        this.app.get('/health', (req, res) => {
            try {
                res.json({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    aiProvider: this.aiProvider || 'not initialized',
                    version: process.version,
                    memory: process.memoryUsage(),
                    uptime: process.uptime()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    async processAICommand(command, code, filename) {
        if (!this.config.targetFolderPath) {
            throw new Error('No target folder set');
        }

        const smartPrompt = `You are an expert file management AI. You are updating the file ${filename}. Analyze this user command and determine how to modify the existing code.

Existing Code:\n${code}\n\nUser Command: ${command}

Please respond with the COMPLETE UPDATED code for the file, including any changes requested by the user.  Do not include any other information in your response. Just the code.
`;

        let result, response, aiResponse;
        try {
            result = await this.model.generateContent(smartPrompt);
            response = await result.response;
            aiResponse = response.text();
        } catch (aiError) {
            console.error('AI generation error:', aiError);
            throw new Error('AI service temporarily unavailable');
        }

        aiResponse = aiResponse.replace(/``````/g, '').trim();

        // Return the AI-generated code
        return aiResponse;
    }

    createBackup(filePath) {
        try {
            const dir = path.dirname(filePath);
            const filename = path.basename(filePath);
            const ext = path.extname(filename);
            const nameWithoutExt = path.basename(filename, ext);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `${nameWithoutExt}.backup.${timestamp}${ext}`;
            const backupPath = path.join(dir, 'backups', backupFileName);

            fs.ensureDirSync(path.dirname(backupPath));
            fs.copyFileSync(filePath, backupPath);

            console.log(`📦 Backup created: ${backupFileName}`);
        } catch (error) {
            console.error('Failed to create backup:', error);
        }
    }

    addToHistory(command, filename, contentLength) {
        const historyEntry = {
            timestamp: new Date().toISOString(),
            command,
            filename,
            contentLength
        };

        this.commandHistory.unshift(historyEntry);

        if (this.commandHistory.length > 10) {
            this.commandHistory.splice(10);
        }

        this.config.lastCommands = this.commandHistory;
        this.saveConfig();
    }

    start() {
        this.app.listen(this.port, () => {
            console.log('\n🚀 AI File Manager Backend Server Started!');
            console.log(`📡 Server running on http://localhost:${this.port}`);
            console.log(`🤖 AI Provider: ${this.aiProvider}`);
            console.log(`📁 Target Folder: ${this.config.targetFolderPath || 'Not set'}`);
            console.log('\n✨ Ready to process AI file management tasks!\n');
        });

        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down server...');
            process.exit(0);
        });
    }
}

const server = new AIFileManagerServer();
server.start();