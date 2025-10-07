// Launchblitz content script relaying Vamp payloads into the page as vampCoin events.
(function initLaunchblitzRelay() {
    console.log('[Blitz Extension] Launchblitz relay content script initialized.');

    function dispatchVampCoinEvent(coin) {
        if (!coin) {
            return;
        }

        console.log('[Blitz Extension] Dispatching vampCoin event with payload:', coin);
        const vampEvent = new CustomEvent('vampCoin', { detail: coin });
        window.dispatchEvent(vampEvent);
    }

    function normalizeCoinPayload(coin) {
        if (!coin || typeof coin !== 'object') {
            return coin;
        }

        if (coin.imageLocalUrl && typeof coin.imageLocalUrl === 'string') {
            if (!coin.imageOriginalUrl && coin.image && coin.image !== coin.imageLocalUrl) {
                coin.imageOriginalUrl = coin.image;
            }

            coin.image = coin.imageLocalUrl;
        } else if (coin.image && typeof coin.image === 'string' && coin.image.startsWith('data:')) {
            coin.imageLocalUrl = coin.image;
        }

        return coin;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (!message || message.type !== 'vamp-coin') {
            return;
        }

        const payload = normalizeCoinPayload(Object.assign({}, message.payload));
        console.log('[Blitz Extension] Launchblitz content script received vamp-coin message:', payload);
        dispatchVampCoinEvent(payload);
    });

    function isTrustedMintEvent(event) {
        if (!event || event.source !== window) {
            return false;
        }

        const data = event.data;
        return data && data.type === 'launchblitz-mint';
    }

    window.addEventListener('openMint', (event) => {
        if (!isTrustedMintEvent(event)) {
            return;
        }

        const data = event.data;
        if (!data || !data.lp) {
            console.warn('[Blitz Extension] Ignoring mint event with missing lp detail.');
            return;
        }

        chrome.runtime.sendMessage({
            type: 'launchblitz-mint',
            lp: data.lp
        }, (response) => {
            const runtimeError = chrome.runtime && chrome.runtime.lastError;
            if (runtimeError) {
                console.warn('[Blitz Extension] Failed to forward mint event:', runtimeError.message);
                return;
            }

            if (response && response.forwarded !== true) {
                console.warn('[Blitz Extension] Mint event not forwarded:', response && response.reason);
            }
        });
    });
})();
