(function () {
    const defaultSettings = { injectVampButton: true };

    function applyStatus(elementId, status) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        element.textContent = status.label;
        element.setAttribute('data-state', status.state);
    }

    function formatReason(text) {
        if (!text) {
            return 'Error';
        }

        const cleaned = text.replace(/[-_]/g, ' ').trim();
        if (!cleaned) {
            return 'Error';
        }

        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    function interpretStatus(result) {
        if (!result || result.ok === false) {
            return {
                label: formatReason(result && result.reason),
                state: 'error'
            };
        }

        if (result.tabCount > 0) {
            return {
                label: result.tabCount === 1 ? 'Ready' : result.tabCount + ' tabs',
                state: 'ready'
            };
        }

        return {
            label: 'Not detected',
            state: 'missing'
        };
    }

    function getStorageArea() {
        if (chrome.storage && chrome.storage.sync) {
            return chrome.storage.sync;
        }

        if (chrome.storage && chrome.storage.local) {
            return chrome.storage.local;
        }

        return null;
    }

    function initPreferences() {
        const toggle = document.getElementById('injectVampToggle');
        if (!toggle) {
            return;
        }

        const storageArea = getStorageArea();
        if (storageArea) {
            storageArea.get(defaultSettings, (items) => {
                const runtimeError = chrome.runtime && chrome.runtime.lastError;
                if (runtimeError) {
                    toggle.checked = defaultSettings.injectVampButton;
                    return;
                }

                toggle.checked = items && typeof items.injectVampButton === 'boolean'
                    ? items.injectVampButton
                    : defaultSettings.injectVampButton;
            });
        } else {
            toggle.checked = defaultSettings.injectVampButton;
        }

        toggle.addEventListener('change', () => {
            const selected = toggle.checked;
            const activeStorage = getStorageArea();
            if (!activeStorage) {
                return;
            }

            activeStorage.set({ injectVampButton: selected }, () => {
                const runtimeError = chrome.runtime && chrome.runtime.lastError;
                if (runtimeError) {
                    console.warn('[Blitz Extension] Failed to persist preference:', runtimeError.message);
                }
            });
        });
    }

    function initListenerShortcut() {
        const button = document.getElementById('openListenerButton');
        if (!button) {
            return;
        }

        button.addEventListener('click', () => {
            const listenerUrl = chrome.runtime.getURL('listening.html');
            chrome.tabs.create({ url: listenerUrl }, () => {
                const runtimeError = chrome.runtime && chrome.runtime.lastError;
                if (runtimeError) {
                    console.warn('[Blitz Extension] Failed to open listening page:', runtimeError.message);
                }
            });
        });
    }

    function init() {
        const loading = { label: 'Checking...', state: 'checking' };
        applyStatus('launchblitzStatus', loading);
        applyStatus('axiomStatus', loading);

        initPreferences();
        initListenerShortcut();

        chrome.runtime.sendMessage({ type: 'check-status' }, (response) => {
            const runtimeError = chrome.runtime && chrome.runtime.lastError;
            if (runtimeError) {
                const fallback = { label: formatReason(runtimeError.message), state: 'error' };
                applyStatus('launchblitzStatus', fallback);
                applyStatus('axiomStatus', fallback);
                return;
            }

            if (!response) {
                const fallback = { label: 'No response', state: 'error' };
                applyStatus('launchblitzStatus', fallback);
                applyStatus('axiomStatus', fallback);
                return;
            }

            applyStatus('launchblitzStatus', interpretStatus(response.launchblitz));
            applyStatus('axiomStatus', interpretStatus(response.axiom));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
