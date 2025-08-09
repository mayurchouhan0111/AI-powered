/**
 * Background script for AI File Manager Chrome Extension
 */

chrome.runtime.onStartup.addListener(() => {
  console.log('AI File Manager extension started');
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AI File Manager extension installed');
    chrome.storage.local.set({
      backendUrl: 'https://ai-powered-iwnx.onrender.com',
      lastUsed: Date.now()
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

  switch (request.action) {
    case 'checkBackend':
      checkBackendHealth()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'storeCommand':
      chrome.storage.local.get(['commandHistory'], (result) => {
        const history = result.commandHistory || [];
        history.unshift({
          command: request.command,
          filename: request.filename,
          timestamp: Date.now()
        });
        
        if (history.length > 10) {
          history.splice(10);
        }
        
        chrome.storage.local.set({ commandHistory: history });
      });
      break;

    case 'CHECK_FOLDER_EXISTS':
      // Use chrome.runtime.lastError to handle potential errors
      try {
        // Using FileSystemHandle API to check folder existence
        window.showDirectoryPicker({
          startIn: request.path
        }).then(() => {
          sendResponse({ exists: true });
        }).catch(() => {
          sendResponse({ exists: false });
        });
        
        return true; // Keep message channel open for async response
      } catch (error) {
        sendResponse({ exists: false });
      }
      break;
  }
});

async function checkBackendHealth() {
  try {
    const { backendUrl } = await new Promise(resolve =>
      chrome.storage.local.get(['backendUrl'], resolve)
    );
    
    const url = (backendUrl || 'http://127.0.0.1:3000') + '/health';
    console.log('Checking backend health:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Backend health check failed:', error);
    return { 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}
