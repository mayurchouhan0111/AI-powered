document.addEventListener('DOMContentLoaded', () => {
    const codeEditor = document.getElementById('codeEditor');
    const aiCommand = document.getElementById('aiCommand');
    const saveBtn = document.getElementById('saveBtn');
    const sendBtn = document.getElementById('sendBtn');
    const newBtn = document.getElementById('newBtn');
    const loadBtn = document.getElementById('loadBtn');
    const status = document.getElementById('status');

    const backendUrl = 'http://localhost:3000';
    let currentFile = ''; // Track the currently opened file

    // Function to display status messages
    function showStatus(message, isError = false) {
        status.textContent = message;
        status.style.color = isError ? 'red' : 'green';
    }

    // Function to send AI command to the backend
    async function sendToAI(command, code) {
        showStatus('Sending to AI...');
        try {
            const response = await fetch(`${backendUrl}/smart-execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command, code, filename: currentFile }),
            });

            const data = await response.json();

            if (data.success) {
                codeEditor.value = data.code; // Update the code editor with the AI's response
                showStatus('AI updated the code!');
            } else {
                showStatus(`AI Error: ${data.error}`, true);
            }
        } catch (error) {
            showStatus(`Network error: ${error.message}`, true);
        }
    }

    // Function to save the current file
    async function saveFile(filename, code) {
        showStatus('Saving file...');
        try {
            const response = await fetch(`${backendUrl}/write-file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename, code }),
            });

            const data = await response.json();

            if (data.success) {
                showStatus('File saved successfully!');
                currentFile = filename;
            } else {
                showStatus(`Save error: ${data.error}`, true);
            }
        } catch (error) {
            showStatus(`Network error: ${error.message}`, true);
        }
    }

    // Function to load a file
    async function loadFile(filename) {
        showStatus('Loading file...');
        try {
            const response = await fetch(`${backendUrl}/read-file?filename=${filename}`);
            const data = await response.json();

            if (data.success) {
                codeEditor.value = data.code;
                showStatus('File loaded!');
                currentFile = filename;
            } else {
                showStatus(`Load error: ${data.error}`, true);
            }
        } catch (error) {
            showStatus(`Network error: ${error.message}`, true);
        }
    }

    // Event listeners for the buttons
    saveBtn.addEventListener('click', () => {
        const filename = prompt('Enter filename to save:');
        if (filename) {
            saveFile(filename, codeEditor.value);
        }
    });

    sendBtn.addEventListener('click', () => {
        const command = aiCommand.value;
        sendToAI(command, codeEditor.value);
    });

    newBtn.addEventListener('click', () => {
        codeEditor.value = '';
        currentFile = '';
        showStatus('New file created!');
    });

    loadBtn.addEventListener('click', () => {
        const filename = prompt('Enter filename to load:');
        if (filename) {
            loadFile(filename);
        }
    });
});