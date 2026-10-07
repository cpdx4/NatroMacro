/**
 * Collect Tab Event Handlers
 * Bidirectional sync between the Collect tab extras (Blender, Wind Shrine,
 * Beesmas items, Memory Match) and the AHK (classic GUI) settings.
 *
 * Message type: { type: 'collect', key, value }
 * NOTE: Mondo / Ant / Dispenser checkboxes are handled in dynamicTabs.js.
 *
 * IMPORTANT: this file used to re-declare `let suppressCollectSend` and the
 * functions `sendCollectUpdate` / `applyCollectFromAhk`, which already exist in
 * dynamicTabs.js. Classic <script> tags share one global lexical scope, so the
 * duplicate `let` threw "Identifier has already been declared" and the WHOLE
 * file failed to load — which is why Blender / Wind Shrine / Beesmas / Memory
 * Match / Sticker Printer never synced in either direction.
 * All declarations here are now uniquely named.
 */

let suppressCollectExtraSend = false;
let hasCollectInitApplied = false;

/* ------------------------------------------------------------------ */
/* Control tables                                                      */
/* ------------------------------------------------------------------ */

// Blender slots (see index.html Blender card)
const BLENDER_SLOTS = [
    { slot: 1, enable: '#formCheck-25', item: 'select[name="collSel_blender1"]',           qty: '#inputMondoSeconds-5', repeat: '#inputMondoSeconds-6', infinite: '#formCheck-30' },
    { slot: 2, enable: '#formCheck-26', item: 'select[name="collSel_collectBlenderSlot2"]', qty: '#inputMondoSeconds-3', repeat: '#inputMondoSeconds-4', infinite: '#formCheck-29' },
    { slot: 3, enable: '#formCheck-27', item: 'select[name="collSel_collectBlenderSlot3"]', qty: '#inputMondoSeconds-1', repeat: '#inputMondoSeconds-2', infinite: '#formCheck-28' }
];

// Wind Shrine slots (the Wind Shrine card lives on the Boost tab in the web UI)
const SHRINE_SLOTS = [
    { slot: 1, enable: '#formCheck-72', item: 'select[name="collSel_blender1_1"]', qty: '#inputMondoSeconds-31', repeat: '#inputMondoSeconds-32', infinite: '#formCheck-73' },
    { slot: 2, enable: '#formCheck-74', item: 'select[name="collSel_blender1_2"]', qty: '#inputMondoSeconds-33', repeat: '#inputMondoSeconds-34', infinite: '#formCheck-75' }
];

// Beesmas item checkboxes -> AHK setting key
const BEESMAS_MAP = {
    '#formCheck-50': 'BeesmasGatherInterruptCheck',
    '#formCheck-6':  'StockingsCheck',
    '#formCheck-15': 'WreathCheck',
    '#formCheck-16': 'FeastCheck',
    '#formCheck-17': 'RBPDelevelCheck',
    '#formCheck-18': 'GingerbreadCheck',
    '#formCheck-19': 'SnowMachineCheck',
    '#formCheck-20': 'CandlesCheck',
    '#formCheck-21': 'SamovarCheck',
    '#formCheck-22': 'LidArtCheck',
    '#formCheck-23': 'GummyBeaconCheck'
};

// Memory match checkboxes -> AHK setting key
const MEMORY_MATCH_MAP = {
    '#formCheck-32': 'NormalMemoryMatchCheck',
    '#formCheck-33': 'MegaMemoryMatchCheck',
    '#formCheck-36': 'ExtremeMemoryMatchCheck'
};

// Extra keys that belong to the Collect section but are shown on other web tabs
// (currently the Boost tab's Stickers card) and are handled by boostTabHandlers.
function isBoostTabKey(key) {
    return /^Sticker/.test(key);
}

/* ------------------------------------------------------------------ */
/* initialize                                                          */
/* ------------------------------------------------------------------ */

function initializeCollectTabHandlers() {

    // ---- Blender ----
    // Any change to a slot pushes the COMPLETE slot state (item + amount + repeat),
    // so the classic GUI always gets enough to draw the ingredient icon *and* the
    // "(amount) [repeat]" line — not just whichever control happened to change.
    BLENDER_SLOTS.forEach(function (cfg) {
        const pushSlot = function () { sendBlenderSlot(cfg.slot); };
        $(document).on('change', cfg.enable, function () {
            if (this.checked) {
                const $sel = $(cfg.item);
                if (!$sel.val()) setSelectValue(cfg.item, firstOptionValue($sel));
            }
            pushSlot();
        });
        // Picking an ingredient enables the slot automatically (the same behaviour the
        // Wind Shrine card has), so the classic GUI immediately shows the icon and the
        // "(amount) [repeat]" line without the user having to flip "Enable Slot N".
        const onItemPicked = function () {
            const val = $(cfg.item).val();
            if (val && String(val).toLowerCase() !== 'none') $(cfg.enable).prop('checked', true);
            pushSlot();
        };
        $(document).on('change', cfg.item, onItemPicked);
        // bootstrap-select renders a custom dropdown; make sure its own event is
        // caught too (some builds only emit `changed.bs.select`).
        $(document).on('changed.bs.select', cfg.item, onItemPicked);
        $(document).on('change', cfg.qty, pushSlot);
        $(document).on('change', cfg.repeat, pushSlot);
        $(document).on('change', cfg.infinite, pushSlot);
    });

    // Safety net: bootstrap-select (and the odd widget) can swallow events, so we
    // also poll the Blender slots and push whenever their *observable* state changes.
    // This guarantees a web edit reaches the classic GUI regardless of how the
    // control was driven. (Values applied FROM AHK are suppressed, so no echo loop.)
    if ($(BLENDER_SLOTS[0].enable).length) {
        const lastSig = {};
        setInterval(function () {
            BLENDER_SLOTS.forEach(function (cfg) {
                const sig = [
                    $(cfg.enable).prop('checked') ? 1 : 0,
                    $(cfg.item).val() || '',
                    $(cfg.qty).val() || '',
                    $(cfg.repeat).val() || '',
                    $(cfg.infinite).prop('checked') ? 1 : 0
                ].join('|');
                const k = 's' + cfg.slot;
                if (lastSig[k] === undefined) { lastSig[k] = sig; return; } // first observation
                if (lastSig[k] === sig) return;
                lastSig[k] = sig;
                sendBlenderSlot(cfg.slot);
            });
        }, 600);
    }

    // ---- Wind Shrine ----
    SHRINE_SLOTS.forEach(function (cfg) {
        // "Enable Slot" toggle maps onto ShrineItem being "None" or a real item.
        $(document).on('change', cfg.enable, function () {
            if (this.checked) {
                const $sel = $(cfg.item);
                if (!$sel.val()) setSelectValue(cfg.item, firstOptionValue($sel));
                sendCollectExtraUpdate('ShrineItem' + cfg.slot, $sel.val() || 'None');
            } else {
                sendCollectExtraUpdate('ShrineItem' + cfg.slot, 'None');
            }
        });
        $(document).on('change', cfg.item, function () {
            sendCollectExtraUpdate('ShrineItem' + cfg.slot, $(this).val() || 'None');
        });
        $(document).on('change', cfg.qty, function () {
            sendCollectExtraUpdate('ShrineAmount' + cfg.slot, parseInt($(this).val(), 10) || 0);
        });
        $(document).on('change', cfg.repeat, function () {
            sendCollectExtraUpdate('ShrineIndex' + cfg.slot, parseInt($(this).val(), 10) || 0);
        });
        $(document).on('change', cfg.infinite, function () {
            if (this.checked) {
                sendCollectExtraUpdate('ShrineIndex' + cfg.slot, 'Infinite');
            } else {
                sendCollectExtraUpdate('ShrineIndex' + cfg.slot, parseInt($(cfg.repeat).val(), 10) || 0);
            }
        });
    });

    // ---- Beesmas ----
    Object.keys(BEESMAS_MAP).forEach(function (sel) {
        $(document).on('change', sel, function () {
            sendCollectExtraUpdate(BEESMAS_MAP[sel], this.checked ? 1 : 0);
        });
    });

    // ---- Memory match ----
    Object.keys(MEMORY_MATCH_MAP).forEach(function (sel) {
        $(document).on('change', sel, function () {
            sendCollectExtraUpdate(MEMORY_MATCH_MAP[sel], this.checked ? 1 : 0);
        });
    });

    // ---- Mondo seconds ----
    $('#inputMondoSeconds').on('change', function () {
        sendCollectExtraUpdate('MondoSecs', parseInt($(this).val(), 10) || 0);
    });

    // ---- Ant action + use tickets ----
    $('input[name="btnAntPassChallenge"]').on('change', function () {
        if (!this.checked) return;
        sendCollectExtraUpdate('AntPassAction', this.id === 'btnAntChallenge' ? 'Challenge' : 'Pass');
    });
    $('#formCheck-5').on('change', function () {
        sendCollectExtraUpdate('AntPassBuyCheck', this.checked ? 1 : 0);
    });

    if ($.fn.selectpicker) $('.selectpicker').selectpicker();

    console.log('[init] Collect tab handlers initialized');
}

// Send the complete state of one Blender slot to AHK (item + amount + repeat).
// `item` is forced to "None" when the slot is disabled, mirroring the classic GUI.
function sendBlenderSlot(slot) {
    const cfg = BLENDER_SLOTS[slot - 1];
    if (!cfg) return;
    const enabled = $(cfg.enable).prop('checked');
    const item = enabled ? ($(cfg.item).val() || 'None') : 'None';
    const infinite = $(cfg.infinite).prop('checked');
    const amount = parseInt($(cfg.qty).val(), 10) || 0;
    const index = infinite ? 'Infinite' : (parseInt($(cfg.repeat).val(), 10) || 0);
    sendCollectExtraUpdate('BlenderItem' + slot, item);
    sendCollectExtraUpdate('BlenderAmount' + slot, amount);
    sendCollectExtraUpdate('BlenderIndex' + slot, index);
}

function firstOptionValue($sel) {
    const v = $sel.find('option').first().val();
    return v || '';
}

/* ------------------------------------------------------------------ */
/* send to AHK                                                         */
/* ------------------------------------------------------------------ */

function sendCollectExtraUpdate(key, value) {
    if (suppressCollectExtraSend) return;
    console.log('[ahk-send] collect', key, value);
    // Transport is handled by the shared bridge module (assets/js/2/bridge.js).
    window.AhkBridge.updateState('collect', key, value);
}

/* ------------------------------------------------------------------ */
/* apply from AHK                                                      */
/* ------------------------------------------------------------------ */

function setSelectValue(selector, value) {
    const $el = $(selector);
    if (!$el.length) return;
    $el.val(value);
    if ($el.hasClass('selectpicker') && $.fn.selectpicker) $el.selectpicker('refresh');
}

function applyCollectExtraFromAhk(key, value) {
    // Sticker Printer / Sticker Stack controls live on the web Boost tab.
    if (isBoostTabKey(key) && window.boostTabHandlers && window.boostTabHandlers.applyFromAhk) {
        window.boostTabHandlers.applyFromAhk(key, value);
        return;
    }

    const prev = suppressCollectExtraSend;
    suppressCollectExtraSend = true;
    try {
        let m;

        // Mondo seconds
        if (key === 'MondoSecs') { $('#inputMondoSeconds').val(value); return; }
        // Ant action / use tickets
        if (key === 'AntPassAction') {
            $('input[name="btnAntPassChallenge"]').prop('checked', false);
            $('#' + (value === 'Challenge' ? 'btnAntChallenge' : 'btnAntPass')).prop('checked', true);
            return;
        }
        if (key === 'AntPassBuyCheck') { $('#formCheck-5').prop('checked', !!value); return; }

        // Blender / Shrine families
        if ((m = /^BlenderItem([123])$/.exec(key))) {
            const cfg = BLENDER_SLOTS[parseInt(m[1], 10) - 1];
            const disabled = (!value || String(value).toLowerCase() === 'none');
            $(cfg.enable).prop('checked', !disabled);
            if (!disabled) setSelectValue(cfg.item, String(value).toLowerCase());
        } else if ((m = /^BlenderAmount([123])$/.exec(key))) {
            $(BLENDER_SLOTS[parseInt(m[1], 10) - 1].qty).val(value);
        } else if ((m = /^BlenderIndex([123])$/.exec(key))) {
            const cfg = BLENDER_SLOTS[parseInt(m[1], 10) - 1];
            const inf = (value === 'Infinite' || value === '∞');
            $(cfg.infinite).prop('checked', inf);
            $(cfg.repeat).prop('disabled', inf);
            if (!inf) $(cfg.repeat).val(value);
        } else if ((m = /^ShrineItem([12])$/.exec(key))) {
            const cfg = SHRINE_SLOTS[parseInt(m[1], 10) - 1];
            const disabled = (!value || String(value).toLowerCase() === 'none');
            $(cfg.enable).prop('checked', !disabled);
            if (!disabled) setSelectValue(cfg.item, String(value).toLowerCase());
        } else if ((m = /^ShrineAmount([12])$/.exec(key))) {
            $(SHRINE_SLOTS[parseInt(m[1], 10) - 1].qty).val(value);
        } else if ((m = /^ShrineIndex([12])$/.exec(key))) {
            const cfg = SHRINE_SLOTS[parseInt(m[1], 10) - 1];
            const inf = (value === 'Infinite' || value === '∞');
            $(cfg.infinite).prop('checked', inf);
            $(cfg.repeat).prop('disabled', inf);
            if (!inf) $(cfg.repeat).val(value);
        } else {
            // Beesmas / Memory Match
            let handled = false;
            Object.keys(BEESMAS_MAP).forEach(function (sel) {
                if (BEESMAS_MAP[sel] === key) { $(sel).prop('checked', !!value); handled = true; }
            });
            if (!handled) {
                Object.keys(MEMORY_MATCH_MAP).forEach(function (sel) {
                    if (MEMORY_MATCH_MAP[sel] === key) { $(sel).prop('checked', !!value); handled = true; }
                });
            }
            // Unknown keys belong to the core Collect snapshot, which dynamicTabs
            // applies itself — don't spam the log for those.
            if (!handled && /^(Blender|Shrine|Mondo|Ant)/.test(key))
                console.log('[applyCollectExtraFromAhk] Unhandled key: ' + key);
        }
    } finally {
        suppressCollectExtraSend = prev;
    }
}

function restoreCollectTabState(payload) {
    // Idempotent: a repeat init (GUI mode toggle) must re-apply the snapshot.
    try {
        const data = JSON.parse(payload);
        for (const [key, value] of Object.entries(data)) applyCollectExtraFromAhk(key, value);
        hasCollectInitApplied = true;
        console.log('[restore] Collect tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Collect tab state:', e.message);
    }
}

window.collectTabHandlers = {
    initialize: initializeCollectTabHandlers,
    applyFromAhk: applyCollectExtraFromAhk,
    restoreState: restoreCollectTabState,
    send: sendCollectExtraUpdate
};
