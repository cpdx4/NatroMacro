/**
 * Boost Tab Event Handlers
 * Bidirectional sync for field boosters, auto field boost, hotbar slots and stickers.
 *
 * Message type: { type: 'boost', key, value }
 */

let suppressBoostSend = false;
let hasBoostInitApplied = false;

/* ------------------------------------------------------------------ */
/* maps                                                                */
/* ------------------------------------------------------------------ */

const HOTBAR_WEB_TO_AHK = { 'never': 'Never', 'always': 'Always', 'athive': 'At Hive', 'gathering': 'Gathering', 'attacking': 'Attacking', 'microconverter': 'Microconverter', 'whirligig': 'Whirligig', 'enzymes': 'Enzymes', 'gatherstart': 'GatherStart', 'snowflake': 'Snowflake' };
const HOTBAR_AHK_TO_WEB = { 'Never': 'never', 'Always': 'always', 'At Hive': 'athive', 'Gathering': 'gathering', 'Attacking': 'attacking', 'Microconverter': 'microconverter', 'Whirligig': 'whirligig', 'Enzymes': 'enzymes', 'GatherStart': 'gatherstart', 'Snowflake': 'snowflake' };
const SPRINKLER_WEB_TO_AHK = { 'none': 'None', 'basic': 'Basic', 'silver': 'Silver', 'golden': 'Golden', 'diamond': 'Diamond', 'supreme': 'Supreme' };
const SPRINKLER_AHK_TO_WEB = { 'None': 'none', 'Basic': 'basic', 'Silver': 'silver', 'Golden': 'golden', 'Diamond': 'diamond', 'Supreme': 'supreme' };

const HOTBAR_TIME_INPUTS = {
    2: ['#inputMondoSeconds-18', '#inputMondoSeconds-20'], 3: ['#inputMondoSeconds-21', '#inputMondoSeconds-22'],
    4: ['#inputMondoSeconds-23', '#inputMondoSeconds-24'], 5: ['#inputMondoSeconds-25', '#inputMondoSeconds-26'],
    6: ['#inputMondoSeconds-27', '#inputMondoSeconds-28'], 7: ['#inputMondoSeconds-29', '#inputMondoSeconds-30']
};

const FIELD_BOOSTER_MAP = {
    'boostBlueFlower': 'BlueFlowerBoosterCheck', 'boostBamboo': 'BambooBoosterCheck',
    'boostPineTree': 'PineTreeBoosterCheck', 'boostDandelion': 'DandelionBoosterCheck',
    'boostSunflower': 'SunflowerBoosterCheck', 'boostClover': 'CloverBoosterCheck',
    'boostSpider': 'SpiderBoosterCheck', 'boostPineapple': 'PineappleBoosterCheck',
    'boostCactus': 'CactusBoosterCheck', 'boostPumpkin': 'PumpkinBoosterCheck',
    'boostMushroom': 'MushroomBoosterCheck', 'boostStrawberry': 'StrawberryBoosterCheck',
    'boostRose': 'RoseBoosterCheck', 'boostPepper': 'PepperBoosterCheck',
    'boostStump': 'StumpBoosterCheck', 'boostCoconut': 'CoconutBoosterCheck'
};

// Auto Field Boost detail controls
const AFB_MAP = {
    '#formCheck-66': ['AFBDiceEnable', 'check'],
    '#inputMondoSeconds-14': ['AFBDiceHotbar', 'value'],
    '#formCheck-67': ['AFBDiceLimitEnable', 'check'],
    '#inputMondoSeconds-15': ['AFBDiceLimit', 'value'],
    '#formCheck-68': ['AFBGlitterEnable', 'check'],
    '#inputMondoSeconds-16': ['AFBGlitterHotbar', 'value'],
    '#formCheck-69': ['AFBGlitterLimitEnable', 'check'],
    '#inputMondoSeconds-17': ['AFBGlitterLimit', 'value'],
    '#formCheck-70': ['AFBFieldEnable', 'check'],
    '#formCheck-71': ['AFBHoursLimitEnable', 'check'],
    '#inputMondoSeconds-19': ['AFBHoursLimit', 'value']
};

function boosterToAhk(v) { return { 'blueBooster': 'Blue', 'redBooster': 'Red', 'mountainBooster': 'Mountain', 'none': 'None' }[v] || 'None'; }
function boosterToWeb(v) { return { 'Blue': 'blueBooster', 'Red': 'redBooster', 'Mountain': 'mountainBooster', 'None': 'none' }[v] || 'none'; }
function invert(mapObj) {
    const out = {};
    Object.keys(mapObj).forEach(function (k) { out[mapObj[k]] = k; });
    return out;
}
const FIELD_KEY_TO_SEL = invert(FIELD_BOOSTER_MAP);
const AFB_KEY_TO_SEL = (function () {
    const out = {};
    Object.keys(AFB_MAP).forEach(function (k) { out[AFB_MAP[k][0]] = k; });
    return out;
})();

/* ------------------------------------------------------------------ */
/* initialize                                                          */
/* ------------------------------------------------------------------ */

function initializeBoostTabHandlers() {
    ['1', '2', '3'].forEach(function (n) {
        $('#boostFieldBooster' + n).on('change', function () { sendBoostUpdate('FieldBooster' + n, boosterToAhk($(this).val())); });
    });
    $('#boostMinsInput').on('change', function () { sendBoostUpdate('FieldBoosterMins', parseInt($(this).val(), 10) || 0); });
    $('#boostGatherInBoostedField').on('change', function () { sendBoostUpdate('BoostChaserCheck', this.checked ? 1 : 0); });

    Object.keys(FIELD_BOOSTER_MAP).forEach(function (id) {
        $('#' + id).on('change', function () { sendBoostUpdate(FIELD_BOOSTER_MAP[id], this.checked ? 1 : 0); });
    });

    $('#boostAutoFieldBoostActive, #boostAutoFieldBoostActiveLabel').on('change', function () {
        sendBoostUpdate('AutoFieldBoostActive', this.checked ? 1 : 0);
    });
    $('#boostAutoFieldBoostRefresh').on('change', function () { sendBoostUpdate('AutoFieldBoostRefresh', parseFloat($(this).val()) || 12.5); });

    // Auto Field Boost details
    Object.keys(AFB_MAP).forEach(function (sel) {
        const def = AFB_MAP[sel];
        $(sel).on('change', function () {
            sendBoostUpdate(def[0], def[1] === 'check' ? (this.checked ? 1 : 0) : (parseFloat($(this).val()) || 0));
        });
    });

    // Hotbar slot 1 = sprinkler type
    $('#boostHotbarSlot1').on('change', function () { sendBoostUpdate('SprinklerType', SPRINKLER_WEB_TO_AHK[$(this).val()] || 'None'); });

    for (let slot = 2; slot <= 7; slot++) {
        (function (n) {
            $('#boostHotbarSlot' + n).on('change', function () {
                sendBoostUpdate('HotbarWhile' + n, HOTBAR_WEB_TO_AHK[$(this).val()] || 'Never');
                refreshHotbarSlotUi(n);
            });
        })(slot);
    }
    refreshAllHotbarSlots();
    Object.keys(HOTBAR_TIME_INPUTS).forEach(function (slot) {
        const inputs = HOTBAR_TIME_INPUTS[slot];
        $(inputs[0] + ', ' + inputs[1]).on('change', function () {
            const h = parseInt($(inputs[0]).val(), 10) || 0;
            const m = parseInt($(inputs[1]).val(), 10) || 0;
            sendBoostUpdate('HotbarTime' + slot, (h * 3600) + (m * 60));
        });
    });

    // ---- Stickers ----
    $('#formCheck-76').on('change', function () { sendBoostUpdate('StickerStackCheck', this.checked ? 1 : 0); });
    $('input[name="btnStickerTimer"]').on('change', function () {
        if (this.checked) sendBoostUpdate('StickerStackMode', this.id === 'btnMondoActionKill-4' ? 1 : 0);
    });
    $('#inputMondoSeconds-35, #inputMondoSeconds-36').on('change', function () {
        const h = parseInt($('#inputMondoSeconds-35').val(), 10) || 0;
        const m = parseInt($('#inputMondoSeconds-36').val(), 10) || 0;
        sendBoostUpdate('StickerStackTimer', (h * 3600) + (m * 60));
    });
    $('input[name="btnMondoLoot1"]').on('change', function () {
        if (!this.checked) return;
        const v = this.id === 'ladybugsKill-16' ? 'Sticker' : (this.id === 'ladybugsKill-17' ? 'Both' : 'Tickets');
        sendBoostUpdate('StickerStackItem', v);
    });
    $('input[name="btnMondoLoot2"]').on('change', function () {
        if (!this.checked) return;
        const hive = (this.id === 'ladybugsKill-18' || this.id === 'ladybugsKill-20') ? 1 : 0;
        const cub = (this.id === 'ladybugsKill-19' || this.id === 'ladybugsKill-20') ? 1 : 0;
        const voucher = (this.id === 'ladybugsKill-20') ? 1 : 0;
        sendBoostUpdate('StickerStackHive', hive);
        sendBoostUpdate('StickerStackCub', cub);
        sendBoostUpdate('StickerStackVoucher', voucher);
    });
    $('#formCheck-77').on('change', function () { sendBoostUpdate('StickerPrinterCheck', this.checked ? 1 : 0); });
    $('select[name="stickerPrinter"]').on('change', function () {
        const t = $(this).find('option:selected').text().trim().split(' ')[0];
        // Picking an egg implies you want the sticker printer on, so switch the toggle
        // above it on too (and tell AHK), then send the selected egg.
        $('#formCheck-77').prop('checked', true);
        sendBoostUpdate('StickerPrinterCheck', 1);
        sendBoostUpdate('StickerPrinterEgg', t || 'Basic');
    });

    console.log('[init] Boost tab handlers initialized');
}

/* ------------------------------------------------------------------ */
/* send                                                                */
/* ------------------------------------------------------------------ */

function sendBoostUpdate(key, value) {
    if (suppressBoostSend) return;
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] boost host not ready');
        return;
    }
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'boost', key: key, value: value }));
        if (promise && promise.then) promise.then(function () { }, function (err) { console.warn('[ahk-send] boost:', err); });
    } catch (err) {
        console.warn('[ahk-send] boost error:', err);
    }
}

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

function applyBoostFromAhk(key, value) {
    const prev = suppressBoostSend;
    suppressBoostSend = true;
    try {
        let m;
        switch (key) {
            case 'FieldBooster1': setSelectVal('#boostFieldBooster1', boosterToWeb(value)); break;
            case 'FieldBooster2': setSelectVal('#boostFieldBooster2', boosterToWeb(value)); break;
            case 'FieldBooster3': setSelectVal('#boostFieldBooster3', boosterToWeb(value)); break;
            case 'FieldBoosterMins': $('#boostMinsInput').val(value); break;
            case 'BoostChaserCheck': $('#boostGatherInBoostedField').prop('checked', !!value); break;
            case 'AutoFieldBoostActive': $('#boostAutoFieldBoostActive, #boostAutoFieldBoostActiveLabel').prop('checked', !!value); break;
            case 'AutoFieldBoostRefresh': $('#boostAutoFieldBoostRefresh').val(value); break;
            case 'SprinklerType': setSelectVal('#boostHotbarSlot1', SPRINKLER_AHK_TO_WEB[value] || 'none'); break;
            case 'PFieldBoosted': window._pFieldBoosted = !!value; refreshAllHotbarSlots(); break;
            case 'StickerStackCheck': $('#formCheck-76').prop('checked', !!value); break;
            case 'StickerStackMode': setRadioByName('btnStickerTimer', (value === 1 || value === '1') ? 'btnMondoActionKill-4' : 'btnMondoActionBuff-1'); break;
            case 'StickerStackTimer': {
                const s = parseInt(value, 10) || 0;
                $('#inputMondoSeconds-35').val(Math.floor(s / 3600));
                $('#inputMondoSeconds-36').val(Math.floor((s % 3600) / 60));
                break;
            }
            case 'StickerStackItem':
                setRadioByName('btnMondoLoot1', value === 'Sticker' ? 'ladybugsKill-16' : (value === 'Both' ? 'ladybugsKill-17' : 'ladybugsLoot-7'));
                break;
            case 'StickerStackHive': window._stkHive = !!value; updateStickerSkins(); break;
            case 'StickerStackCub': window._stkCub = !!value; updateStickerSkins(); break;
            case 'StickerStackVoucher': window._stkVoucher = !!value; updateStickerSkins(); break;
            case 'StickerPrinterCheck': $('#formCheck-77').prop('checked', !!value); break;
            case 'StickerPrinterEgg': {
                const $sel = $('select[name="stickerPrinter"]');
                $sel.find('option').each(function () {
                    if (($(this).text().trim().split(' ')[0]) === value) { $sel.val($(this).val()); return false; }
                });
                if ($sel.hasClass('selectpicker') && $.fn.selectpicker) $sel.selectpicker('refresh');
                break;
            }
            default:
                if ((m = /^HotbarWhile([2-7])$/.exec(key))) {
                    setSelectVal('#boostHotbarSlot' + m[1], HOTBAR_AHK_TO_WEB[value] || 'never');
                    refreshHotbarSlotUi(m[1]);
                } else if ((m = /^HotbarTime([2-7])$/.exec(key))) {
                    const secs = parseInt(value, 10) || 0;
                    const inputs = HOTBAR_TIME_INPUTS[m[1]];
                    $(inputs[0]).val(Math.floor(secs / 3600));
                    $(inputs[1]).val(Math.floor((secs % 3600) / 60));
                } else if (FIELD_KEY_TO_SEL[key]) {
                    $('#' + FIELD_KEY_TO_SEL[key]).prop('checked', !!value);
                } else if (AFB_KEY_TO_SEL[key]) {
                    const sel = AFB_KEY_TO_SEL[key];
                    if (AFB_MAP[sel][1] === 'check') $(sel).prop('checked', !!value); else $(sel).val(value);
                } else {
                    console.log('[applyBoostFromAhk] Unhandled key: ' + key);
                }
                break;
        }
    } finally {
        suppressBoostSend = prev;
    }
}

// ---- Hotbar slot descriptive text / conditional timers --------------
// Mirrors the classic GUI: condition-based hotbar items show a description
// ("@ Full Pack", "@ Hive Return", ...) instead of an (unused) timer.
const HOTBAR_DESCRIPTIONS = {
    microconverter: { normal: '@ Full Pack', boosted: '@ Boosted' },
    whirligig: { normal: '@ Hive Return', boosted: '@ Boosted' },
    enzymes: { normal: '@ Converting Balloon', boosted: '@ Boosted' },
    glitter: { normal: '@ Boosted', boosted: '@ Boosted' }
};

function refreshHotbarSlotUi(slot) {
    const n = parseInt(slot, 10);
    if (!n || n < 2 || n > 7) return;
    const $sel = $('#boostHotbarSlot' + n);
    if (!$sel.length) return;

    // Each slot column holds three rows: the "Slot N" label, the select and the
    // "Hours : Mins" timer. Grab the column so we can toggle the timer and inject
    // a description line when the item is condition-based (like the classic GUI).
    const $slotCol = $sel.closest('.row').parent();
    if (!$slotCol.length) return;
    const $timer = $slotCol.children('.row').last();

    let $desc = $slotCol.children('.hb-desc');
    if (!$desc.length) {
        $desc = $('<div class="hb-desc fw-bold text-center" style="margin-top: 6px;"></div>');
        $timer.before($desc);
    }

    const value = $sel.val();
    const boosted = !!window._pFieldBoosted;
    let description = '';
    let showTimer = true;

    if (value === 'never') {
        showTimer = false;
    } else if (HOTBAR_DESCRIPTIONS[value]) {
        const d = HOTBAR_DESCRIPTIONS[value];
        description = boosted ? d.boosted : d.normal;
        showTimer = false;
    }

    $desc.text(description);
    $desc.toggle(!!description);
    $timer.toggle(showTimer);
    // The Hours/Mins inputs are only usable while the timer row is visible; make sure
    // they are enabled exactly when they are shown (and disabled while hidden).
    $timer.find('input').prop('disabled', !showTimer);
}

function refreshAllHotbarSlots() {
    for (let n = 2; n <= 7; n++) refreshHotbarSlotUi(n);
}

function updateStickerSkins() {
    const hive = !!window._stkHive, cub = !!window._stkCub, voucher = !!window._stkVoucher;
    const id = (!hive && !cub && !voucher) ? 'ladybugsLoot-8' : ((hive && cub && voucher) ? 'ladybugsKill-20' : (cub ? 'ladybugsKill-19' : 'ladybugsKill-18'));
    setRadioByName('btnMondoLoot2', id);
}
function setRadioByName(name, id) {
    const $g = $('input[name="' + name + '"]');
    $g.prop('checked', false);
    $g.filter('#' + id).prop('checked', true);
}
// Set a select value and refresh bootstrap-select so its rendered button updates.
function setSelectVal(sel, val) {
    const $el = $(sel);
    if (!$el.length) return;
    $el.val(val);
    if ($el.hasClass('selectpicker') && $.fn.selectpicker) $el.selectpicker('refresh');
}

function restoreBoostTabState(payload) {
    if (hasBoostInitApplied) return;
    try {
        const data = JSON.parse(payload);
        for (const [key, value] of Object.entries(data)) applyBoostFromAhk(key, value);
        refreshAllHotbarSlots();
        hasBoostInitApplied = true;
        console.log('[restore] Boost tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Boost tab state:', e.message);
    }
}

window.boostTabHandlers = {
    initialize: initializeBoostTabHandlers,
    applyFromAhk: applyBoostFromAhk,
    restoreState: restoreBoostTabState,
    send: sendBoostUpdate
};
