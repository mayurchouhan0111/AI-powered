// background.js

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);

    // Handle different actions
    switch (request.action) {
        case 'setFolder':
        case 'writeFile':
        case 'readFile':
        case 'aiTask':
            // Forward the message to the backend
            fetch(`http://localhost:3000/${request.action}`, {
                method: 'POST', // Assuming all these actions use POST
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request.data)
            })
                .then(response => response.json())
                .then(data => {
                    sendResponse({ response: data }); // Send the backend's response back to the popup
                })
                .catch(error => {
                    sendResponse({ error: error.message });
                });
            return true;  // Important: Indicate that you will be sending a response asynchronously

        default:
            console.warn('Unknown action:', request.action);
            sendResponse({ error: 'Unknown action' });
            return false;
    }
});