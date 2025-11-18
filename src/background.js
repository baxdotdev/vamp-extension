// Background service worker responsible for relaying Vamp payloads to launchblitz.ai tabs.
const listenerState = {
    tabId: null,
    ports: new Set()
};

const imageCache = new Map();

function arrayBufferToBase64(buffer) {
    const chunkSize = 0x8000;
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const slice = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode.apply(null, slice);
    }

    return btoa(binary);
}

async function buildLocalImageUrl(sourceUrl) {
    if (!sourceUrl || typeof sourceUrl !== 'string') {
        return null;
    }

    if (sourceUrl.startsWith('data:')) {
        return sourceUrl;
    }

    if (imageCache.has(sourceUrl)) {
        return imageCache.get(sourceUrl);
    }

    try {
        const response = await fetch(sourceUrl, { credentials: 'omit' });
        if (!response.ok) {
            throw new Error(`unexpected status ${response.status}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const mimeType = blob.type || 'application/octet-stream';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        imageCache.set(sourceUrl, dataUrl);
        if (imageCache.size > 50) {
            const firstKey = imageCache.keys().next().value;
            imageCache.delete(firstKey);
        }

        return dataUrl;
    } catch (error) {
        console.warn('[Blitz Extension] Failed to cache local image URL:', sourceUrl, error);
        imageCache.set(sourceUrl, null);
        return null;
    }
}

function notifyListenerPorts(event) {
    let delivered = false;
    listenerState.ports.forEach((port) => {
        try {
            port.postMessage(event);
            delivered = true;
        } catch (error) {
            console.warn('[Blitz Extension] Failed to notify listener port:', error);
        }
    });

    if (!delivered) {
        console.log('[Blitz Extension] Mint listener not open; dropping mint event.');
    }

    return delivered;
}

chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== 'launchblitz-listener') {
        return;
    }

    listenerState.ports.add(port);

    const senderTabId = port.sender && port.sender.tab ? port.sender.tab.id : null;
    if (senderTabId) {
        listenerState.tabId = senderTabId;
    }

    port.onMessage.addListener((message) => {
        if (!message || message.type !== 'listener-keepalive') {
            return;
        }

        try {
            port.postMessage({ type: 'listener-keepalive-ack' });
        } catch (error) {
            console.warn('[Blitz Extension] Failed to acknowledge keepalive ping:', error);
        }
    });

    port.onDisconnect.addListener(() => {
        listenerState.ports.delete(port);

        if (!listenerState.ports.size) {
            listenerState.tabId = null;
        }
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (listenerState.tabId === tabId) {
        listenerState.tabId = null;
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
        return;
    }

    if (message.type === 'launchblitz-mint') {
        const lp = message && message.lp;
        if (!lp) {
            sendResponse({ forwarded: false, reason: 'missing-lp' });
            return;
        }

        const eventPayload = { type: 'launchblitz-mint', lp: lp };
        const delivered = notifyListenerPorts(eventPayload);
        sendResponse(delivered ? { forwarded: true } : { forwarded: false, reason: 'no-listener' });
        return;
    }

    if (message.type === 'check-status') {
        chrome.tabs.query({
            url: [
                'https://launchblitz.ai/*',
                "https://beta.launchblitz.ai/*",
                'https://www.launchblitz.ai/*'
            ]
        }, (launchblitzTabs) => {
            const launchError = chrome.runtime.lastError;
            if (launchError) {
                sendResponse({
                    launchblitz: { ok: false, reason: launchError.message },
                    axiom: { ok: false, reason: 'launchblitz query failed' }
                });
                return;
            }

            const launchTabCount = launchblitzTabs ? launchblitzTabs.length : 0;

            chrome.tabs.query({
                url: [
                    'https://axiom.trade/*',
                    'https://*.axiom.trade/*'
                ]
            }, (axiomTabs) => {
                const axiomError = chrome.runtime.lastError;
                if (axiomError) {
                    sendResponse({
                        launchblitz: { ok: true, tabCount: launchTabCount },
                        axiom: { ok: false, reason: axiomError.message }
                    });
                    return;
                }

                sendResponse({
                    launchblitz: { ok: true, tabCount: launchTabCount },
                    axiom: { ok: true, tabCount: axiomTabs ? axiomTabs.length : 0 }
                });
            });
        });

        return true;
    }

    if (message.type !== 'vamp-coin' || !message.payload) {
        return;
    }

    const senderTabId = sender && sender.tab ? sender.tab.id : 'unknown';
    console.log('[Blitz Extension] Background received vamp-coin payload from tab:', senderTabId, message.payload);

    (async () => {
        const coin = Object.assign({}, message.payload);
        const sourceUrl = coin.image || coin.imageUrl || null;
        const localImageUrl = await buildLocalImageUrl(sourceUrl);

        if (localImageUrl) {
            if (!coin.imageOriginalUrl && coin.image && coin.image !== localImageUrl) {
                coin.imageOriginalUrl = coin.image;
            }

            coin.imageLocalUrl = localImageUrl;
        }

        chrome.tabs.query({
            url: [
                'https://launchblitz.ai/*',
                "https://beta.launchblitz.ai/*",
                'https://www.launchblitz.ai/*'
            ]
        }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn('[Blitz Extension] Failed to query launchblitz.ai tabs:', chrome.runtime.lastError.message);
                sendResponse({ forwarded: false, reason: 'query-failed' });
                return;
            }

            if (!tabs || tabs.length === 0) {
                console.warn('[Blitz Extension] No launchblitz.ai tab detected to receive Vamp payload.');
                sendResponse({ forwarded: false, reason: 'no-tab' });
                return;
            }

            console.log('[Blitz Extension] Forwarding Vamp payload to launchblitz.ai tabs:', tabs.map((tab) => tab.id));
            tabs.forEach((tab) => {
                if (!tab.id) {
                    return;
                }

                chrome.tabs.sendMessage(tab.id, {
                    type: 'vamp-coin',
                    payload: coin
                }, () => {
                    const forwardError = chrome.runtime && chrome.runtime.lastError;
                    if (forwardError) {
                        console.warn('[Blitz Extension] Failed to deliver Vamp payload to tab', tab.id, forwardError.message);
                    } else {
                        console.log('[Blitz Extension] Delivered Vamp payload to launchblitz.ai tab', tab.id);
                    }
                });
            });

            sendResponse({ forwarded: true, tabCount: tabs.length, hasLocalImage: Boolean(localImageUrl) });
        });
    })();

    return true;
});
