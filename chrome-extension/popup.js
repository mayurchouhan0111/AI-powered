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

  async validateFolderPath(folderPath) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'CHECK_FOLDER_EXISTS',
        path: folderPath
      }, (response) => {
        resolve(response.exists);
      });
    });
  }

  async selectFolder() {
    try {
      const folderPath = prompt('Enter the full path to your project folder:');
      
      if (!folderPath) {
        this.updateStatus('Folder selection cancelled', 'info');
        return;
      }

      // Check if folder exists locally first
      const exists = await this.validateFolderPath(folderPath.trim());
      if (!exists) {
        throw new Error('Folder does not exist on your machine');
      }

      const response = await fetch(`${this.backendUrl}/set-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          folderPath: folderPath.trim() 
        })
      });

      // Check for non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned non-JSON response');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to set folder');
      }

      this.currentFolder = folderPath.trim();
      this.elements.folderPath.value = this.currentFolder;
      this.elements.currentFolder.textContent = `Selected: ${this.currentFolder}`;
      
      await chrome.storage.local.set({ savedFolder: this.currentFolder });
      
      this.updateStatus('Folder selected successfully! 📁✅', 'success');
      this.addLogEntry(`Folder set: ${this.currentFolder}`, 'success');

    } catch (error) {
      console.error('Folder selection error:', error);
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

    if (!this.validateInput(command)) return;

    try {
      this.setExecuteButtonState(true);
      await this.executeWithRetry(command);
    } catch (error) {
      this.handleExecutionError(error);
    } finally {
      this.setExecuteButtonState(false);
    }
  }

  validateInput(command) {
    if (!command) {
      this.updateStatus('❌ Please enter a command', 'error');
      return false;
    }
    if (!this.currentFolder) {
      this.updateStatus('❌ Please select a folder first', 'error');
      return false;
    }
    return true;
  }

  async executeWithRetry(command, attempt = 1) {
    try {
      const response = await fetch(`${this.backendUrl}/smart-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          command,
          folderPath: this.currentFolder
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      this.handleSuccess(data);

    } catch (error) {
      if (attempt < 3) {
        console.log(`Retrying command (${attempt}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.executeWithRetry(command, attempt + 1);
      }
      throw error;
    }
  }

  handleSuccess(data) {
    this.updateStatus('✅ Command executed successfully', 'success');
    this.elements.commandInput.value = '';
    
    if (data.summary) {
      this.addLogEntry(`✅ ${data.summary}`, 'success');
    }

    if (data.filesAffected?.length > 0) {
      data.filesAffected.forEach(file => {
        this.addLogEntry(`📄 ${file.action}: ${file.filename}`, 'info');
      });
    }
  }

  handleExecutionError(error) {
    console.error('Command execution failed:', error);
    this.updateStatus(`❌ Error: ${error.message}`, 'error');
    this.addLogEntry(`❌ Error: ${error.message}`, 'error');
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

    // Initial check
    this.checkBackendConnection();

    // Cleanup on window close
    window.addEventListener('unload', () => {
      if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
      }
    });
  }

  async checkBackendConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.backendUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status !== 'healthy') {
        throw new Error('Backend reports unhealthy status');
      }

      this.elements.statusDot.classList.add('connected');
      this.elements.connectionStatus.textContent = 'Backend Connected';
      this.addLogEntry('🌐 Connected to backend server', 'success');
      return true;

    } catch (error) {
      const message = error.name === 'AbortError' 
        ? 'Connection timeout' 
        : error.message;

      this.elements.statusDot.classList.remove('connected');
      this.elements.connectionStatus.textContent = 'Backend Offline';
      this.updateStatus(`❌ Backend error: ${message}`, 'error');
      console.error('Backend connection error:', error);
      return false;
    }
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
