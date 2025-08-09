// background.js

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        console.log(sender.tab ?
            "from a content script: " + sender.tab.url :
            "from the extension");
        
        const apiUrl = `http://localhost:3000/api/${request.action}`
        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request.data)
        })
        .then(response => response.json())
        .then(data => {
            sendResponse({response: data});
        })
        .catch(error => {
            sendResponse({error: error.message});
        });

        return true; // Indicate that the response will be sent asynchronously
    }
);