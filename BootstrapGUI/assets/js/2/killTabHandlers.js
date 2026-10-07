/**
 * Kill Tab Event Handlers
 * Provides bidirectional sync between Kill tab controls and AHK settings
 * Follows the pattern established in dynamicTabs.js for Gather/Collect tabs
 * 
 * Event Flow:
 * 1. User changes control → change event fires → gatherFields() updates JSON
 * 2. gatherFields() sends WebMessage to AHK
 * 3. AHK processes and stores settings
 * 4. User returns to macro → AHK sends WebUpdateState with kill settings
 * 5. updateValues() sets all controls from payload
 */

// Flag to prevent update loops when restoring state from AHK
let isUpdatingFromAhk = false;
// Flag to prevent sending updates while AHK is updating the UI (suppress send)
let suppressKillSend = false;
// Apply init payload only once to avoid overwriting user changes after first sync
let hasKillInitApplied = false;

// Kill Tab Settings Object Structure
const killTabSettings = {
    bugRun: {
        allowGatherInterrupt: true,
        respawnTime: 0,
        loot: {
            ladybugs: 'Loot',
            rhinoBeetles: 'Loot',
            spider: 'Loot',
            mantis: 'Loot',
            scorpions: 'Loot',
            werewolf: 'Loot'
        }
    },
    stingers: {
        killViciousBee: true,
        onlyDaily: true,
        fields: {
            clover: true,
            spider: true,
            cactus: true,
            rose: true,
            mountainTop: true,
            pepper: true
        }
    },
    bosses: {
        kingBeetle: {
            enabled: true,
            waitBabyLove: true,
            amuletAction: 'Keep Old'
        },
        tunnelBear: {
            enabled: true,
            waitBabyLove: true
        },
        cocoCrab: {
            enabled: true
        },
        commandoChick: {
            enabled: true,
            level: 10,
            hp: 250000,
            time: '5m'
        },
        stumpSnail: {
            enabled: true,
            amuletAction: 'Keep Old',
            hp: 30000000,
            time: '5m'
        }
    }
};

/**
 * Initialize Kill tab event listeners
 * Called on page load and when settings are restored
 */
function initializeKillTabHandlers() {
    // BUG RUN SECTION
    $('#chkKillBugRunGatherInterrupt').on('change', function() {
        sendKillUpdate('KillBugRunGatherInterrupt', this.checked ? 1 : 0);
    });
    $('#inpKillBugRunRespawnTime').on('change', function() {
        sendKillUpdate('KillBugRunRespawnTime', parseInt($(this).val()) || 0);
    });
    $('#btnKillBugRunSelectAll').on('click', function() {
        toggleAllBugRunBugs();
    });

    // Radio button groups for each bug type
    $('input[name="killLadybugs"]').on('change', function() {
        sendKillUpdate('KillLadybugsMode', extractRadioValue('killLadybugs', 'btnKillLadybugs'));
    });
    $('input[name="killRhinoBeetles"]').on('change', function() {
        sendKillUpdate('KillRhinoBeetlesMode', extractRadioValue('killRhinoBeetles', 'btnKillRhinoBeetles'));
    });
    $('input[name="killSpider"]').on('change', function() {
        sendKillUpdate('KillSpiderMode', extractRadioValue('killSpider', 'btnKillSpider'));
    });
    $('input[name="killMantis"]').on('change', function() {
        sendKillUpdate('KillMantisMode', extractRadioValue('killMantis', 'btnKillMantis'));
    });
    $('input[name="killScorpions"]').on('change', function() {
        sendKillUpdate('KillScorpionsMode', extractRadioValue('killScorpions', 'btnKillScorpions'));
    });
    $('input[name="killWerewolf"]').on('change', function() {
        sendKillUpdate('KillWerewolfMode', extractRadioValue('killWerewolf', 'btnKillWerewolf'));
    });

    // STINGERS SECTION
    $('#chkKillViciousBee').on('change', function() {
        sendKillUpdate('KillViciousBeeEnabled', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeOnlyDaily').on('change', function() {
        sendKillUpdate('KillViciousBeeOnlyDaily', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeFieldClover').on('change', function() {
        sendKillUpdate('KillViciousBeeFieldClover', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeFieldSpider').on('change', function() {
        sendKillUpdate('KillViciousBeeFieldSpider', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeFieldCactus').on('change', function() {
        sendKillUpdate('KillViciousBeeFieldCactus', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeFieldRose').on('change', function() {
        sendKillUpdate('KillViciousBeeFieldRose', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeFieldMountainTop').on('change', function() {
        sendKillUpdate('KillViciousBeeFieldMountainTop', this.checked ? 1 : 0);
    });
    $('#chkKillViciousBeeFieldPepper').on('change', function() {
        sendKillUpdate('KillViciousBeeFieldPepper', this.checked ? 1 : 0);
    });

    // BOSSES SECTION - King Beetle
    $('#chkKillKingBeetle').on('change', function() {
        sendKillUpdate('KillKingBeetleEnabled', this.checked ? 1 : 0);
    });
    $('#chkKillKingBeetleWaitBabyLove').on('change', function() {
        sendKillUpdate('KillKingBeetleWaitBabyLove', this.checked ? 1 : 0);
    });
    $('input[name="killKingBeetleAmulet"]').on('change', function() {
        sendKillUpdate('KillKingBeetleAmuletAction', extractRadioValue('killKingBeetleAmulet', 'btnKillKingBeetleAmulet'));
    });

    // BOSSES SECTION - Tunnel Bear
    $('#chkKillTunnelBear').on('change', function() {
        sendKillUpdate('KillTunnelBearEnabled', this.checked ? 1 : 0);
    });
    $('#chkKillTunnelBearWaitBabyLove').on('change', function() {
        sendKillUpdate('KillTunnelBearWaitBabyLove', this.checked ? 1 : 0);
    });

    // BOSSES SECTION - Coco Crab
    $('#chkKillCocoCrab').on('change', function() {
        sendKillUpdate('KillCocoCrabEnabled', this.checked ? 1 : 0);
    });

    // BOSSES SECTION - Commando Chick
    $('#chkKillCommandoChick').on('change', function() {
        sendKillUpdate('KillCommandoChickEnabled', this.checked ? 1 : 0);
    });
    $('#inpKillCommandoChickLevel').on('change', function() {
        sendKillUpdate('KillCommandoChickLevel', parseInt($(this).val()) || 10);
    });
    $('#inpKillCommandoChickHP').on('change', function() {
        sendKillUpdate('KillCommandoChickHP', parseInt($(this).val()) || 250000);
    });
    $('input[name="killCommandoChickTime"]').on('change', function() {
        sendKillUpdate('KillCommandoChickTime', extractRadioValue('killCommandoChickTime', 'btnKillCommandoChickTime'));
    });

    // BOSSES SECTION - Stump Snail
    $('#chkKillStumpSnail').on('change', function() {
        sendKillUpdate('KillStumpSnailEnabled', this.checked ? 1 : 0);
    });
    $('#inpKillStumpSnailHP').on('change', function() {
        sendKillUpdate('KillStumpSnailHP', parseInt($(this).val()) || 30000000);
    });
    $('input[name="killStumpSnailAmulet"]').on('change', function() {
        sendKillUpdate('KillStumpSnailAmuletAction', extractRadioValue('killStumpSnailAmulet', 'btnKillStumpSnailAmulet'));
    });
    $('input[name="killStumpSnailTime"]').on('change', function() {
        sendKillUpdate('KillStumpSnailTime', extractRadioValue('killStumpSnailTime', 'btnKillStumpSnailTime'));
    });

    // Setup parent-child control relationships
    setupParentChildControls();

    console.log('Kill tab handlers initialized');
}

/**
 * Setup parent-child control relationships
 * When a parent checkbox is unchecked, its child controls are disabled (greyed out)
 * When a parent checkbox is checked, its child controls are enabled
 * Note: gatherFields is already attached to parent checkboxes via the change event
 */
function setupParentChildControls() {
    // Define parent-child relationships
    const parentChildRelationships = [
        {
            parent: '#chkKillViciousBee',
            children: ['#chkKillViciousBeeOnlyDaily', '#chkKillViciousBeeFieldClover', '#chkKillViciousBeeFieldSpider', '#chkKillViciousBeeFieldCactus', '#chkKillViciousBeeFieldRose', '#chkKillViciousBeeFieldMountainTop', '#chkKillViciousBeeFieldPepper']
        },
        {
            parent: '#chkKillKingBeetle',
            children: ['#chkKillKingBeetleWaitBabyLove', 'input[name="killKingBeetleAmulet"]']
        },
        {
            parent: '#chkKillTunnelBear',
            children: ['#chkKillTunnelBearWaitBabyLove']
        },
        {
            parent: '#chkKillCommandoChick',
            children: ['#inpKillCommandoChickLevel', '#inpKillCommandoChickHP', 'input[name="killCommandoChickTime"]']
        },
        {
            parent: '#chkKillStumpSnail',
            children: ['#inpKillStumpSnailHP', 'input[name="killStumpSnailAmulet"]', 'input[name="killStumpSnailTime"]']
        }
    ];

    // Attach parent change handlers to toggle child controls
    parentChildRelationships.forEach(function(relationship) {
        const $parent = $(relationship.parent);
        
        // Attach a handler specifically for toggling child visibility (doesn't interfere with gatherFields)
        $parent.on('change', function() {
            toggleChildControls(relationship);
        });

        // Initialize on page load
        toggleChildControls(relationship);
    });
}

/**
 * Toggle child controls based on parent checkbox state
 * @param {object} relationship - { parent: string, children: array<string> }
 */
function toggleChildControls(relationship) {
    const $parent = $(relationship.parent);
    const isParentChecked = $parent.is(':checked');

    relationship.children.forEach(function(childSelector) {
        const $children = $(childSelector);
        
        if (isParentChecked) {
            // Enable children
            $children.prop('disabled', false).removeClass('disabled-control');
            $children.closest('.form-check, .btn-group, .input-group, div[class*="group"]').removeClass('disabled-section');
        } else {
            // Disable children (grey them out but keep values)
            $children.prop('disabled', true).addClass('disabled-control');
            $children.closest('.form-check, .btn-group, .input-group, div[class*="group"]').addClass('disabled-section');
        }
    });
}


/**
 * Send individual Kill setting update to AHK
 * Matches Collect tab pattern: {type: 'kill', key: 'SettingName', value: value}
 * @param {string} key - The setting key (e.g., 'KillKingBeetleEnabled')
 * @param {*} value - The value to set (checkbox: 0/1, text: string, radio: string)
 */
function sendKillUpdate(key, value) {
    // Don't send updates while AHK is updating the UI
    if (suppressKillSend) {
        return;
    }

    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] kill host not ready');
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

    console.log('[ahk-send] kill', key, jsonValue, '(type: ' + typeof jsonValue + ')');
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'kill', key: key, value: jsonValue }));
        // attach a no-op rejection handler to prevent unhandled rejection
        if (promise && promise.then) {
            promise.then(
                function() { },
                function(err) { console.warn('[ahk-send] kill:', err); }
            );
        }
    } catch (err) {
        console.warn('[ahk-send] kill error:', err);
    }
}

/**
 * Helper function to extract radio button value from ID
 * Supports special handling for Kill+Loot which uses KillLoot in the ID
 * 
 * @param {string} radioName - The name attribute of the radio group
 * @param {string} idPrefix - The prefix of the button IDs (e.g., 'btnKillLadybugs')
 * @returns {string} The extracted value (e.g., 'Off', 'Kill', 'Kill+Loot')
 */
function extractRadioValue(radioName, idPrefix) {
    const checkedInput = $('input[name="' + radioName + '"]:checked');
    if (checkedInput.length > 0) {
        const fullId = checkedInput.attr('id');
        // Extract the part after the prefix
        if (fullId && fullId.startsWith(idPrefix)) {
            const value = fullId.substring(idPrefix.length);
            // Special cases for converting ID suffixes to values
            if (value === 'KillLoot') {
                return 'Kill+Loot';
            }
            if (value === 'KeepOld') {
                return 'Keep Old';
            }
            if (value === 'DoNothing') {
                return 'Do Nothing';
            }
            return value || 'Kill+Loot'; // default to Kill+Loot if empty
        }
    }
    return 'Kill+Loot'; // default value
}

/**
 * Toggle all bugs in Bug Run section
 */
function toggleAllBugRunBugs() {
    // Toggle between "all Kill+Loot" or "all Off"
    // Check if all bugs are currently in Kill+Loot mode
    const bugNames = ['Ladybugs', 'RhinoBeetles', 'Spider', 'Mantis', 'Scorpions', 'Werewolf'];
    let allAreKillLoot = true;
    
    bugNames.forEach(bug => {
        const killLootRadio = $(`#btnKill${bug}KillLoot`);
        if (killLootRadio.length === 0 || !killLootRadio.is(':checked')) {
            allAreKillLoot = false;
        }
    });
    
    // If all are Kill+Loot, switch to Off; otherwise switch to Kill+Loot
    const newMode = allAreKillLoot ? 'Off' : 'Kill+Loot';
    
    bugNames.forEach(bug => {
        const radioId = `#btnKill${bug}${newMode === 'Kill+Loot' ? 'KillLoot' : 'Off'}`;
        const radioToSelect = $(radioId);
        if (radioToSelect.length > 0) {
            radioToSelect.prop('checked', true);
            // Trigger change event to send updates
            radioToSelect.trigger('change');
        } else {
            console.warn(`Radio button not found: ${radioId}`);
        }
    });
}

/**
 * Update all Kill tab values from AHK payload
 * Called when WebUpdateState message arrives with killSettings
 * @param {Object} payload - Settings from AHK
 */
function updateKillTabValues(payload) {
    if (!payload) return;

    try {
        // Set flag to prevent gatherFields from running during restore
        isUpdatingFromAhk = true;

        // Helper function to map loot mode values to button ID suffixes
        function getLootModeSuffix(mode) {
            if (mode === "Kill+Loot") return "KillLoot";
            if (mode === "Kill") return "Kill";
            if (mode === "Off") return "Off";
            return "KillLoot"; // default
        }

        // Helper function to map amulet action values to button ID suffixes
        function getAmuletSuffix(action) {
            if (action === "Keep Old") return "KeepOld";
            if (action === "Do Nothing") return "DoNothing";
            return "KeepOld"; // default
        }

        // BUG RUN
        if (payload.bugRun) {
            $('#chkKillBugRunGatherInterrupt').prop('checked', !!payload.bugRun.allowGatherInterrupt);
            $('#inpKillBugRunRespawnTime').val(payload.bugRun.respawnTime || 0);

            // Loot/Kill preferences
            if (payload.bugRun.loot) {
                if (payload.bugRun.loot.ladybugs) {
                    $(`#btnKillLadybugs${getLootModeSuffix(payload.bugRun.loot.ladybugs)}`).prop('checked', true);
                }
                if (payload.bugRun.loot.rhinoBeetles) {
                    $(`#btnKillRhinoBeetles${getLootModeSuffix(payload.bugRun.loot.rhinoBeetles)}`).prop('checked', true);
                }
                if (payload.bugRun.loot.spider) {
                    $(`#btnKillSpider${getLootModeSuffix(payload.bugRun.loot.spider)}`).prop('checked', true);
                }
                if (payload.bugRun.loot.mantis) {
                    $(`#btnKillMantis${getLootModeSuffix(payload.bugRun.loot.mantis)}`).prop('checked', true);
                }
                if (payload.bugRun.loot.scorpions) {
                    $(`#btnKillScorpions${getLootModeSuffix(payload.bugRun.loot.scorpions)}`).prop('checked', true);
                }
                if (payload.bugRun.loot.werewolf) {
                    $(`#btnKillWerewolf${getLootModeSuffix(payload.bugRun.loot.werewolf)}`).prop('checked', true);
                }
            }
        }

        // STINGERS
        if (payload.stingers) {
            $('#chkKillViciousBee').prop('checked', !!payload.stingers.killViciousBee);
            $('#chkKillViciousBeeOnlyDaily').prop('checked', !!payload.stingers.onlyDaily);

            if (payload.stingers.fields) {
                $('#chkKillViciousBeeFieldClover').prop('checked', !!payload.stingers.fields.clover);
                $('#chkKillViciousBeeFieldSpider').prop('checked', !!payload.stingers.fields.spider);
                $('#chkKillViciousBeeFieldCactus').prop('checked', !!payload.stingers.fields.cactus);
                $('#chkKillViciousBeeFieldRose').prop('checked', !!payload.stingers.fields.rose);
                $('#chkKillViciousBeeFieldMountainTop').prop('checked', !!payload.stingers.fields.mountainTop);
                $('#chkKillViciousBeeFieldPepper').prop('checked', !!payload.stingers.fields.pepper);
            }
        }

        // BOSSES
        if (payload.bosses) {
            if (payload.bosses.kingBeetle) {
                $('#chkKillKingBeetle').prop('checked', !!payload.bosses.kingBeetle.enabled);
                $('#chkKillKingBeetleWaitBabyLove').prop('checked', !!payload.bosses.kingBeetle.waitBabyLove);
                if (payload.bosses.kingBeetle.amuletAction) {
                    $(`#btnKillKingBeetleAmulet${getAmuletSuffix(payload.bosses.kingBeetle.amuletAction)}`).prop('checked', true);
                }
            }

            if (payload.bosses.tunnelBear) {
                $('#chkKillTunnelBear').prop('checked', !!payload.bosses.tunnelBear.enabled);
                $('#chkKillTunnelBearWaitBabyLove').prop('checked', !!payload.bosses.tunnelBear.waitBabyLove);
            }

            if (payload.bosses.cocoCrab) {
                $('#chkKillCocoCrab').prop('checked', !!payload.bosses.cocoCrab.enabled);
            }

            if (payload.bosses.commandoChick) {
                $('#chkKillCommandoChick').prop('checked', !!payload.bosses.commandoChick.enabled);
                $('#inpKillCommandoChickLevel').val(payload.bosses.commandoChick.level || 10);
                $('#inpKillCommandoChickHP').val(payload.bosses.commandoChick.hp || 250000);
                if (payload.bosses.commandoChick.time) {
                    $(`#btnKillCommandoChickTime${payload.bosses.commandoChick.time}`).prop('checked', true);
                }
            }

            if (payload.bosses.stumpSnail) {
                $('#chkKillStumpSnail').prop('checked', !!payload.bosses.stumpSnail.enabled);
                $('#inpKillStumpSnailHP').val(payload.bosses.stumpSnail.hp || 30000000);
                if (payload.bosses.stumpSnail.amuletAction) {
                    $(`#btnKillStumpSnailAmulet${getAmuletSuffix(payload.bosses.stumpSnail.amuletAction)}`).prop('checked', true);
                }
                if (payload.bosses.stumpSnail.time) {
                    $(`#btnKillStumpSnailTime${payload.bosses.stumpSnail.time}`).prop('checked', true);
                }
            }
        }

        console.log('Kill tab values updated from AHK');
    } catch (e) {
        console.error('Error updating kill tab values:', e);
    } finally {
        // Reset flag to allow future updates
        isUpdatingFromAhk = false;
    }
}

/**
 * Send data to AHK via WebView2 HostObject
 * Uses the same pattern as Collect tab for consistency
 * @param {string} type - Message type
 * @param {Object} data - Data to send
 */
function sendToAHK(type, data) {
    try {
        // Check if ahkUpdateState host object is available
        if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
            console.warn('[ahk-send] ahkUpdateState host not ready, skipping');
            return;
        }

        const payload = {
            type: type,
            ...data
        };

        const obj = window.chrome.webview.hostObjects.ahkUpdateState;
        const promise = obj.func(JSON.stringify(payload));

        // Attach a no-op rejection handler to prevent unhandled rejection
        if (promise && promise.then) {
            promise.then(
                function() { console.log('[ahk-send] ' + type + ' ok'); },
                function(err) { console.warn('[ahk-send] ' + type + ':', err); }
            );
        }
        console.log('[ahk-send] ' + type, payload);
    } catch (e) {
        console.warn('[ahk-send] error:', e);
    }
}

// Initialize on document ready
$(document).ready(function() {
    // Only initialize if Kill tab is present
    if ($('#sidebar-kill').length > 0) {
        initializeKillTabHandlers();
        setupWebMessageListener();
        console.log('Kill tab handlers ready');
    }
});

/**
 * Setup WebMessage listener for receiving state updates from AHK
 * Handles both init messages (first load) and individual kill field updates (real-time sync)
 */
function setupWebMessageListener() {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function(event) {
            try {
                const message = event.data;
                
                // Parse the message - SendBootstrapState sends JSON strings
                let msg;
                if (typeof message === 'string') {
                    msg = JSON.parse(message);
                } else {
                    msg = message;
                }
                
                // Handle init message (first load with all settings)
                if (msg && msg.type === 'init' && msg.kill) {
                    console.log('[ahk-msg] received init with kill settings');
            
                    // Idempotent: a repeat init (GUI mode toggle) must re-apply the snapshot,
                    // but the one-time control wiring only needs to run once.
                    updateKillTabValues(msg.kill);
                    if (!hasKillInitApplied) {
                        setupParentChildControls();
                        hasKillInitApplied = true;
                    }
                }
                // Handle individual kill field updates (real-time sync)
                else if (msg && msg.type === 'kill') {
                    console.log('[ahk-msg] received kill update:', msg.key, '=', msg.value);
                    applyKillFromAhk(msg.key, msg.value);
                }
            } catch (e) {
                console.warn('[ahk-msg] error processing message:', e);
            }
        });
        console.log('[ahk-msg] listener registered for Kill tab');
    }
}

/**
 * Helper: Convert value string to radio button ID suffix
 * "Kill+Loot" → "KillLoot", "Keep Old" → "KeepOld", "Do Nothing" → "DoNothing"
 */
function getButtonIdSuffix(value) {
    if (value === "Kill+Loot") return "KillLoot";
    if (value === "Keep Old") return "KeepOld";
    if (value === "Do Nothing") return "DoNothing";
    // For other values, remove spaces: "Off" stays "Off", "Kill" stays "Kill"
    return value.replace(/\s/g, '');
}

/**
 * Apply a single Kill setting from AHK to the UI
 * Called when AHK broadcasts a kill field update
 * @param {string} key - The setting key
 * @param {*} value - The value to apply
 */
function applyKillFromAhk(key, value) {
    suppressKillSend = true;
    console.log('[applyKillFromAhk] updating', key, '=', value);
    try {
        // Bug Run settings
        if (key === 'KillBugRunGatherInterrupt') {
            console.log('[applyKillFromAhk] setting KillBugRunGatherInterrupt to', !!value);
            $('#chkKillBugRunGatherInterrupt').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillBugRunRespawnTime') {
            $('#inpKillBugRunRespawnTime').val(value || 0).trigger('change');
        }
        else if (key === 'KillLadybugsMode') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillLadybugs${suffix}`);
            console.log('[applyKillFromAhk] KillLadybugsMode:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        else if (key === 'KillRhinoBeetlesMode') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillRhinoBeetles${suffix}`);
            console.log('[applyKillFromAhk] KillRhinoBeetlesMode:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        else if (key === 'KillSpiderMode') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillSpider${suffix}`);
            console.log('[applyKillFromAhk] KillSpiderMode:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        else if (key === 'KillMantisMode') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillMantis${suffix}`);
            console.log('[applyKillFromAhk] KillMantisMode:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        else if (key === 'KillScorpionsMode') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillScorpions${suffix}`);
            console.log('[applyKillFromAhk] KillScorpionsMode:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        else if (key === 'KillWerewolfMode') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillWerewolf${suffix}`);
            console.log('[applyKillFromAhk] KillWerewolfMode:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        // Stingers settings
        else if (key === 'KillViciousBeeEnabled') {
            $('#chkKillViciousBee').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeOnlyDaily') {
            $('#chkKillViciousBeeOnlyDaily').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeFieldClover') {
            $('#chkKillViciousBeeFieldClover').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeFieldSpider') {
            $('#chkKillViciousBeeFieldSpider').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeFieldCactus') {
            $('#chkKillViciousBeeFieldCactus').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeFieldRose') {
            $('#chkKillViciousBeeFieldRose').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeFieldMountainTop') {
            $('#chkKillViciousBeeFieldMountainTop').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillViciousBeeFieldPepper') {
            $('#chkKillViciousBeeFieldPepper').prop('checked', !!value).trigger('change');
        }
        // Bosses settings - King Beetle
        else if (key === 'KillKingBeetleEnabled') {
            console.log('[applyKillFromAhk] setting KillKingBeetle to', !!value);
            const $el = $('#chkKillKingBeetle');
            console.log('[applyKillFromAhk] found element:', $el.length > 0 ? 'YES' : 'NO (selector not found!)');
            $el.prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillKingBeetleWaitBabyLove') {
            $('#chkKillKingBeetleWaitBabyLove').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillKingBeetleAmuletAction') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillKingBeetleAmulet${suffix}`);
            console.log('[applyKillFromAhk] KillKingBeetleAmuletAction:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        // Bosses settings - Tunnel Bear
        else if (key === 'KillTunnelBearEnabled') {
            $('#chkKillTunnelBear').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillTunnelBearWaitBabyLove') {
            $('#chkKillTunnelBearWaitBabyLove').prop('checked', !!value).trigger('change');
        }
        // Bosses settings - Coco Crab
        else if (key === 'KillCocoCrabEnabled') {
            $('#chkKillCocoCrab').prop('checked', !!value).trigger('change');
        }
        // Bosses settings - Commando Chick
        else if (key === 'KillCommandoChickEnabled') {
            $('#chkKillCommandoChick').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillCommandoChickLevel') {
            $('#inpKillCommandoChickLevel').val(value || 10).trigger('change');
        }
        else if (key === 'KillCommandoChickHP') {
            $('#inpKillCommandoChickHP').val(value || 250000).trigger('change');
        }
        else if (key === 'KillCommandoChickTime') {
            $(`#btnKillCommandoChickTime${value}`).prop('checked', true).trigger('change');
        }
        // Bosses settings - Stump Snail
        else if (key === 'KillStumpSnailEnabled') {
            $('#chkKillStumpSnail').prop('checked', !!value).trigger('change');
        }
        else if (key === 'KillStumpSnailHP') {
            $('#inpKillStumpSnailHP').val(value || 30000000).trigger('change');
        }
        else if (key === 'KillStumpSnailAmuletAction') {
            const suffix = getButtonIdSuffix(value);
            const $btn = $(`#btnKillStumpSnailAmulet${suffix}`);
            console.log('[applyKillFromAhk] KillStumpSnailAmuletAction:', value, 'suffix:', suffix, 'found:', $btn.length > 0);
            $btn.prop('checked', true).trigger('change');
        }
        else if (key === 'KillStumpSnailTime') {
            $(`#btnKillStumpSnailTime${value}`).prop('checked', true).trigger('change');
        }
    } finally {
        suppressKillSend = false;
    }
}
