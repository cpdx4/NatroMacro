/**
 * Boost Tab Event Handlers
 * Provides bidirectional sync between Boost tab controls and AHK settings
 * Follows the pattern established in dynamicTabs.js and killTabHandlers.js
 * 
 * Control Mapping:
 * - Field Booster #1-3: Dropdown selectors (blueBooster, redBooster, mountainBooster, none)
 * - Booster Mins: Number input for separation interval
 * - Gather in Boosted Field: Checkbox
 * - Field Type Boosters: Checkboxes for each field (BlueFlower, Bamboo, etc.)
 * - Auto Field Boost: Checkbox to activate automatic boosting
 * - Auto Field Boost Refresh: Number input for re-buff interval
 */

// Flag to prevent update loops when restoring state from AHK
let suppressBoostSend = false;
// Apply init payload only once
let hasBoostInitApplied = false;

/**
 * Initialize Boost tab event listeners
 * Called once on page load
 */
function initializeBoostTabHandlers() {
    // FIELD BOOSTERS SECTION
    // Booster #1, #2, #3 dropdowns
    $('#boostFieldBooster1').on('change', function() {
        sendBoostUpdate('FieldBooster1', normalizeBoosterValue($(this).val()));
    });
    $('#boostFieldBooster2').on('change', function() {
        sendBoostUpdate('FieldBooster2', normalizeBoosterValue($(this).val()));
    });
    $('#boostFieldBooster3').on('change', function() {
        sendBoostUpdate('FieldBooster3', normalizeBoosterValue($(this).val()));
    });

    // Booster separation minutes
    $('#boostMinsInput').on('change', function() {
        const value = parseInt($(this).val()) || 0;
        sendBoostUpdate('FieldBoosterMins', value);
    });

    // Gather in Boosted Field checkbox
    $('#boostGatherInBoostedField').on('change', function() {
        sendBoostUpdate('BoostChaserCheck', this.checked ? 1 : 0);
    });

    // FIELD TYPE BOOSTER CHECKBOXES
    const fieldBoosterMap = {
        'boostBlueFlower': 'BlueFlowerBoosterCheck',
        'boostBamboo': 'BambooBoosterCheck',
        'boostPineTree': 'PineTreeBoosterCheck',
        'boostDandelion': 'DandelionBoosterCheck',
        'boostSunflower': 'SunflowerBoosterCheck',
        'boostClover': 'CloverBoosterCheck',
        'boostSpider': 'SpiderBoosterCheck',
        'boostPineapple': 'PineappleBoosterCheck',
        'boostCactus': 'CactusBoosterCheck',
        'boostPumpkin': 'PumpkinBoosterCheck',
        'boostMushroom': 'MushroomBoosterCheck',
        'boostStrawberry': 'StrawberryBoosterCheck',
        'boostRose': 'RoseBoosterCheck',
        'boostPepper': 'PepperBoosterCheck',
        'boostStump': 'StumpBoosterCheck',
        'boostCoconut': 'CoconutBoosterCheck'
    };

    Object.entries(fieldBoosterMap).forEach(([id, ahkKey]) => {
        $(`#${id}`).on('change', function() {
            sendBoostUpdate(ahkKey, this.checked ? 1 : 0);
        });
    });

    // AUTO FIELD BOOST SECTION
    $('#boostAutoFieldBoostActive').on('change', function() {
        sendBoostUpdate('AutoFieldBoostActive', this.checked ? 1 : 0);
    });

    $('#boostAutoFieldBoostRefresh').on('change', function() {
        const value = parseFloat($(this).val()) || 12.5;
        sendBoostUpdate('AutoFieldBoostRefresh', value);
    });

    // Use Dice checkbox
    $('#boostAutoFieldBoostDice').on('change', function() {
        // This might need a custom key or be derived from other settings
        // For now, placeholder
    });

    // Dice hotbar slot
    $('#boostAutoFieldBoostDiceSlot').on('change', function() {
        const value = parseInt($(this).val()) || 6;
        // sendBoostUpdate('AutoFieldBoostDiceSlot', value);
    });

    // Dice limit checkbox
    $('#boostAutoFieldBoostDiceLimit').on('change', function() {
        // Placeholder
    });

    // Dice used limit
    $('#boostAutoFieldBoostDiceMax').on('change', function() {
        const value = parseInt($(this).val()) || 500;
        // sendBoostUpdate('AutoFieldBoostDiceMax', value);
    });

    // Use Glitter checkbox
    $('#boostAutoFieldBoostGlitter').on('change', function() {
        // Placeholder
    });

    // Glitter hotbar slot
    $('#boostAutoFieldBoostGlitterSlot').on('change', function() {
        const value = parseInt($(this).val()) || 7;
        // sendBoostUpdate('AutoFieldBoostGlitterSlot', value);
    });

    // Glitter limit checkbox
    $('#boostAutoFieldBoostGlitterLimit').on('change', function() {
        // Placeholder
    });

    // Glitter used limit
    $('#boostAutoFieldBoostGlitterMax').on('change', function() {
        const value = parseInt($(this).val()) || 100;
        // sendBoostUpdate('AutoFieldBoostGlitterMax', value);
    });

    // Free Field Boosters checkbox
    $('#boostAutoFieldBoostFreeField').on('change', function() {
        // Placeholder
    });

    // Free field boosters limit checkbox
    $('#boostAutoFieldBoostFreeFieldLimit').on('change', function() {
        // Placeholder
    });

    // Free field boosters total hours limit
    $('#boostAutoFieldBoostFreeFieldMax').on('change', function() {
        const value = parseFloat($(this).val()) || 0.01;
        // sendBoostUpdate('AutoFieldBoostFreeFieldMax', value);
    });

    // HOTBAR SLOTS SECTION (Slots 2-7, as slot 1 is not used)
    // These are handled by their own handlers if needed
    // For now, the classic GUI handlers update these separately

    console.log('[init] Boost tab handlers initialized');
}

/**
 * Send Boost setting update to AHK
 * @param {string} key - The AHK setting key
 * @param {any} value - The value to set
 */
function sendBoostUpdate(key, value) {
    // Don't send updates while AHK is updating the UI
    if (suppressBoostSend) {
        return;
    }

    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] boost host not ready');
        return;
    }

    // Ensure value is proper type for JSON serialization
    let jsonValue = value;
    if (typeof value === 'string') {
        // String values stay as strings
        jsonValue = value;
    } else if (typeof value === 'boolean') {
        // Convert boolean to 0/1
        jsonValue = value ? 1 : 0;
    } else if (typeof value === 'number') {
        jsonValue = value;
    } else {
        jsonValue = value || 0;
    }

    console.log('[ahk-send] boost', key, jsonValue, '(type: ' + typeof jsonValue + ')');
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'boost', key: key, value: jsonValue }));
        // attach a no-op rejection handler to prevent unhandled rejection
        if (promise && promise.then) {
            promise.then(
                function() { },
                function(err) { console.warn('[ahk-send] boost:', err); }
            );
        }
    } catch (err) {
        console.warn('[ahk-send] boost error:', err);
    }
}

/**
 * Apply Boost settings from AHK to Web UI
 * Called when AHK sends initial settings or updates
 * 
 * @param {string} key - The AHK setting key
 * @param {any} value - The value to apply
 */
function applyBoostFromAhk(key, value) {
    suppressBoostSend = true;
    console.log('[applyBoostFromAhk] updating', key, '=', value);
    
    try {
        switch (key) {
            // FIELD BOOSTERS
            case 'FieldBooster1':
                $('#boostFieldBooster1').val(denormalizeBoosterValue(value)).trigger('change');
                break;
            case 'FieldBooster2':
                $('#boostFieldBooster2').val(denormalizeBoosterValue(value)).trigger('change');
                break;
            case 'FieldBooster3':
                $('#boostFieldBooster3').val(denormalizeBoosterValue(value)).trigger('change');
                break;

            // BOOSTER MINS
            case 'FieldBoosterMins':
                $('#boostMinsInput').val(value).trigger('change');
                break;

            // BOOST CHASER
            case 'BoostChaserCheck':
                $('#boostGatherInBoostedField').prop('checked', !!value).trigger('change');
                break;

            // FIELD BOOSTER CHECKBOXES
            case 'BlueFlowerBoosterCheck':
                $('#boostBlueFlower').prop('checked', !!value).trigger('change');
                break;
            case 'BambooBoosterCheck':
                $('#boostBamboo').prop('checked', !!value).trigger('change');
                break;
            case 'PineTreeBoosterCheck':
                $('#boostPineTree').prop('checked', !!value).trigger('change');
                break;
            case 'DandelionBoosterCheck':
                $('#boostDandelion').prop('checked', !!value).trigger('change');
                break;
            case 'SunflowerBoosterCheck':
                $('#boostSunflower').prop('checked', !!value).trigger('change');
                break;
            case 'CloverBoosterCheck':
                $('#boostClover').prop('checked', !!value).trigger('change');
                break;
            case 'SpiderBoosterCheck':
                $('#boostSpider').prop('checked', !!value).trigger('change');
                break;
            case 'PineappleBoosterCheck':
                $('#boostPineapple').prop('checked', !!value).trigger('change');
                break;
            case 'CactusBoosterCheck':
                $('#boostCactus').prop('checked', !!value).trigger('change');
                break;
            case 'PumpkinBoosterCheck':
                $('#boostPumpkin').prop('checked', !!value).trigger('change');
                break;
            case 'MushroomBoosterCheck':
                $('#boostMushroom').prop('checked', !!value).trigger('change');
                break;
            case 'StrawberryBoosterCheck':
                $('#boostStrawberry').prop('checked', !!value).trigger('change');
                break;
            case 'RoseBoosterCheck':
                $('#boostRose').prop('checked', !!value).trigger('change');
                break;
            case 'PepperBoosterCheck':
                $('#boostPepper').prop('checked', !!value).trigger('change');
                break;
            case 'StumpBoosterCheck':
                $('#boostStump').prop('checked', !!value).trigger('change');
                break;
            case 'CoconutBoosterCheck':
                $('#boostCoconut').prop('checked', !!value).trigger('change');
                break;

            // AUTO FIELD BOOST
            case 'AutoFieldBoostActive':
                $('#boostAutoFieldBoostActive').prop('checked', !!value).trigger('change');
                break;
            case 'AutoFieldBoostRefresh':
                $('#boostAutoFieldBoostRefresh').val(value).trigger('change');
                break;

            // Hotbar settings handled separately if needed
            default:
                // Check if it's a hotbar-related setting
                if (key.startsWith('HotbarWhile') || key.startsWith('HotbarTime') || key.startsWith('HotbarMax')) {
                    // These might be handled by a separate hotbar handler
                    console.log(`[applyBoostFromAhk] Hotbar setting ${key} not yet mapped to Web UI`);
                }
                break;
        }
    } finally {
        suppressBoostSend = false;
    }
}

/**
 * Normalize booster dropdown value from Web format to AHK format
 * Web: "blueBooster", "redBooster", "mountainBooster", "none"
 * AHK: "Blue", "Red", "Mountain", "None"
 */
function normalizeBoosterValue(webValue) {
    const map = {
        'blueBooster': 'Blue',
        'redBooster': 'Red',
        'mountainBooster': 'Mountain',
        'none': 'None'
    };
    return map[webValue] || 'None';
}

/**
 * Denormalize booster value from AHK format to Web format
 * AHK: "Blue", "Red", "Mountain", "None"
 * Web: "blueBooster", "redBooster", "mountainBooster", "none"
 */
function denormalizeBoosterValue(ahkValue) {
    const map = {
        'Blue': 'blueBooster',
        'Red': 'redBooster',
        'Mountain': 'mountainBooster',
        'None': 'none'
    };
    return map[ahkValue] || 'none';
}

/**
 * Called when page is loaded/reloaded to restore Boost settings from AHK
 * This is triggered by dynamicTabs.js in the message listener
 */
function restoreBoostTabState(payload) {
    if (hasBoostInitApplied) return;
    
    try {
        suppressBoostSend = true;
        
        const data = JSON.parse(payload);
        
        // Apply all boost settings from the payload
        for (const [key, value] of Object.entries(data)) {
            applyBoostFromAhk(key, value);
        }
        
        hasBoostInitApplied = true;
        console.log('[restore] Boost tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Boost tab state:', e.message);
    } finally {
        suppressBoostSend = false;
    }
}

// Export functions for use in dynamicTabs.js
window.boostTabHandlers = {
    initialize: initializeBoostTabHandlers,
    applyFromAhk: applyBoostFromAhk,
    restoreState: restoreBoostTabState,
    send: sendBoostUpdate
};
