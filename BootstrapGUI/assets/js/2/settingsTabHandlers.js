/**
 * Settings Tab Event Handlers
 * Mirrors the classic GUI "Settings" tab. Bidirectional sync with AHK.
 *
 * Message type: { type: 'settings', key, value }
 */

let suppressSettingsSend = false;
let hasSettingsInitApplied = false;

// setting key -> { selector, kind: 'check' | 'value' | 'text' | 'radio' }
const SETTINGS_CONTROLS = {
    'AlwaysOnTop':        { sel: '#setAlwaysOnTop', kind: 'check' },
    'GuiTheme':           { sel: '#setGuiTheme', kind: 'value' },
    'GuiTransparency':    { sel: '#setGuiTransparency', kind: 'value' },
    'KeyDelay':           { sel: '#setKeyDelay', kind: 'value' },
    'HiveSlot':           { sel: '#setHiveSlot input[type="radio"]', kind: 'radio' },
    'HiveBees':           { sel: '#setHiveBees', kind: 'value' },
    'ClaimMethod':        { sel: '#setClaimMethod', kind: 'value' },
    'ReconnectMethod':    { sel: '#setReconnectMethod', kind: 'value' },
    'PrivServer':         { sel: '#setPrivServer', kind: 'text' },
    'ReconnectInterval':  { sel: '#setReconnectInterval', kind: 'value' },
    'ReconnectHour':      { sel: '#setReconnectHour', kind: 'value' },
    'ReconnectMin':       { sel: '#setReconnectMin', kind: 'value' },
    'PublicFallback':     { sel: '#setPublicFallback', kind: 'check' },
    'MoveSpeedNum':       { sel: '#setMoveSpeedNum', kind: 'text' },
    'NewWalk':            { sel: '#setNewWalk', kind: 'check' },
    'MoveMethod':         { sel: '#setMoveMethod', kind: 'value' },
    'SprinklerType':      { sel: '#setSprinklerType', kind: 'value' },
    'ConvertBalloon':     { sel: '#setConvertBalloon', kind: 'value' },
    'ConvertMins':        { sel: '#setConvertMins', kind: 'value' },
    'DisableToolUse':     { sel: '#setDisableToolUse', kind: 'check' },
    'ReleaseChannel':     { sel: '#setReleaseChannel', kind: 'value' }
};

function initializeSettingsTabHandlers() {
    Object.keys(SETTINGS_CONTROLS).forEach(function (key) {
        const cfg = SETTINGS_CONTROLS[key];
        $(document).on('change', cfg.sel, function () {
            let value;
            if (cfg.kind === 'check') value = this.checked ? 1 : 0;
            else if (cfg.kind === 'radio') value = parseInt(this.value, 10) || 0;
            else if (cfg.kind === 'value') value = (this.tagName === 'SELECT') ? $(this).val() : (parseFloat($(this).val()) || 0);
            else value = $(this).val();
            sendSettingsUpdate(key, value);
        });
    });

    // action buttons (delegate to AHK via the button-click host object)
    const actionButtons = {
        '#setResetFieldDefaults': 'set-reset-field-defaults',
        '#setResetAll': 'set-reset-all',
        '#setTestReconnect': 'set-test-reconnect'
    };
    Object.keys(actionButtons).forEach(function (sel) {
        $(document).on('click', sel, function () {
            if (window.ahkButtonClick) window.ahkButtonClick({ id: actionButtons[sel] });
        });
    });

    console.log('[init] Settings tab handlers initialized');
}

function sendSettingsUpdate(key, value) {
    if (suppressSettingsSend) return;
    console.log('[ahk-send] settings', key, value);
    window.AhkBridge.updateState('settings', key, value);
}

function applySettingsFromAhk(key, value) {
    const cfg = SETTINGS_CONTROLS[key];
    if (!cfg) { console.log('[applySettingsFromAhk] Unhandled key: ' + key); return; }
    const prev = suppressSettingsSend;
    suppressSettingsSend = true;
    try {
        const $el = $(cfg.sel);
        if (!$el.length) return;
        if (cfg.kind === 'check') {
            $el.prop('checked', !!value);
        } else if (cfg.kind === 'radio') {
            $el.filter('[value="' + value + '"]').prop('checked', true);
        } else if (cfg.kind === 'value' && $el.is('select')) {
            // dynamically add the option if AHK reports a value we don't already have
            if ($el.find('option[value="' + value + '"]').length === 0) {
                $el.append($('<option>').attr('value', value).text(value));
            }
            $el.val(value);
            // bootstrap-select renders a custom button and needs an explicit refresh
            if ($el.hasClass('selectpicker') && $.fn.selectpicker) $el.selectpicker('refresh');
        } else {
            $el.val(value);
        }
    } finally {
        suppressSettingsSend = prev;
    }
}

function restoreSettingsTabState(payload) {
    // Idempotent: a repeat init (GUI mode toggle) must re-apply the snapshot.
    try {
        const data = JSON.parse(payload);
        for (const [key, value] of Object.entries(data)) applySettingsFromAhk(key, value);
        hasSettingsInitApplied = true;
        console.log('[restore] Settings tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Settings tab state:', e.message);
    }
}

function setupSettingsMessageListener() {
    // Transport is handled by the shared bridge module (assets/js/2/bridge.js).
    window.AhkBridge.registerTab('settings', 'settings', {
        applyFromAhk: applySettingsFromAhk,
        restoreState: restoreSettingsTabState
    });
}

$(document).ready(function () {
    if ($('#sidebar-settings').length > 0) {
        initializeSettingsTabHandlers();
        setupSettingsMessageListener();
        console.log('Settings tab handlers ready');
    }
});

window.settingsTabHandlers = {
    initialize: initializeSettingsTabHandlers,
    applyFromAhk: applySettingsFromAhk,
    restoreState: restoreSettingsTabState,
    send: sendSettingsUpdate
};
