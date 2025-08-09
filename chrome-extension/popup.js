class SmartAIFileManager {
  constructor() {
    // Change backend URL to Render
    this.backendUrl = 'https://ai-powered-iwnx.onrender.com';
    
    this.isRecording = false;
    this.recognition = null;
    this.currentFolder = '';
    this.retryAttempts = 3;
    this.connectionCheckInterval = null;
    
    this.initializeElements();
    this.setupEventListeners();
    this.initializeSpeechRecognition();
    this.loadSavedFolder();
    this.checkBackendConnection();
    this.setupConnectionMonitoring();
  }

  initializeElements() {
    this.elements = {
      folderPath: document.getElementById('folderPath'),
      selectFolderBtn: document.getElementById('selectFolderBtn'),
      commandInput: document.getElementById('commandInput'),
      executeBtn: document.getElementById('executeBtn'),
      voiceBtn: document.getElementById('voiceBtn'),
      status: document.getElementById('status'),
      logArea: document.getElementById('logArea'),
      currentFolder: document.getElementById('currentFolder'),
      statusDot: document.getElementById('statusDot'),
      connectionStatus: document.getElementById('connectionStatus')
    };
  }

  setupEventListeners() {
    this.elements.selectFolderBtn.addEventListener('click', () => this.selectFolder());
    this.elements.executeBtn.addEventListener('click', () => this.executeCommand());
    this.elements.voiceBtn.addEventListener('click', () => this.toggleVoiceInput());
    
    // Enter to execute
    this.elements.commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.executeCommand();
      }
    });
  }

  async selectFolder() {
    try {
      const folderPath = prompt('Enter the full path to your project folder:\n\nExample:\nC:\\Users\\YourName\\Projects\\MyProject\n/Users/yourname/Projects/myproject');
      
      if (!folderPath) return;

      const response = await fetch(`${this.backendUrl}/set-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ folderPath: folderPath.trim() })
      });

      const result = await response.json();

      if (response.ok) {
        this.currentFolder = folderPath.trim();
        this.elements.folderPath.value = this.currentFolder;
        this.elements.currentFolder.textContent = `Selected: ${this.currentFolder}`;
        
        chrome.storage.local.set({ savedFolder: this.currentFolder });
        
        this.updateStatus('Folder selected successfully! 📁✅', 'success');
        this.addLogEntry(`Folder set: ${this.currentFolder}`, 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.updateStatus(`Folder selection failed: ${error.message}`, 'error');
      this.addLogEntry(`Folder error: ${error.message}`, 'error');
    }
  }

  async loadSavedFolder() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['savedFolder'], resolve);
      });
      
      if (result.savedFolder) {
        this.currentFolder = result.savedFolder;
        this.elements.folderPath.value = this.currentFolder;
        this.elements.currentFolder.textContent = `Saved: ${this.currentFolder}`;
        
        const response = await fetch(`${this.backendUrl}/set-folder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ folderPath: this.currentFolder })
        });

        if (response.ok) {
          this.addLogEntry('Previous folder restored', 'info');
        }
      }
    } catch (error) {
      console.log('No saved folder found');
    }
  }

  async executeCommand() {
    const command = this.elements.commandInput.value.trim();

    if (!this.validateCommand(command)) return;

    try {
      this.setExecuteButtonState(true);
      this.updateStatus('Processing command...', 'info');

      const response = await fetch(`${this.backendUrl}/smart-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          folderPath: this.currentFolder
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      this.handleSuccess(data);

    } catch (error) {
      console.error('Command execution failed:', error);
      this.updateStatus(`❌ ${error.message}`, 'error');
      this.addLogEntry(`❌ Error: ${error.message}`, 'error');
    } finally {
      this.setExecuteButtonState(false);
    }
  }

  async executeWithRetry(command, attempt = 1) {
    try {
        const response = await fetch(`${this.backendUrl}/smart-execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command,
                folderPath: this.currentFolder
            }),
            // Add timeout
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const result = await response.json();
        this.handleSuccess(result);

    } catch (error) {
        if (attempt < 3 && this.shouldRetry(error)) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            return this.executeWithRetry(command, attempt + 1);
        }
        throw error;
    }
  }

  shouldRetry(error) {
    return error.message.includes('Failed to fetch') || 
           error.message.includes('ECONNRESET') ||
           error.name === 'AbortError';
  }

  validateCommand(command) {
    if (!command) {
        this.updateStatus('Please enter a command', 'error');
        return false;
    }
    if (!this.currentFolder) {
        this.updateStatus('Please select a folder first', 'error');
        return false;
    }
    return true;
  }

  handleExecutionError(error) {
    console.error('Command execution failed:', error);
    const message = this.getErrorMessage(error);
    this.updateStatus(`❌ Error: ${message}`, 'error');
    this.addLogEntry(`❌ ${message}`, 'error');
  }

  getErrorMessage(error) {
    if (error.name === 'AbortError') return 'Request timed out';
    if (error.message.includes('ECONNRESET')) return 'Connection lost';
    return error.message;
  }

  handleSuccess(result) {
    this.updateStatus('✅ Command executed successfully', 'success');
    this.elements.commandInput.value = '';
    
    if (result.summary) {
      this.addLogEntry(`✅ ${result.summary}`, 'success');
    }

    if (result.filesAffected?.length > 0) {
      result.filesAffected.forEach(file => {
        this.addLogEntry(`📄 ${file.action}: ${file.filename}`, 'info');
      });
    }
  }

  setExecuteButtonState(isLoading) {
    this.elements.executeBtn.disabled = isLoading;
    this.elements.executeBtn.textContent = isLoading ? '🔄 Working...' : '🚀 Execute';
  }

  handleCommandResponse(response) {
    if (response.success) {
      this.updateStatus('✅ Command executed successfully', 'success');
      this.elements.commandInput.value = '';
      this.addLogEntry(`✅ ${response.message || 'Success'}`, 'success');
    } else {
      throw new Error(response.error || 'Unknown error');
    }
  }

  handleCommandError(error) {
    console.error('Command error:', error);
    this.updateStatus(`❌ Error: ${error.message}`, 'error');
    this.addLogEntry(`❌ ${error.message}`, 'error');
  }

  initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isRecording = true;
        this.elements.voiceBtn.classList.add('recording');
        this.elements.voiceBtn.textContent = '⏹️ Stop';
        this.updateStatus('🎤 Listening... Speak your command!', 'info');
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.elements.commandInput.value = transcript;
        this.updateStatus('Voice captured! Click Execute to run.', 'success');
        this.addLogEntry(`🎤 Voice: "${transcript}"`, 'info');
      };

      this.recognition.onend = () => {
        this.isRecording = false;
        this.elements.voiceBtn.classList.remove('recording');
        this.elements.voiceBtn.textContent = '🎤 Voice';
      };
    } else {
      this.elements.voiceBtn.disabled = true;
      this.elements.voiceBtn.textContent = '🎤 Not Supported';
    }
  }

  toggleVoiceInput() {
    if (!this.recognition) return;

    if (this.isRecording) {
      this.recognition.stop();
    } else {
      this.recognition.start();
    }
  }

  setupConnectionMonitoring() {
    // Check connection every 30 seconds
    this.connectionCheckInterval = setInterval(() => {
      this.checkBackendConnection();
    }, 30000);

    // Clean up on window close
    window.addEventListener('unload', () => {
      if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
      }
    });
  }

  async checkBackendConnection() {
    try {
      const response = await fetch(`${this.backendUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        // Add timeout
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        this.elements.statusDot.classList.add('connected');
        this.elements.connectionStatus.textContent = 'Backend Connected';
        this.elements.executeBtn.disabled = false;
        return true;
      }
      throw new Error('Backend not responding');
    } catch (error) {
      this.handleConnectionError(error);
      return false;
    }
  }

  handleConnectionError(error) {
    this.elements.statusDot.classList.remove('connected');
    this.elements.connectionStatus.textContent = 'Backend Offline';
    this.elements.executeBtn.disabled = true;
    
    const errorMessage = error.name === 'AbortError' 
      ? 'Connection timeout' 
      : error.message;
    
    this.updateStatus(`❌ Backend error: ${errorMessage}`, 'error');
    this.addLogEntry(`❌ Connection failed: ${errorMessage}`, 'error');
    
    console.error('Backend connection error:', error);
  }

  updateStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
  }

  addLogEntry(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    
    this.elements.logArea.appendChild(entry);
    this.elements.logArea.scrollTop = this.elements.logArea.scrollHeight;

    while (this.elements.logArea.children.length > 30) {
      this.elements.logArea.removeChild(this.elements.logArea.firstChild);
    }
  }
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
  new SmartAIFileManager();
});

async function executeCommand(command) {
  try {
    const { backendUrl } = await new Promise(resolve =>
      chrome.storage.local.get(['backendUrl'], resolve)
    );
    
    const response = await fetch(`${backendUrl}/smart-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        command,
        folderPath: document.getElementById('folderPath').value
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    updateActivityLog('Command executed successfully');
    return result;
  } catch (error) {
    console.error('Execute command failed:', error);
    updateActivityLog(`❌ Error: ${error.message}`);
    throw error;
  }
}
