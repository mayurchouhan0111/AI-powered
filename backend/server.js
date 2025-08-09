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
  }

  setupRoutes() {
    this.app.post('/smart-execute', async (req, res) => {
      try {
        const { command, folderPath } = req.body;
        
        // Validate input
        if (!command || !folderPath) {
          return res.status(400).json({
            error: 'Missing required fields',
            details: { command: !!command, folderPath: !!folderPath }
          });
        }

        // Log request
        console.log('📝 Processing command:', {
          command,
          folderPath,
          timestamp: new Date().toISOString()
        });

        // Validate folder exists
        if (!fs.existsSync(folderPath)) {
          return res.status(400).json({
            error: 'Folder does not exist',
            path: folderPath
          });
        }

        // Process command with AI
        const result = await this.processAICommand(command, folderPath);
        res.json(result);

      } catch (error) {
        console.error('Smart execute error:', error);
        res.status(500).json({
          error: 'Failed to execute smart command',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  async processAICommand(command, folderPath) {
    if (folderPath) {
      this.config.targetFolderPath = folderPath;
      this.saveConfig();
    }

    if (!this.config.targetFolderPath) {
      throw new Error('No target folder set');
    }

    const smartPrompt = `You are an expert file management AI. Analyze this user command and determine what files need to be created, updated, or deleted.

User Command: "${command}"
Target Folder: ${this.config.targetFolderPath}

Please respond with a JSON object in this exact format:
{
  "summary": "Brief description of what you're doing",
  "actions": [
    {
      "action": "create|update|delete",
      "filename": "exact filename with extension",
      "content": "file content (only for create/update actions)",
      "reason": "why this action is needed"
    }
  ]
}

Rules:
- For create/update: provide complete, functional file content
- For delete: only specify filename, no content needed
- Use appropriate file extensions (.py, .js, .html, .css, etc.)
- Make code production-ready with proper error handling
- If creating web files, make them responsive and accessible
- Suggest logical filenames if not specified by user
- Only include actions that are actually needed

Analyze the command and provide the JSON response:`;

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
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('AI response parsing error:', parseError);
      console.error('Raw AI response:', aiResponse);
      
      const isHtmlRequest = command.toLowerCase().includes('html') || command.toLowerCase().includes('web') || command.toLowerCase().includes('page');
      const isPythonRequest = command.toLowerCase().includes('python') || command.toLowerCase().includes('.py');
      
      let fallbackContent = '';
      let fallbackFilename = 'index.html';
      
      if (isPythonRequest) {
        fallbackFilename = 'main.py';
        fallbackContent = `# Python script generated by AI File Manager\nprint("Hello from AI File Manager!")\n\ndef main():\n    """Main function"""\n    # Add your code here\n    pass\n\nif __name__ == "__main__":\n    main()\n`;
      } else {
        fallbackContent = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>AI Generated Page</title>\n    <style>\n        body { font-family: Arial, sans-serif; margin: 40px; }\n        h1 { color: #333; }\n    </style>\n</head>\n<body>\n    <h1>🤖 AI File Manager</h1>\n    <p>This file was created successfully!</p>\n    <p>Command: "${command}"</p>\n</body>\n</html>`;
      }
      
      parsedResponse = {
        summary: `Created ${fallbackFilename} (fallback)`,
        actions: [{
          action: "create",
          filename: fallbackFilename,
          content: fallbackContent,
          reason: "Fallback creation"
        }]
      };
    }

    const filesAffected = [];

    for (const action of parsedResponse.actions) {
      const filePath = path.join(this.config.targetFolderPath, action.filename);

      try {
        switch (action.action) {
          case 'create':
          case 'update':
            if (action.action === 'update' && fs.existsSync(filePath)) {
              this.createBackup(filePath);
            }
            
            fs.ensureDirSync(path.dirname(filePath));
            fs.writeFileSync(filePath, action.content || '', 'utf8');
            
            filesAffected.push({
              action: action.action === 'create' ? 'Created' : 'Updated',
              filename: action.filename,
              size: (action.content || '').length
            });
            
            console.log(`✅ ${action.action}: ${action.filename}`);
            break;

          case 'delete':
            if (fs.existsSync(filePath)) {
              this.createBackup(filePath);
              fs.unlinkSync(filePath);
              
              filesAffected.push({
                action: 'Deleted',
                filename: action.filename
              });
              
              console.log(`🗑️ Deleted: ${action.filename}`);
            }
            break;
        }
      } catch (fileError) {
        console.error(`Error processing ${action.action} for ${action.filename}:`, fileError);
      }
    }

    this.addToHistory(command, 'smart-execute', parsedResponse.summary);

    return {
      success: true,
      summary: parsedResponse.summary,
      filesAffected: filesAffected,
      actionsCount: parsedResponse.actions.length
    };
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
