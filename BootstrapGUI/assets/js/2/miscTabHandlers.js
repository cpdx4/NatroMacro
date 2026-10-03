/**
 * Misc Tab Event Handlers
 * Mirrors the classic GUI "Misc" tab. The classic tab opened a separate window for
 * each tool; here the tool contents are embedded directly in the tab instead.
 *
 * Message type: { type: 'misc', key, value }
 */

let suppressMiscSend = false;
let hasMiscInitApplied = false;

/* ------------------------------------------------------------------ */
/* maps                                                                */
/* ------------------------------------------------------------------ */

// Launcher button id -> AHK button-click identifier.
// These tools are not settings GUIs (they spawn a helper script or open a link),
// so a button is the only sensible representation.
const MISC_ACTIONS = {
    '#miscBasicEgg':       'misc-basic-egg',
    '#miscBitterberry':    'misc-bitterberry',
    '#miscAutoJelly':      'misc-auto-jelly',
    '#miscBeeList':        'misc-bee-list',
    '#miscTicketCalc':     'misc-ticket-calc',
    '#miscSsaCalc':        'misc-ssa-calc',
    '#miscBondCalc':       'misc-bond-calc',
    '#miscBeequipCalc':    'misc-beequip-calc',
    '#miscOpenLog':        'misc-open-log',
    '#miscCopyLogs':       'misc-copy-logs',
    '#miscResetHotkeys':   'misc-reset-hotkeys',
    '#miscReportBug':      'misc-report-bug',
    '#miscSuggest':        'misc-suggest'
};

// misc setting key -> { sel, kind }
// kind: 'check' | 'int' | 'number' | 'text'
const MISC_CONTROLS = {
    'ShowOnPause':               { sel: '#miscShowOnPause', kind: 'check' },
    'ClickMode':                 { sel: '#miscClickMode', kind: 'check' },
    'ClickCount':                { sel: '#miscClickCount', kind: 'int' },
    'ClickDelay':                { sel: '#miscClickDelay', kind: 'int' },
    'ClickDuration':             { sel: '#miscClickDuration', kind: 'int' },
    'StartHotkey':               { sel: '#miscStartHotkey', kind: 'text' },
    'PauseHotkey':               { sel: '#miscPauseHotkey', kind: 'text' },
    'StopHotkey':                { sel: '#miscStopHotkey', kind: 'text' },
    'AutoClickerHotkey':         { sel: '#miscAutoClickerHotkey', kind: 'text' },
    'TimersHotkey':              { sel: '#miscTimersHotkey', kind: 'text' },
    'DebugHotkey':               { sel: '#miscDebugHotkey', kind: 'text' },
    'DebugLogEnabled':           { sel: '#miscDebugLogEnabled', kind: 'check' },
    'HideErrors':                { sel: '#miscHideErrors', kind: 'check' },
    'AutoStartEnabled':          { sel: '#miscAutoStartEnabled', kind: 'check' },
    'AutoStartDelay':            { sel: '#miscAutoStartDelay', kind: 'int' },
    'NightAnnouncementCheck':    { sel: '#miscNightCheck', kind: 'check' },
    'NightAnnouncementName':     { sel: '#miscNightName', kind: 'text' },
    'NightAnnouncementPingID':   { sel: '#miscNightPingId', kind: 'text' },
    'NightAnnouncementWebhook':  { sel: '#miscNightWebhook', kind: 'text' },
    'WebFPSCount':               { sel: '#miscWebFPS', kind: 'int' },
    'UWPFPSCount':               { sel: '#miscUwpFPS', kind: 'int' }
};

/* ------------------------------------------------------------------ */
/* initialize                                                          */
/* ------------------------------------------------------------------ */

function initializeMiscTabHandlers() {

    // ---- launcher / action buttons ----
    Object.keys(MISC_ACTIONS).forEach(function (sel) {
        $(document).on('click', sel, function () {
            if (window.ahkButtonClick) window.ahkButtonClick({ id: MISC_ACTIONS[sel] });
        });
    });

    // ---- settings controls ----
    Object.keys(MISC_CONTROLS).forEach(function (key) {
        const cfg = MISC_CONTROLS[key];
        $(document).on('change', cfg.sel, function () {
            sendMiscUpdate(key, readControl(cfg, this));
        });
    });

    // Auto-Start needs both values whenever one of them changes.
    $('#miscAutoStartEnabled, #miscAutoStartDelay').on('change', function () {
        updateAutoStartStatus();
    });

    // Night announcement fields are only meaningful while enabled.
    $('#miscNightCheck').on('change', function () {
        setNightAnnouncementEnabled(this.checked);
    });

    setNightAnnouncementEnabled($('#miscNightCheck').prop('checked'));

    console.log('[init] Misc tab handlers initialized');
}

function readControl(cfg, el) {
    const $el = $(el);
    if (cfg.kind === 'check') return el.checked ? 1 : 0;
    if (cfg.kind === 'int') return parseInt($el.val(), 10) || 0;
    if (cfg.kind === 'number') return parseFloat($el.val()) || 0;
    return $el.val();
}

function setNightAnnouncementEnabled(enabled) {
    $('#miscNightName, #miscNightPingId, #miscNightWebhook').prop('disabled', !enabled);
}

function updateAutoStartStatus() {
    const on = $('#miscAutoStartEnabled').prop('checked');
    const delay = parseInt($('#miscAutoStartDelay').val(), 10) || 0;
    let text;
    if (!on) {
        text = 'Not configured.';
    } else if (delay > 0) {
        text = 'Macro will start ' + delay + ' second(s) after login.';
    } else {
        text = 'Macro will start immediately after login.';
    }
    $('#miscAutoStartStatus').text(text);
}

/* ------------------------------------------------------------------ */
/* send to AHK                                                         */
/* ------------------------------------------------------------------ */

function sendMiscUpdate(key, value) {
    if (suppressMiscSend) return;
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] misc host not ready');
        return;
    }
    console.log('[ahk-send] misc', key, value);
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'misc', key: key, value: value }));
        if (promise && promise.then) {
            promise.then(function () { }, function (err) { console.warn('[ahk-send] misc:', err); });
        }
    } catch (err) {
        console.warn('[ahk-send] misc error:', err);
    }
}

/* ------------------------------------------------------------------ */
/* apply from AHK                                                      */
/* ------------------------------------------------------------------ */

function applyMiscFromAhk(key, value) {
    const cfg = MISC_CONTROLS[key];
    if (!cfg) return;
    const prev = suppressMiscSend;
    suppressMiscSend = true;
    try {
        const $el = $(cfg.sel);
        if (!$el.length) return;
        if (cfg.kind === 'check') {
            $el.prop('checked', !!value);
        } else {
            $el.val(value);
        }
        if (key === 'AutoStartEnabled' || key === 'AutoStartDelay') updateAutoStartStatus();
        if (key === 'NightAnnouncementCheck') setNightAnnouncementEnabled(!!value);
    } finally {
        suppressMiscSend = prev;
    }
}

function restoreMiscTabState(payload) {
    if (hasMiscInitApplied) return;
    try {
        const data = JSON.parse(payload);
        for (const [key, value] of Object.entries(data)) applyMiscFromAhk(key, value);
        hasMiscInitApplied = true;
        console.log('[restore] Misc tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Misc tab state:', e.message);
    }
}

function setupMiscMessageListener() {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            try {
                const message = event.data;
                const msg = (typeof message === 'string') ? JSON.parse(message) : message;
                if (msg && msg.type === 'init' && msg.misc && !hasMiscInitApplied) {
                    restoreMiscTabState(JSON.stringify(msg.misc));
                } else if (msg && msg.type === 'misc') {
                    applyMiscFromAhk(msg.key, msg.value);
                }
            } catch (e) {
                console.warn('[ahk-msg] error processing misc message:', e);
            }
        });
    }
}

$(document).ready(function () {
    if ($('#sidebar-misc').length > 0) {
        initializeMiscTabHandlers();
        setupMiscMessageListener();
        console.log('Misc tab handlers ready');
    }
});

window.miscTabHandlers = {
    initialize: initializeMiscTabHandlers,
    applyFromAhk: applyMiscFromAhk,
    restoreState: restoreMiscTabState,
    send: sendMiscUpdate
};
