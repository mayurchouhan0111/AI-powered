class SmartAIFileManager {
  constructor() {
    this.backendUrl = 'https://ai-powered-iwnx.onrender.com';
    this.currentFolder = '';
    this.isConnected = false;
    
    this.initializeElements();
    this.setupEventListeners();
    this.checkBackendConnection();
    this.loadSavedFolder();
  }

  initializeElements() {
    const elements = {
      browseBtn: 'browseBtn',
      selectFolderBtn: 'selectFolderBtn',
      currentFolder: 'currentFolder',
      commandInput: 'commandInput',
      executeBtn: 'executeBtn',
      voiceBtn: 'voiceBtn',
      status: 'status',
      logArea: 'logArea',
      statusDot: 'statusDot',
      connectionStatus: 'connectionStatus'
    };

    this.elements = Object.fromEntries(
      Object.entries(elements).map(([key, id]) => {
        const element = document.getElementById(id);
        if (!element) throw new Error(`Element not found: ${id}`);
        return [key, element];
      })
    );
  }

  setupEventListeners() {
    this.elements.browseBtn.addEventListener('click', () => this.showFolderDialog());
    this.elements.selectFolderBtn.addEventListener('click', () => this.showFolderPrompt());
    this.elements.executeBtn.addEventListener('click', () => this.executeCommand());
    this.elements.commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) this.executeCommand();
    });
  }

  async showFolderDialog() {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read'
      });

      const folderPath = await this.getFolderPath(dirHandle);
      if (folderPath) {
        await this.updateFolderInUI(folderPath);
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        this.handleFolderError(error);
      }
    }
  }

  showFolderPrompt() {
    const folderPath = prompt(
      'Enter the full path to your project folder:\n\n' +
      'Example: D:\\UnHuman\\Crazyyy\\ai-file-manager'
    );
    
    if (folderPath) {
      this.updateFolderInUI(folderPath.trim());
    }
  }

  async getFolderPath(dirHandle) {
    try {
      return dirHandle.name;
    } catch (error) {
      console.error('Failed to get folder path:', error);
      return null;
    }
  }

  async updateFolderInUI(folderPath) {
    try {
      // First try to access the folder
      const response = await fetch(`${this.backendUrl}/set-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderPath })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      // Update UI and storage
      this.currentFolder = folderPath;
      this.elements.currentFolder.textContent = folderPath;
      await chrome.storage.local.set({ savedFolder: folderPath });
      
      this.updateStatus('✅ Folder selected successfully!', 'success');
      this.addLogEntry(`📂 Selected: ${folderPath}`, 'success');

    } catch (error) {
      this.handleFolderError(error);
    }
  }

  async loadSavedFolder() {
    try {
      const { savedFolder } = await chrome.storage.local.get(['savedFolder']);
      if (savedFolder) {
        await this.updateFolderInUI(savedFolder);
      }
    } catch (error) {
      console.error('Failed to load saved folder:', error);
    }
  }

  async checkBackendConnection() {
    try {
      const response = await fetch(`${this.backendUrl}/health`);
      this.isConnected = response.ok;
      this.elements.statusDot.classList.toggle('connected', this.isConnected);
      this.elements.connectionStatus.textContent = this.isConnected ? 
          'Backend Connected' : 'Backend Offline';
      if (this.isConnected) {
        this.addLogEntry('🌐 Connected to backend server', 'success');
      }
    } catch (error) {
      this.isConnected = false;
      this.elements.statusDot.classList.remove('connected');
      this.elements.connectionStatus.textContent = 'Backend Offline';
      console.error('Backend connection error:', error);
    }
  }

  async executeCommand() {
    const command = this.elements.commandInput.value.trim();

    if (!command) {
      this.updateStatus('Please enter a command', 'error');
      return;
    }

    if (!this.currentFolder) {
      this.updateStatus('Please select a folder first', 'error');
      return;
    }

    try {
      this.setExecuteButtonState(true);
      this.updateStatus('Processing command...', 'info');

      // First verify folder exists locally
      if (!await this.verifyFolderExists(this.currentFolder)) {
        throw new Error('Selected folder no longer exists');
      }

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
      
      if (!data.success) {
        throw new Error(data.error);
      }

      this.updateStatus('✅ Command executed successfully!', 'success');
      this.elements.commandInput.value = '';
      this.addLogEntry(`✅ ${data.message}`, 'success');

    } catch (error) {
      this.updateStatus(`❌ Error: ${error.message}`, 'error');
      this.addLogEntry(`❌ ${error.message}`, 'error');
    } finally {
      this.setExecuteButtonState(false);
    }
  }

  async verifyFolderExists(folderPath) {
    try {
      // Request file system permission
      const handle = await window.showDirectoryPicker({
        startIn: folderPath
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  updateStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status-message ${type}`;
  }

  addLogEntry(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.elements.logArea.appendChild(entry);
    this.elements.logArea.scrollTop = this.elements.logArea.scrollHeight;
  }

  handleFolderError(error) {
    console.error('Folder error:', error);
    this.updateStatus(`❌ ${error.message}`, 'error');
    this.addLogEntry(`Folder error: ${error.message}`, 'error');
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SmartAIFileManager();
});
