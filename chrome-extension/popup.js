document.addEventListener('DOMContentLoaded', () => {
    const codeEditor = document.getElementById('codeEditor');
    const aiCommand = document.getElementById('aiCommand');
    const sendBtn = document.getElementById('sendBtn');
    const newBtn = document.getElementById('newBtn');
    const loadBtn = document.getElementById('loadBtn');
    const saveBtn = document.getElementById('saveBtn');
    const chatHistory = document.getElementById('chatHistory');
    const currentFilenameInput = document.getElementById('currentFilename');

    const backendUrl = 'http://localhost:3000/api';
    let currentFilename = '';

    // Function to display messages in the chat history
    function displayMessage(message, sender = 'AI') {
        const messageElement = document.createElement('div');
        messageElement.textContent = `${sender}: ${message}`;
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom
    }

    // Function to send AI command to the backend
    async function sendToAI(command, code, filename) {
        displayMessage(`Sending command: ${command}`, 'User');
        try {
            const response = await fetch(`${backendUrl}/ai-task`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: command, code: code, filename: filename }),
            });

            const data = await response.json();

            if (data.success) {
                codeEditor.value = data.code;
                displayMessage('AI updated the code!', 'AI');
            } else {
                displayMessage(`AI Error: ${data.error}`, 'AI');
            }
        } catch (error) {
            displayMessage(`Network error: ${error.message}`, 'Error');
        }
    }

    // Function to save the current file
    async function saveFile(filename, code) {
        try {
            const response = await fetch(`${backendUrl}/write-file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: filename, content: code }),
            });

            const data = await response.json();

            if (data.success) {
                displayMessage('File saved successfully!', 'System');
                currentFilename = filename;
                currentFilenameInput.value = filename;
            } else {
                displayMessage(`Save error: ${data.error}`, 'Error');
            }
        } catch (error) {
            displayMessage(`Network error: ${error.message}`, 'Error');
        }
    }

    // Function to load a file
    async function loadFile(filename) {
        try {
            const response = await fetch(`${backendUrl}/read-file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: filename }),
            });

            const data = await response.json();

            if (data.success) {
                codeEditor.value = data.content;
                displayMessage('File loaded!', 'System');
                currentFilename = filename;
                currentFilenameInput.value = filename;
            } else {
                displayMessage(`Load error: ${data.error}`, 'Error');
            }
        } catch (error) {
            displayMessage(`Network error: ${error.message}`, 'Error');
        }
    }

    // Function to create a new file
    function newFile() {
        codeEditor.value = '';
        currentFilename = '';
        currentFilenameInput.value = '';
        displayMessage('New file created!', 'System');
    }

    // Event listeners for the buttons
    sendBtn.addEventListener('click', () => {
        const command = aiCommand.value;
        sendToAI(command, codeEditor.value, currentFilename);
        aiCommand.value = '';
    });

    saveBtn.addEventListener('click', () => {
        const filename = currentFilenameInput.value || prompt('Enter filename to save:');
        if (filename) {
            saveFile(filename, codeEditor.value);
        }
    });

    loadBtn.addEventListener('click', () => {
        const filename = prompt('Enter filename to load:');
        if (filename) {
            loadFile(filename);
        }
    });

    newBtn.addEventListener('click', () => {
        newFile();
    });
});