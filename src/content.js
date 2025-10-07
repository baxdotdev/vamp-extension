const IGNORED_LINK_PATTERNS = [
    'pump.fun',
    'bags.fm',
    'bonk.fun',
    'dexscreener.com',
    'birdeye.so',
    'solscan.io',
    'axiom.trade',
    '/search?q='
];

const SOCIAL_PLATFORM_RULES = [
    { platform: 'twitter', patterns: ['twitter.com', 'x.com'] },
    { platform: 'truthsocial', patterns: ['truthsocial.com'] },
    { platform: 'telegram', patterns: ['t.me', 'telegram.me', 'telegram.org'] },
    { platform: 'discord', patterns: ['discord.com', 'discord.gg'] },
    { platform: 'tiktok', patterns: ['tiktok.com'] },
    { platform: 'youtube', patterns: ['youtube.com', 'youtu.be'] }
];

function shouldIgnoreLink(url) {
    if (!url) {
        return true;
    }
    const lowerUrl = url.toLowerCase();
    for (let i = 0; i < IGNORED_LINK_PATTERNS.length; i++) {
        if (lowerUrl.includes(IGNORED_LINK_PATTERNS[i])) {
            return true;
        }
    }

    return false;
}

function matchPlatformByPattern(value) {
    if (!value) {
        return null;
    }

    const lowerValue = value.toLowerCase();

    for (let i = 0; i < SOCIAL_PLATFORM_RULES.length; i++) {
        const rule = SOCIAL_PLATFORM_RULES[i];

        for (let j = 0; j < rule.patterns.length; j++) {
            if (lowerValue.includes(rule.patterns[j])) {
                return rule.platform;
            }
        }
    }

    return null;
}

function matchPlatformByAltText(altText) {
    const lowerAlt = altText.toLowerCase();

    if (lowerAlt.includes('truth')) {
        return 'truthsocial';
    }

    if (lowerAlt.includes('twitter') || lowerAlt === 'x') {
        return 'twitter';
    }

    if (lowerAlt.includes('telegram')) {
        return 'telegram';
    }

    if (lowerAlt.includes('discord')) {
        return 'discord';
    }

    if (lowerAlt.includes('tiktok')) {
        return 'tiktok';
    }

    if (lowerAlt.includes('youtube')) {
        return 'youtube';
    }

    return null;
}

function detectPlatform(url, imgElement) {
    let platform = matchPlatformByPattern(url);

    if (!platform && imgElement && imgElement.alt) {
        platform = matchPlatformByAltText(imgElement.alt);
    }

    if (!platform) {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            platform = matchPlatformByPattern(domain);
            if (!platform) {
                platform = 'website';
            }
        } catch (error) {
            return 'unknown';
        }
    }

    return platform || 'unknown';
}

function determinePrimaryLink(socialLinks) {
    if (!Array.isArray(socialLinks) || socialLinks.length === 0) {
        return null;
    }

    const twitterLink = socialLinks.find((link) => link && link.platform === 'twitter');
    if (twitterLink) {
        return twitterLink;
    }

    return socialLinks.find((link) => link && link.url) || null;
}

function determineSecondaryLink(socialLinks, primaryLink) {
    if (!Array.isArray(socialLinks) || socialLinks.length === 0) {
        return null;
    }

    const candidates = socialLinks.filter((link) => {
        if (!link || !link.url) {
            return false;
        }

        if (primaryLink && primaryLink.url === link.url) {
            return false;
        }

        return true;
    });

    if (candidates.length === 0) {
        return null;
    }

    const knownSecondary = candidates.find((link) => link.platform !== 'unknown');
    if (knownSecondary) {
        return knownSecondary;
    }

    return candidates[0];
}

// Extract token details from a token section
// Extract token details from a token section (using same logic as axiom extension)
function extractTokenDetails(tokenSection) {
    try {
        // Get token symbol/ticker (short version) - try multiple selectors
        let symbol = '';

        const allTickerSpans = tokenSection.querySelectorAll('span.text-textPrimary');

        for (let i = 0; i < allTickerSpans.length; i++) {
            const span = allTickerSpans[i];
            const text = span.textContent.trim();

            if (span.querySelector('span')) {
                const childSpans = span.querySelectorAll('span');
                for (let j = 0; j < childSpans.length; j++) {
                    const childSpan = childSpans[j];
                    const childText = childSpan.textContent.trim();

                    if (childText.length >= 1 && childText.length <= 15) {
                        symbol = childText;
                        break;
                    }
                }
                if (symbol) break;
                continue;
            }

            if (text.length >= 1 && text.length <= 15 && text.length < 20) {
                symbol = text;
                break;
            }
        }

        if (!symbol) {
            const fallbackSelectors = [
                '[class*="symbol"]',
                '[class*="ticker"]',
                'span[class*="text-xs"]',
                'span[class*="uppercase"]'
            ];

            for (const selector of fallbackSelectors) {
                const symbolElement = tokenSection.querySelector(selector);
                if (symbolElement && symbolElement.textContent.trim()) {
                    const candidateSymbol = symbolElement.textContent.trim();
                    if (candidateSymbol.length >= 1 && candidateSymbol.length <= 20) {
                        symbol = candidateSymbol;
                        break;
                    }
                }
            }
        }

        // Get full token name - try multiple selectors
        let fullName = '';

        // Try to get from the clickable token name span (most accurate)
        const nameSpan = tokenSection.querySelector('span.text-inherit[class*="font-medium"][class*="truncate"]');
        if (nameSpan) {
            fullName = nameSpan.textContent.trim();
        }

        // Get image element (needed for both name fallback and image URL)
        let imageElement = tokenSection.querySelector('img[src*="axiomtrading"]');

        // Try other common image selectors if axiomtrading not found
        if (!imageElement) {
            imageElement = tokenSection.querySelector('img[src*="token"], img[src*="coin"], img[alt*="token"], img[alt*="coin"]');
        }

        // Generic image fallback
        if (!imageElement) {
            imageElement = tokenSection.querySelector('img');
        }

        // Fallback: get from image alt attribute
        if (!fullName && imageElement && imageElement.alt) {
            fullName = imageElement.alt.trim();
        }

        // Use symbol as final fallback if no full name found
        if (!fullName && symbol) {
            fullName = symbol;
        }

        // Get image URL
        const imageUrl = imageElement ? imageElement.src : '';

        // Extract social media links from the page
        const socialLinks = extractSocialLinks(tokenSection);
        const primaryLink = determinePrimaryLink(socialLinks);
        const secondaryLink = determineSecondaryLink(socialLinks, primaryLink);

        return {
            symbol: symbol || 'Unknown',
            fullName: fullName || symbol || 'Unknown',
            imageUrl: imageUrl,
            twitterUrl: primaryLink ? primaryLink.url : null,
            websiteUrl: secondaryLink ? secondaryLink.url : null,
            socialLinks: socialLinks
        };

    } catch (error) {
        return null;
    }
}

// Extract all social media links from the token section
function extractSocialLinks(tokenSection) {
    const socialLinks = [];

    const socialContainer = tokenSection.querySelector('div.flex.flex-row.gap-\\[8px\\]');
    if (socialContainer) {
        const linkElements = socialContainer.querySelectorAll('a[href]');

        linkElements.forEach((link, index) => {
            const url = link.href;
            const imgElement = link.querySelector('img');
            const iconElement = link.querySelector('i');

            if (shouldIgnoreLink(url)) {
                return;
            }

            if (iconElement && iconElement.classList.contains('ri-search-line')) {
                return;
            }

            const platform = detectPlatform(url, imgElement);

            socialLinks.push({
                platform: platform,
                url: url
            });
        });
    }

    if (socialLinks.length === 0) {
        const twitterUrl = findTwitterUrl(tokenSection);
        if (twitterUrl) {
            socialLinks.push({ platform: 'twitter', url: twitterUrl });
        }

        const websiteUrl = findWebsiteUrl(tokenSection);
        if (websiteUrl) {
            socialLinks.push({ platform: 'website', url: websiteUrl });
        }
    }

    return socialLinks;
}

// Find Twitter URL in the token section or page
function findTwitterUrl(tokenSection) {
    // Look for Twitter links in the token section first
    const twitterLinks = tokenSection.querySelectorAll('a[href*="twitter.com"], a[href*="x.com"]');

    // Filter out search links and other hardcoded links
    for (const link of twitterLinks) {
        const url = link.href;
        const iconElement = link.querySelector('i');

        if (url.includes('/search?q=') || (iconElement && iconElement.classList.contains('ri-search-line'))) {
            continue;
        }

        if (shouldIgnoreLink(url)) {
            continue;
        }

        // Return first valid Twitter link
        return url;
    }

    // Extract from meta tags as last resort
    const twitterMeta = document.querySelector('meta[name="twitter:site"], meta[property="twitter:site"]');
    if (twitterMeta) {
        const handle = twitterMeta.content.replace('@', '');
        return `https://twitter.com/${handle}`;
    }

    return null;
}

// Find website URL - only use links with the global/website icon
function findWebsiteUrl(tokenSection) {
    // Look specifically for links that contain the ri-global-line icon (website icon)
    const websiteLinkWithIcon = tokenSection.querySelector('a i.ri-global-line');
    if (websiteLinkWithIcon) {
        const websiteLink = websiteLinkWithIcon.closest('a');
        if (websiteLink && websiteLink.href) {
            const url = websiteLink.href;

            if (shouldIgnoreLink(url)) {
                return null;
            }

            return url;
        }
    }

    // Fallback: look for other website icons
    const websiteIconSelectors = [
        'a i[class*="global"]',
        'a i[class*="website"]',
        'a i[class*="web"]',
        'a [class*="globe"]'
    ];

    for (const selector of websiteIconSelectors) {
        const iconElement = tokenSection.querySelector(selector);
        if (iconElement) {
            const websiteLink = iconElement.closest('a');
            if (websiteLink && websiteLink.href) {
                const url = websiteLink.href;

                if (shouldIgnoreLink(url)) {
                    continue;
                }

                return url;
            }
        }
    }

    return null;
}

// Placeholder handler that prepares token details for custom launchpad logic.
function handleVampAction(tokenDetails) {
    const coinPayload = {
        name: tokenDetails.fullName || tokenDetails.symbol || 'Unknown',
        symbol: tokenDetails.symbol || '',
        twitter: tokenDetails.twitterUrl || '',
        image: tokenDetails.imageUrl || '',
        website: tokenDetails.websiteUrl || tokenDetails.siteUrl || ''
    };

    console.log('[Blitz Extension] VAMP button clicked with payload:', coinPayload);

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
            console.log('[Blitz Extension] Sending Vamp payload to background service worker.');
            chrome.runtime.sendMessage({
                type: 'vamp-coin',
                payload: coinPayload
            }, () => {
                const messageError = chrome.runtime && chrome.runtime.lastError;
                if (messageError) {
                    console.warn('[Blitz Extension] Failed to forward Vamp coin payload:', messageError.message);
                } else {
                    console.log('[Blitz Extension] Background service worker acknowledged Vamp payload.');
                }
            });
        }
    } catch (error) {
        console.error('[Blitz Extension] Error sending Vamp coin payload:', error);
    }

    if (typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('blitz:vamp', { detail: tokenDetails }));
    }
}


function createCheckmarkElement() {
    const checkmark = document.createElement('span');
    checkmark.className = 'vamp-button__check';
    checkmark.textContent = '✓';
    return checkmark;
}

// Add VAMP button to token section
function addVampButton(tokenSection) {
    // Check if VAMP button already exists
    if (tokenSection.querySelector('.vamp-button')) {
        return false;
    }

    // Create VAMP button
    const vampButton = document.createElement('button');
    vampButton.type = 'button';
    vampButton.className = 'vamp-button';
    vampButton.setAttribute('aria-label', 'Launchblitz');

    const vampLabel = document.createElement('span');
    vampLabel.className = 'vamp-button__label';
    vampLabel.textContent = 'V';
    const vampCheckmark = createCheckmarkElement();

    vampButton.appendChild(vampLabel);
    vampButton.appendChild(vampCheckmark);

    // Add click handler
    vampButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Disable button while fetching live token details
        vampButton.disabled = true;
        let tokenDetails = null;

        try {
            tokenDetails = extractTokenDetails(tokenSection);
        } catch (error) {
            console.error('[Blitz Extension] Error extracting token details on click:', error);
        }

        if (!tokenDetails) {
            console.warn('[Blitz Extension] Token details unavailable when VAMP button was clicked.');
            vampButton.disabled = false;
            return;
        }

        vampButton.classList.add('is-success');

        try {
            handleVampAction(tokenDetails);
        } catch (error) {
            console.error('[Blitz Extension] Failed to handle VAMP action:', error);
        }

        // Re-enable button after delay
        setTimeout(() => {
            vampButton.disabled = false;
            vampButton.classList.remove('is-success');
        }, 1000);
    });

    // Find the best place to insert the button
    // Try to find a button container or similar element
    let insertTarget = tokenSection;

    // Look for the quick buy container (for token list items)
    const quickBuyContainer = tokenSection.querySelector('.hidden.sm\\:flex');
    if (quickBuyContainer) {
        insertTarget = quickBuyContainer.parentNode;
        insertTarget.insertBefore(vampButton, quickBuyContainer);
        return true;
    }

    // Default: add to the end of the token section
    tokenSection.appendChild(vampButton);
    return true;
}

// Add small VAMP button next to token name (for detailed card layout)
function addSmallVampButton(tokenCard) {
    // Find the token name span
    const tokenNameSpan = tokenCard.querySelector('span.text-textPrimary[class*="text-\\[16px\\]"][class*="font-medium"][class*="truncate"]');
    if (!tokenNameSpan) {
        return false;
    }

    // Create small VAMP button
    const vampButton = document.createElement('button');
    vampButton.type = 'button';
    vampButton.className = 'vamp-button-small';
    vampButton.setAttribute('aria-label', 'Launchblitz');

    const vampLabel = document.createElement('span');
    vampLabel.className = 'vamp-button__label';
    vampLabel.textContent = 'V';
    const vampCheckmark = createCheckmarkElement();

    vampButton.appendChild(vampLabel);
    vampButton.appendChild(vampCheckmark);

    // Add click handler
    vampButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Disable button while fetching live token details
        vampButton.disabled = true;
        let tokenDetails = null;

        try {
            tokenDetails = extractTokenDetails(tokenCard);
        } catch (error) {
            console.error('[Blitz Extension] Error extracting token details on click:', error);
        }

        if (!tokenDetails) {
            console.warn('[Blitz Extension] Token details unavailable when VAMP button was clicked.');
            vampButton.disabled = false;
            return;
        }

        vampButton.classList.add('is-success');

        try {
            handleVampAction(tokenDetails);
        } catch (error) {
            console.error('[Blitz Extension] Failed to handle VAMP action:', error);
        }

        // Reset button
        setTimeout(() => {
            vampButton.disabled = false;
            vampButton.classList.remove('is-success');
        }, 1000);
    });

    // Insert the button right before the token name span
    tokenNameSpan.parentNode.insertBefore(vampButton, tokenNameSpan);

    return true;
}

// Track processed sections to prevent duplicates
let processedSections = new WeakSet();
let isProcessing = false;
const defaultPreferences = { injectVampButton: true };
let injectVampButtonEnabled = true;
let preferencesInitialized = false;
let observersConfigured = false;
let storageListenerRegistered = false;

function getStorageArea() {
    if (typeof chrome === 'undefined' || !chrome.storage) {
        return null;
    }

    if (chrome.storage.sync) {
        return chrome.storage.sync;
    }

    if (chrome.storage.local) {
        return chrome.storage.local;
    }

    return null;
}

function removeInjectedButtons() {
    const vampButtons = document.querySelectorAll('.vamp-button, .vamp-button-small');
    vampButtons.forEach((button) => {
        button.remove();
    });
    processedSections = new WeakSet();
}

function applyInjectPreference(enabled) {
    injectVampButtonEnabled = enabled !== false;

    if (!injectVampButtonEnabled) {
        removeInjectedButtons();
        return;
    }

    if (preferencesInitialized && observersConfigured) {
        processedSections = new WeakSet();
        setTimeout(processTokenCards, 0);
    }
}

function loadPreferences(onComplete) {
    const storageArea = getStorageArea();

    if (!storageArea) {
        preferencesInitialized = true;
        applyInjectPreference(defaultPreferences.injectVampButton);
        if (typeof onComplete === 'function') {
            onComplete();
        }
        return;
    }

    storageArea.get(defaultPreferences, (items) => {
        const runtimeError = chrome.runtime && chrome.runtime.lastError;
        if (runtimeError) {
            console.warn('[Blitz Extension] Failed to read preferences:', runtimeError.message);
            applyInjectPreference(defaultPreferences.injectVampButton);
        } else {
            const storedValue = items && typeof items.injectVampButton === 'boolean'
                ? items.injectVampButton
                : defaultPreferences.injectVampButton;
            applyInjectPreference(storedValue);
        }

        preferencesInitialized = true;

        if (typeof onComplete === 'function') {
            onComplete();
        }
    });
}

function registerPreferenceListener() {
    if (storageListenerRegistered) {
        return;
    }

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
        return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' && areaName !== 'local') {
            return;
        }

        if (!changes || !Object.prototype.hasOwnProperty.call(changes, 'injectVampButton')) {
            return;
        }

        const change = changes.injectVampButton;
        const nextValue = typeof change.newValue === 'boolean'
            ? change.newValue
            : defaultPreferences.injectVampButton;
        applyInjectPreference(nextValue);
    });

    storageListenerRegistered = true;
}

function startProcessingPipeline() {
    if (observersConfigured) {
        if (injectVampButtonEnabled) {
            setTimeout(processTokenCards, 0);
        }
        return;
    }

    observersConfigured = true;

    if (injectVampButtonEnabled) {
        setTimeout(processTokenCards, 1000);
    }

    const observer = new MutationObserver(() => {
        setTimeout(processTokenCards, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setInterval(processTokenCards, 3000);

    let currentUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            if (shouldRunOnThisPage()) {
                setTimeout(processTokenCards, 500);
            }
        }
    }, 1000);

    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            if (shouldRunOnThisPage()) {
                processTokenCards();
            }
        }, 200);
    });
}

// Find and process token cards
function processTokenCards() {
    if (!injectVampButtonEnabled) {
        return;
    }

    // Prevent concurrent processing
    if (isProcessing) {
        return;
    }

    isProcessing = true;
    // TODO: Update these selectors to match the layouts on your launchpad
    const tokenInfoSections = document.querySelectorAll('div.flex.flex-row.gap-\\[8px\\].justify-center.items-center');
    const tokenListItems = document.querySelectorAll('a.flex.flex-row.flex-1[class*="h-\\[88px\\]"], a.flex.flex-row.flex-1[class*="h-\\[64px\\]"]');
    const modalTokenItems = document.querySelectorAll('a[href^="/meme/"][class*="flex-row"][class*="px-\\[16px\\]"]');

    // ADDITIONAL: New card layout with detailed token info
    const detailedTokenCards = document.querySelectorAll('div.flex.flex-row.w-full.gap-\\[12px\\][class*="pl-\\[12px\\]"][class*="pr-\\[12px\\]"][class*="pt-\\[12px\\]"][class*="pb-\\[2px\\]"]');

    let buttonsAdded = 0;

    // Process original token info sections
    tokenInfoSections.forEach((tokenSection, index) => {
        // Skip if already processed
        if (processedSections.has(tokenSection)) {
            return;
        }

        // Basic guard: make sure we have something that looks like a token entry
        const hasTokenImage = tokenSection.querySelector('img');
        const hasTokenSymbol = tokenSection.querySelector('span.text-textPrimary');

        // Add buttons to any token that has ticker and symbol metadata
        if (hasTokenImage && hasTokenSymbol) {
            // Check if VAMP button already exists
            const hasVampButton = tokenSection.querySelector('.vamp-button');

            if (!hasVampButton) {
                if (addVampButton(tokenSection)) {
                    buttonsAdded++;
                    // Mark as processed
                    processedSections.add(tokenSection);
                }
            } else {
                // Mark as already processed
                processedSections.add(tokenSection);
            }
        }
    });

    // Process token list items
    tokenListItems.forEach((tokenItem, index) => {
        // Skip if already processed
        if (processedSections.has(tokenItem)) {
            return;
        }

        // Skip if this item is inside a modal/search dialog
        const isInModal = tokenItem.closest('[role="dialog"]') ||
            tokenItem.closest('.fixed.inset-0') ||
            tokenItem.closest('[class*="modal"]') ||
            tokenItem.closest('[class*="popup"]') ||
            tokenItem.closest('[class*="search"]') ||
            tokenItem.closest('.bg-backgroundTertiary.border-secondaryStroke') ||
            tokenItem.closest('[class*="shadow-"][class*="overflow-hidden"][class*="pointer-events-auto"]');

        if (isInModal) {
            return;
        }

        // Basic guard: make sure we have something that looks like a token entry
        const hasTokenImage = tokenItem.querySelector('img');
        const hasTokenSymbol = tokenItem.querySelector('span.text-textPrimary');

        // Add buttons to any token that has ticker and symbol metadata
        if (hasTokenImage && hasTokenSymbol) {
            // Check if VAMP button already exists
            const hasVampButton = tokenItem.querySelector('.vamp-button');

            if (!hasVampButton) {
                if (addVampButton(tokenItem)) {
                    buttonsAdded++;
                    // Mark as processed
                    processedSections.add(tokenItem);
                }
            } else {
                // Mark as already processed
                processedSections.add(tokenItem);
            }
        }
    });

    // Process search modal token items
    modalTokenItems.forEach((modalItem, index) => {
        // Skip if already processed
        if (processedSections.has(modalItem)) {
            return;
        }

        // Basic guard: make sure we have something that looks like a token entry
        const hasTokenImage = modalItem.querySelector('img');
        const hasTokenSymbol = modalItem.querySelector('span.text-textPrimary');

        // Add buttons to any token that has ticker and symbol metadata
        if (hasTokenImage && hasTokenSymbol) {
            // Check if VAMP button already exists
            const hasVampButton = modalItem.querySelector('.vamp-button');

            if (!hasVampButton) {
                if (addVampButton(modalItem)) {
                    buttonsAdded++;
                    // Mark as processed
                    processedSections.add(modalItem);
                }
            } else {
                // Mark as already processed
                processedSections.add(modalItem);
            }
        }
    });

    // Process detailed token cards (NEW card layout)
    detailedTokenCards.forEach((detailedCard, index) => {
        // Skip if already processed
        if (processedSections.has(detailedCard)) {
            return;
        }

        // Check if this card contains the required elements
        const hasTokenImage = detailedCard.querySelector('img');
        const hasTokenName = detailedCard.querySelector('span.text-textPrimary[class*="text-\\[16px\\]"][class*="font-medium"][class*="truncate"]');

        // Add VAMP button to any detailed card that has image and name
        if (hasTokenImage && hasTokenName) {
            // Check if VAMP button already exists
            const hasVampButton = detailedCard.querySelector('.vamp-button-small');

            if (!hasVampButton) {
                if (addSmallVampButton(detailedCard)) {
                    buttonsAdded++;
                    // Mark as processed
                    processedSections.add(detailedCard);
                }
            } else {
                // Mark as already processed
                processedSections.add(detailedCard);
            }
        }
    });

    isProcessing = false;
}

// Check if we should run on this page
function shouldRunOnThisPage() {
    const hostname = window.location.hostname;
    return hostname.includes('axiom.trade');
}

// Initialize the extension
function init() {
    // Check if we should run on this page
    if (!shouldRunOnThisPage()) {
        return;
    }

    // Process existing token cards immediately
    setTimeout(processTokenCards, 1000);

    // Set up mutation observer for dynamic content
    const observer = new MutationObserver(() => {
        setTimeout(processTokenCards, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Process token cards periodically
    setInterval(processTokenCards, 1000);

    // Monitor URL changes for SPAs
    let currentUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            if (shouldRunOnThisPage()) {
                setTimeout(processTokenCards, 500);
            }
        }
    }, 1000);

    // Process on scroll (for infinite scroll)
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            if (shouldRunOnThisPage()) {
                processTokenCards();
            }
        }, 200);
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Also process when page is fully loaded
window.addEventListener('load', () => {
    if (shouldRunOnThisPage() && preferencesInitialized && injectVampButtonEnabled) {
        setTimeout(processTokenCards, 100);
    }
});
