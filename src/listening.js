(function initMintListenerPage() {
    const statusValue = document.getElementById('statusValue');
    const statusDescription = document.getElementById('statusDescription');

    const RECONNECT_DELAY_MS = 1500;
    const KEEPALIVE_INTERVAL_MS = 25000;

    let activePort = null;
    let reconnectTimerId = null;
    let keepAliveTimerId = null;

    function updateStatus(text, state, description) {
        if (statusValue) {
            statusValue.textContent = text;
            statusValue.setAttribute('data-state', state);
        }

        if (!statusDescription) {
            return;
        }

        if (description) {
            statusDescription.textContent = description;
            return;
        }

        if (state === 'detected') {
            statusDescription.textContent = 'Opening the Axiom trading page in a new tab.';
        } else if (state === 'error') {
            statusDescription.textContent = 'Something went wrong. Please reopen this page from the extension popup.';
        } else {
            statusDescription.textContent = 'The Axiom trading page will open here when a new mint arrives.';
        }
    }

    function clearKeepAliveTimer() {
        if (keepAliveTimerId) {
            clearInterval(keepAliveTimerId);
            keepAliveTimerId = null;
        }
    }

    function clearReconnectTimer() {
        if (reconnectTimerId) {
            clearTimeout(reconnectTimerId);
            reconnectTimerId = null;
        }
    }

    function scheduleReconnect() {
        if (reconnectTimerId) {
            return;
        }

        reconnectTimerId = setTimeout(() => {
            reconnectTimerId = null;
            connectToBackground();
        }, RECONNECT_DELAY_MS);
    }

    function startKeepAliveTimer() {
        clearKeepAliveTimer();

        keepAliveTimerId = setInterval(() => {
            if (!activePort) {
                return;
            }

            try {
                activePort.postMessage({ type: 'listener-keepalive' });
            } catch (error) {
                console.warn('[Blitz Extension] Failed to send keepalive ping:', error);
            }
        }, KEEPALIVE_INTERVAL_MS);
    }

    function openAxiomTab(lp) {
        const targetUrl = `https://axiom.trade/meme/${encodeURIComponent(lp)}`;
        chrome.tabs.create({ url: targetUrl }, () => {
            const runtimeError = chrome.runtime && chrome.runtime.lastError;
            if (runtimeError) {
                console.warn('[Blitz Extension] Failed to open axiom.trade tab:', runtimeError.message);
                updateStatus('Failed to open axiom.trade', 'error');
            }
        });
    }

    function handleMintEvent(message) {
        if (!message || message.type !== 'launchblitz-mint') {
            return;
        }

        const lp = message.lp;
        if (!lp) {
            updateStatus('Mint event missing LP detail', 'error');
            return;
        }

        updateStatus(`Mint detected for ${lp}`, 'detected');
        openAxiomTab(lp);
    }

    function connectToBackground() {
        clearReconnectTimer();

        if (activePort) {
            activePort.disconnect();
            activePort = null;
        }

        let port;
        try {
            port = chrome.runtime.connect({ name: 'launchblitz-listener' });
        } catch (error) {
            console.warn('[Blitz Extension] Failed to connect to background:', error);
            updateStatus('Unable to reach extension background', 'error');
            scheduleReconnect();
            return;
        }

        activePort = port;

        port.onMessage.addListener(handleMintEvent);

        port.onDisconnect.addListener(() => {
            if (activePort === port) {
                activePort = null;
            }

            clearKeepAliveTimer();
            updateStatus('Connection lost. Reconnecting…', 'waiting', 'Trying to reconnect to the extension background.');
            scheduleReconnect();
        });

        updateStatus('Connected. Waiting for mint events…', 'listening');
        startKeepAliveTimer();
    }

    updateStatus('Connecting to extension…', 'waiting', 'Trying to establish a connection to the extension background.');
    connectToBackground();
})();
