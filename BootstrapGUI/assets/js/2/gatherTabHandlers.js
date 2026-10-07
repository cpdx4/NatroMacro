/**
 * Gather Tab Event Handlers
 *
 * The Gather tab is dynamic (one tab per configured field). Per-tab control
 * binding + sending is done in dynamicTabs.js (bindGatherTabControls /
 * sendGatherFieldToAhk). This module only APPLIES classic GUI changes coming
 * from AHK (init snapshot + live poll) to the matching gather tab.
 *
 * Core Collect keys (Mondo/Ant/Clock/dispensers...) are owned by dynamicTabs.js.
 */

let suppressGatherSend = false;
let hasGatherInitApplied = false;

function initializeGatherTabHandlers() {
    // Nothing to bind here; controls are created dynamically by dynamicTabs.js
    console.log('[init] Gather tab handlers initialized');
}

function sendGatherUpdate(key, value) {
    if (suppressGatherSend) return;
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) return;
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var p = obj.func(JSON.stringify({ type: 'gather', key: key, value: value }));
        if (p && p.then) p.then(function () { }, function (e) { console.warn('[ahk-send] gather:', e); });
    } catch (e) { console.warn('[ahk-send] gather error:', e); }
}

function applyGatherFromAhk(key, value) {
    const prev = suppressGatherSend;
    suppressGatherSend = true;
    try {
        let m;
        // AHK stores fields by number (FieldName1..3) but the web numbers its tabs by
        // position; translate. A missing tab (number 0) means the field isn't shown.
        const tab = function (num) {
            const n = window.gatherTabNumberForFieldNum ? window.gatherTabNumberForFieldNum(num) : parseInt(num, 10);
            return n || 0;
        };
        if ((m = /^FieldName([123])$/.exec(key))) {
            window.gatherFieldNames[m[1]] = value;
            if (window.rebuildGatherTabs) window.rebuildGatherTabs();
        } else if ((m = /^FieldPattern([123])$/.exec(key))) {
            // Select by option index (via the shared helper): the pattern <option>s carry
            // duplicate `value` attributes, so `.val()` would land on the wrong pattern.
            const $s = $('#pattern-tab-' + tab(m[1]));
            if (window.setSelectByText) window.setSelectByText($s, value);
            else $s.find('option').each(function () { if ($(this).text().trim().toLowerCase() === String(value).trim().toLowerCase()) { $s.prop('selectedIndex', $(this).index()); return false; } });
        } else if ((m = /^FieldPatternReps([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) { $('#width-number-tab-' + n).val(value); $('#width-slider-tab-' + n).val(value); }
        } else if ((m = /^FieldPatternSize([123])$/.exec(key))) {
            const mapN = { XS: 1, S: 2, M: 3, L: 4, XL: 5 }; const v = mapN[value] || value;
            const n = tab(m[1]); if (n) { $('#length-number-tab-' + n).val(v); $('#length-slider-tab-' + n).val(v); }
        } else if ((m = /^FieldPatternInvertLR([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#invert-left-right-tab-' + n).prop('checked', !!value);
        } else if ((m = /^FieldPatternInvertFB([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#invert-fwd-back-tab-' + n).prop('checked', !!value);
        } else if ((m = /^FieldDriftCheck([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#drift-tab-' + n).prop('checked', !!value);
        } else if ((m = /^FieldPatternShift([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#shift-tab-' + n).prop('checked', !!value);
        } else if ((m = /^FieldRotateTimes([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#rotate-number-tab-' + n).val(value);
        } else if ((m = /^FieldUntilMins([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#mins-tab-' + n).val(value);
        } else if ((m = /^FieldUntilPack([123])$/.exec(key))) {
            const n = tab(m[1]); if (n) $('#pack-tab-' + n).val(value);
        } else if ((m = /^FieldReturnType([123])$/.exec(key))) {
            const $s = $('#return-tab-' + tab(m[1]));
            if (window.setSelectByText) window.setSelectByText($s, value);
            else $s.find('option').each(function () { if ($(this).text().trim().toLowerCase() === String(value).trim().toLowerCase()) { $s.prop('selectedIndex', $(this).index()); return false; } });
        } else if ((m = /^FieldSprinklerLoc([123])$/.exec(key))) {
            // Classic "Sprinkler" location changed -> move the web map marker to match.
            const st = window.gatherSprinklerState = window.gatherSprinklerState || {};
            const rec = st[m[1]] = st[m[1]] || {};
            rec.loc = value;
            if (window.applySprinklerLocDist) window.applySprinklerLocDist(m[1]);
        } else if ((m = /^FieldSprinklerDist([123])$/.exec(key))) {
            // Classic sprinkler distance changed -> move the web map marker to match.
            const st = window.gatherSprinklerState = window.gatherSprinklerState || {};
            const rec = st[m[1]] = st[m[1]] || {};
            rec.dist = value;
            if (window.applySprinklerLocDist) window.applySprinklerLocDist(m[1]);
        } else if (/^CurrentFieldNum$/.test(key)) {
            // not represented in the web GUI
        } else {
            console.log('[applyGatherFromAhk] Unhandled key: ' + key);
        }
    } finally {
        suppressGatherSend = prev;
    }
}

function restoreGatherTabState(payload) {
    // Idempotent: a repeat init (GUI mode toggle) must re-apply the snapshot.
    try {
        const data = JSON.parse(payload);
        for (const [key, value] of Object.entries(data)) applyGatherFromAhk(key, value);
        hasGatherInitApplied = true;
        console.log('[restore] Gather tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Gather tab state:', e.message);
    }
}

function setupGatherMessageListener() {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            try {
                const message = event.data;
                const msg = (typeof message === 'string') ? JSON.parse(message) : message;
                if (msg && msg.type === 'init' && msg.gatherSettings) {
                    restoreGatherTabState(JSON.stringify(msg.gatherSettings));
                } else if (msg && msg.type === 'gather') {
                    applyGatherFromAhk(msg.key, msg.value);
                }
            } catch (e) {
                console.warn('[ahk-msg] error processing gather message:', e);
            }
        });
    }
}

$(document).ready(function () {
    if ($('#sidebar-gather').length > 0) {
        initializeGatherTabHandlers();
        setupGatherMessageListener();
        console.log('Gather tab handlers ready');
    }
});

window.gatherTabHandlers = {
    initialize: initializeGatherTabHandlers,
    applyFromAhk: applyGatherFromAhk,
    restoreState: restoreGatherTabState,
    send: sendGatherUpdate
};
