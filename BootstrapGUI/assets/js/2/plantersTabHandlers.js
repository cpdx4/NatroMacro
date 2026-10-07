/**
 * Planters Tab Event Handlers
 * Bidirectional sync between the Planters tab and AHK (classic GUI) settings.
 *
 * Message type: { type: 'plants', key, value }
 */

let suppressPlantsSend = false;
let hasPlantsInitApplied = false;
// AHK pushes preset/snapshot updates as a burst of individual messages. Buffering them
// lets us apply the whole batch and refresh bootstrap-select once instead of once per key.
let pendingPlantsChanges = [];
let plantsFlushScheduled = false;

/* ------------------------------------------------------------------ */
/* static maps                                                         */
/* ------------------------------------------------------------------ */

const PLANTER_CHECKS = {
    '#formCheck-125': 'PlasticPlanterCheck', '#formCheck-127': 'CandyPlanterCheck',
    '#formCheck-126': 'BlueClayPlanterCheck', '#formCheck-134': 'RedClayPlanterCheck',
    '#formCheck-135': 'TackyPlanterCheck', '#formCheck-136': 'PesticidePlanterCheck',
    '#formCheck-131': 'HeatTreatedPlanterCheck', '#formCheck-132': 'HydroponicPlanterCheck',
    '#formCheck-133': 'PetalPlanterCheck', '#formCheck-128': 'PlanterOfPlentyCheck',
    '#formCheck-129': 'PaperPlanterCheck', '#formCheck-130': 'TicketPlanterCheck'
};

const FIELD_CHECKS = {
    '#formCheck-137': 'DandelionFieldCheck', '#formCheck-138': 'SunflowerFieldCheck',
    '#formCheck-139': 'MushroomFieldCheck', '#formCheck-140': 'BlueFlowerFieldCheck',
    '#formCheck-141': 'CloverFieldCheck', '#formCheck-157': 'SpiderFieldCheck',
    '#formCheck-158': 'StrawberryFieldCheck', '#formCheck-159': 'BambooFieldCheck',
    '#formCheck-152': 'PineappleFieldCheck', '#formCheck-153': 'StumpFieldCheck',
    '#formCheck-147': 'CactusFieldCheck', '#formCheck-148': 'PumpkinFieldCheck',
    '#formCheck-149': 'PineTreeFieldCheck', '#formCheck-150': 'RoseFieldCheck',
    '#formCheck-142': 'MountainTopFieldCheck', '#formCheck-162': 'CoconutFieldCheck',
    '#formCheck-163': 'PepperFieldCheck'
};

// "Use Glitter" checkbox per manual planter slot (index 1..27), in HTML order.
const GLITTER_IDS = [null,
    '#formCheck-98', '#formCheck-100', '#formCheck-99', '#formCheck-101', '#formCheck-102',
    '#formCheck-103', '#formCheck-104', '#formCheck-105', '#formCheck-106', '#formCheck-119',
    '#formCheck-120', '#formCheck-121', '#formCheck-116', '#formCheck-117', '#formCheck-118',
    '#formCheck-113', '#formCheck-114', '#formCheck-115', '#formCheck-110', '#formCheck-111',
    '#formCheck-112', '#formCheck-107', '#formCheck-108', '#formCheck-109', '#formCheck-122',
    '#formCheck-123', '#formCheck-124'];

const FIELD_NAME_FIX = { 'Pine tree': 'Pine Tree', 'Blue flower': 'Blue Flower', 'Mountain top': 'Mountain Top' };
const PLANTER_NAME_FIX = { 'Heat treated': 'Heat Treated' };

function planterSelectName(i) { return 'collSel_field1' + (i > 1 ? '_' + (i - 1) : ''); }
function fieldSelectName(i) { return 'collSel_planter1' + (i > 1 ? '_' + (i - 1) : ''); }
function slotOf(i) { return Math.floor((i - 1) / 9) + 1; }
function cycleOf(i) { return ((i - 1) % 9) + 1; }

/* ------------------------------------------------------------------ */
/* radio helpers                                                       */
/* ------------------------------------------------------------------ */

function getCheckedRadioId(name) {
    const $checked = $('input[name="' + name + '"]:checked');
    return $checked.length ? $checked.attr('id') : '';
}
function setRadioById(name, id) {
    const $group = $('input[name="' + name + '"]');
    $group.prop('checked', false);
    $group.filter('#' + id).prop('checked', true);
}
function planterModeFromAhk(value) {
    const n = parseInt(value, 10);
    if (n === 1) return 'planterModeManual';
    if (n === 2) return 'planterModeAuto';
    return 'planterModeOff';
}
function planterModeToAhk(id) {
    if (id === 'planterModeManual') return 1;
    if (id === 'planterModeAuto') return 2;
    return 0;
}
function harvestModeFromAhk(value) {
    if (value === 'Full') return 'harvestFull';
    if (value === 'Auto') return 'harvestAuto';
    return 'harvestTimed';
}
function presetFromAhk(value) {
    const v = (value || 'Blue').toString();
    if (v === 'White') return 'presetWhite';
    if (v === 'Red') return 'presetRed';
    if (v === 'Custom') return 'presetCustom';
    return 'presetBlue';
}
function nectarName(v) {
    const map = { comforting: 'Comforting', invigorating: 'Invigorating', motivating: 'Motivating', refreshing: 'Refreshing', satisfying: 'Satisfying' };
    return map[String(v).toLowerCase()] || v;
}

/* ------------------------------------------------------------------ */
/* initialize                                                          */
/* ------------------------------------------------------------------ */

function initializePlantersTabHandlers() {

    $('input[name="planterMode"]').on('change', function () {
        if (!this.checked) return;
        sendPlantsUpdate('PlanterMode', planterModeToAhk(this.id));
        updatePlantersModeUi(planterModeToAhk(this.id));
    });

    $('input[name="harvestMode"]').on('change', function () {
        if (!this.checked) return;
        let mode = 'Timed';
        if (this.id === 'harvestFull') mode = 'Full';
        else if (this.id === 'harvestAuto') mode = 'Auto';
        sendPlantsUpdate('HarvestMode', mode);
    });

    $('input[name="presetMode"]').on('change', function () {
        if (!this.checked) return;
        let preset = 'Blue';
        if (this.id === 'presetWhite') preset = 'White';
        else if (this.id === 'presetRed') preset = 'Red';
        else if (this.id === 'presetCustom') preset = 'Custom';
        sendPlantsUpdate('NectarPreset', preset);
    });

    // Manual: current cycle start
    $('#inputMondoSeconds-37').on('change', function () { sendPlantsUpdate('PlanterManualCycle1', parseInt($(this).val(), 10) || 1); });
    $('#inputMondoSeconds-37-1').on('change', function () { sendPlantsUpdate('PlanterManualCycle2', parseInt($(this).val(), 10) || 1); });
    $('#inputMondoSeconds-37-2').on('change', function () { sendPlantsUpdate('PlanterManualCycle3', parseInt($(this).val(), 10) || 1); });

    // Manual: gather in planter fields (per slot) + convert full bag
    $('#formCheck-92').on('change', function () { sendPlantsUpdate('MPlanterGather1', this.checked ? 1 : 0); });
    $('#formCheck-93').on('change', function () { sendPlantsUpdate('MPlanterGather2', this.checked ? 1 : 0); });
    $('#formCheck-97').on('change', function () { sendPlantsUpdate('MPlanterGather3', this.checked ? 1 : 0); });
    $('#formCheck-91').on('change', function () { sendPlantsUpdate('ConvertFullBagHarvest', this.checked ? 1 : 0); });

    // Harvest interval (both inputs)
    $('#inputMondoSeconds-39, #inputMondoSeconds-45').on('change', function () {
        sendPlantsUpdate('HarvestInterval', parseInt($(this).val(), 10) || 2);
    });

    // Nectar priority selects + min %
    const prioritySelects = {
        'collSel_field1_27': 1, 'collSel_field1_28': 2, 'collSel_field1_29': 3, 'collSel_field1_30': 4, 'collSel_field1_31': 5
    };
    Object.keys(prioritySelects).forEach(function (n) {
        $(document).on('change', 'select[name="' + n + '"]', function () {
            const index = prioritySelects[n];
            sendPlantsUpdate('n' + index + 'priority', nectarName($(this).find('option:selected').text().trim()));
            // the classic GUI never allows the same nectar twice, so keep the web in line
            enforceNectarUniqueness();
        });
    });
    const minInputs = { '#inputMondoSeconds-38': 1, '#inputMondoSeconds-43': 2, '#inputMondoSeconds-42': 3, '#inputMondoSeconds-41': 4, '#inputMondoSeconds-40': 5 };
    Object.keys(minInputs).forEach(function (sel) {
        // The minimum % fields must always stay editable, regardless of which preset is
        // selected (the classic GUI disables its UpDowns for some presets).
        $(sel).prop('disabled', false).prop('readonly', false);
        $(sel).on('change', function () { sendPlantsUpdate('n' + minInputs[sel] + 'minPercent', parseInt($(this).val(), 10) || 0); });
    });

    // Allowed planters / fields
    Object.keys(PLANTER_CHECKS).forEach(function (sel) {
        $(sel).on('change', function () { sendPlantsUpdate(PLANTER_CHECKS[sel], this.checked ? 1 : 0); });
    });
    Object.keys(FIELD_CHECKS).forEach(function (sel) {
        $(sel).on('change', function () { sendPlantsUpdate(FIELD_CHECKS[sel], this.checked ? 1 : 0); });
    });

    // Options
    $('#inputMondoSeconds-44').on('change', function () { sendPlantsUpdate('MaxAllowedPlanters', parseInt($(this).val(), 10) || 0); });
    $('#formCheck-143').on('change', function () { sendPlantsUpdate('GotoPlanterField', this.checked ? 1 : 0); });
    $('#formCheck-144').on('change', function () { sendPlantsUpdate('GatherFieldSipping', this.checked ? 1 : 0); });
    $('#formCheck-145').on('change', function () { sendPlantsUpdate('ConvertFullBagHarvest', this.checked ? 1 : 0); });
    $('#formCheck-146').on('change', function () { sendPlantsUpdate('GatherPlanterLoot', this.checked ? 1 : 0); });

    // Manual planter cycles (27)
    for (let i = 1; i <= 27; i++) {
        (function (n) {
            const slot = slotOf(n), cycle = cycleOf(n);
            const pre = 'MSlot' + slot + 'Cycle' + cycle;

            $(document).on('change', 'select[name="' + planterSelectName(n) + '"]', function () {
                let v = $(this).find('option:selected').text().trim();
                v = PLANTER_NAME_FIX[v] || v;
                sendPlantsUpdate(pre + 'Planter', v);
            });
            $(document).on('change', 'select[name="' + fieldSelectName(n) + '"]', function () {
                let v = $(this).find('option:selected').text().trim();
                v = FIELD_NAME_FIX[v] || v;
                sendPlantsUpdate(pre + 'Field', v);
            });
            $(document).on('change', GLITTER_IDS[n], function () {
                sendPlantsUpdate(pre + 'Glitter', this.checked ? 1 : 0);
            });
            $('input[name="planter' + n + 'Collect"]').on('change', function () {
                if (!this.checked) return;
                sendPlantsUpdate(pre + 'AutoFull', this.id === ('planter' + n + 'CollectFull') ? 'Full' : 'Timed');
            });
        })(i);
    }

    applyIconTooltips();
    updatePlantersModeUi(planterModeToAhk(getCheckedRadioId('planterMode')));
    console.log('[init] Planters tab handlers initialized');
}

// Add native hover tooltips (title attributes) to the planter, field and nectar
// icons shown in the Allowed Planters / Allowed Fields cards.
function applyIconTooltips() {
    const planterTitles = {
        'Plasticplanter.png': 'Plastic Planter',
        'Candyplanter.png': 'Candy Planter',
        'Blueclayplanter.png': 'Blue Clay Planter',
        'Redclayplanter.png': 'Red Clay Planter',
        'Tackyplanter.png': 'Tacky Planter',
        'Pesticideplanter.png': 'Pesticide Planter',
        'Heattreatedplanter.png': 'Heat Treated Planter',
        'Hydroponicplanter.png': 'Hydroponic Planter',
        'Petalplanter.png': 'Petal Planter',
        'Planterofplenty.png': 'Planter of Plenty',
        'Paperplanter.png': 'Paper Planter',
        'Ticketplanter.png': 'Ticket Planter'
    };
    const fieldTitles = {
        'dandelion.png': 'Dandelion Field',
        'sunflower.png': 'Sunflower Field',
        'mushroom.png': 'Mushroom Field',
        'blueflower.png': 'Blue Flower Field',
        'clover.png': 'Clover Field',
        'spider.png': 'Spider Field',
        'strawberry.png': 'Strawberry Field',
        'bamboo.png': 'Bamboo Field',
        'pineapple.png': 'Pineapple Field',
        'stump.png': 'Stump Field',
        'cactus.png': 'Cactus Field',
        'pumpkin.png': 'Pumpkin Field',
        'pinetree.png': 'Pine Tree Field',
        'rose.png': 'Rose Field',
        'mountaintop.png': 'Mountain Top Field',
        'coconut.png': 'Coconut Field',
        'pepper.png': 'Pepper Field'
    };
    const nectarTitles = {
        'comforting.png': 'Comforting Nectar',
        'invigorating.png': 'Invigorating Nectar',
        'motivating.png': 'Motivating Nectar',
        'refreshing.png': 'Refreshing Nectar',
        'satisfying.png': 'Satisfying Nectar'
    };
    const titleFor = function (map) {
        return function () {
            const file = (this.getAttribute('src') || '').split('/').pop();
            if (map[file]) this.title = map[file];
        };
    };
    $('#sidebar-planters img[src*="img/planters/"]').each(titleFor(planterTitles));
    $('#sidebar-planters img[src*="img/fieldIcons/"]').each(titleFor(fieldTitles));
    $('#sidebar-planters img[src*="img/nectars/"]').each(titleFor(nectarTitles));
}

function updatePlantersModeUi(mode) {
    const $manualTab = $('a[href="#planters-manual"]');
    const $autoTab = $('a[href="#planters-automatic"]');
    if (!$manualTab.length || !$autoTab.length) return;

    // Off: hide the entire Settings section below the Planter mode toggle.
    $('#plantersSettingsSection').toggle(mode !== 0);

    const setTabEnabled = function ($tab, enabled) {
        $tab.css('pointer-events', enabled ? '' : 'none').css('opacity', enabled ? '' : '0.5');
    };

    if (mode === 1) {
        // Manual selected -> show the Manual tab and lock out Automatic+.
        setTabEnabled($manualTab, true);
        setTabEnabled($autoTab, false);
        activatePlantersSubTab('#planters-manual');
    } else if (mode === 2) {
        // Automatic+ selected -> show the Automatic+ tab and lock out Manual.
        setTabEnabled($manualTab, false);
        setTabEnabled($autoTab, true);
        activatePlantersSubTab('#planters-automatic');
    } else {
        // Off: leave whichever tab is currently visible alone; keep both clickable.
        setTabEnabled($manualTab, true);
        setTabEnabled($autoTab, true);
    }
}

// Activate one of the Planters sub-tabs (Bootstrap 5 tab, with jQuery/click fallback).
function activatePlantersSubTab(href) {
    const link = document.querySelector('a[role="tab"][href="' + href + '"]');
    if (!link) return;
    try {
        if (window.bootstrap && window.bootstrap.Tab) {
            window.bootstrap.Tab.getOrCreateInstance(link).show();
        } else if ($.fn.tab) {
            $(link).tab('show');
        } else {
            link.click();
        }
    } catch (e) {
        console.warn('[planters] sub-tab switch failed:', e);
    }
}

/* ------------------------------------------------------------------ */
/* send to AHK                                                         */
/* ------------------------------------------------------------------ */

function sendPlantsUpdate(key, value) {
    if (suppressPlantsSend) return;
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] plants host not ready');
        return;
    }
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'plants', key: key, value: value }));
        if (promise && promise.then) promise.then(function () { }, function (err) { console.warn('[ahk-send] plants:', err); });
    } catch (err) {
        console.warn('[ahk-send] plants error:', err);
    }
}

/* ------------------------------------------------------------------ */
/* apply from AHK                                                      */
/* ------------------------------------------------------------------ */

function applyPlantsFromAhk(key, value, deferRefresh) {
    const prev = suppressPlantsSend;
    suppressPlantsSend = true;
    try {
        let m;
        switch (key) {
            case 'PlanterMode': setRadioById('planterMode', planterModeFromAhk(value)); updatePlantersModeUi(parseInt(value, 10) || 0); break;
            case 'HarvestMode': setRadioById('harvestMode', harvestModeFromAhk(value)); break;
            case 'HarvestFullGrown': if (value) setRadioById('harvestMode', 'harvestFull'); break;
            case 'AutomaticHarvestInterval': if (value) setRadioById('harvestMode', 'harvestAuto'); break;
            case 'NectarPreset':
            case 'nPreset':
                setRadioById('presetMode', presetFromAhk(value));
                break;
            case 'HarvestInterval': {
                const v = (value === '' || value === null || typeof value === 'undefined') ? 2 : value;
                $('#inputMondoSeconds-39').val(v); $('#inputMondoSeconds-45').val(v);
                break;
            }
            case 'MPlanterGather1': $('#formCheck-92').prop('checked', !!value); break;
            case 'MPlanterGather2': $('#formCheck-93').prop('checked', !!value); break;
            case 'MPlanterGather3': $('#formCheck-97').prop('checked', !!value); break;
            case 'ConvertFullBagHarvest': $('#formCheck-91, #formCheck-145').prop('checked', !!value); break;
            case 'GatherPlanterLoot': $('#formCheck-146').prop('checked', !!value); break;
            case 'GotoPlanterField': $('#formCheck-143').prop('checked', !!value); break;
            case 'GatherFieldSipping': $('#formCheck-144').prop('checked', !!value); break;
            case 'MaxAllowedPlanters': $('#inputMondoSeconds-44').val(value); break;
            case 'PlanterManualCycle1': $('#inputMondoSeconds-37').val(value || 1); break;
            case 'PlanterManualCycle2': $('#inputMondoSeconds-37-1').val(value || 1); break;
            case 'PlanterManualCycle3': $('#inputMondoSeconds-37-2').val(value || 1); break;
            case 'PlanterHarvestFull1': case 'PlanterHarvestFull2': case 'PlanterHarvestFull3': {
                const n = key.replace('PlanterHarvestFull', '');
                setRadioById('planter' + n + 'Collect', value === 'Full' ? ('planter' + n + 'CollectFull') : ('planter' + n + 'CollectTimed'));
                break;
            }
            default:
                if ((m = /^n([1-5])priority$/.exec(key))) {
                    // setPrioritySelect() also refreshes bootstrap-select (its rendered button
                    // otherwise keeps showing the previous selection), unless the caller is
                    // flushing a batch and will refresh once at the end.
                    setPrioritySelect(m[1], value, deferRefresh);
                    // The classic GUI never allows the same nectar twice; a duplicate in a
                    // later priority must become None/Blank here too.
                    enforceNectarUniqueness(deferRefresh);
                } else if ((m = /^n([1-5])minPercent$/.exec(key))) {
                    const inputIds = { 1: '#inputMondoSeconds-38', 2: '#inputMondoSeconds-43', 3: '#inputMondoSeconds-42', 4: '#inputMondoSeconds-41', 5: '#inputMondoSeconds-40' };
                    $(inputIds[m[1]]).val(value).prop('disabled', false).prop('readonly', false);
                } else if (key in invertMap(PLANTER_CHECKS) || key in invertMap(FIELD_CHECKS)) {
                    const sel = invertMap(PLANTER_CHECKS)[key] || invertMap(FIELD_CHECKS)[key];
                    $(sel).prop('checked', !!value);
                } else if ((m = /^MSlot([1-3])Cycle([1-9])(Planter|Field|Glitter|AutoFull)$/.exec(key))) {
                    applyManualCycle(m[1], m[2], m[3], value);
                } else {
                    console.log('[applyPlantsFromAhk] Unhandled key: ' + key);
                }
                break;
        }
    } finally {
        suppressPlantsSend = prev;
    }
}

function invertMap(mapObj) {
    const out = {};
    Object.keys(mapObj).forEach(function (k) { out[mapObj[k]] = k; });
    return out;
}

/* ------------------------------------------------------------------ */
/* Nectar priority uniqueness (mirrors nm_NectarPriority)              */
/* ------------------------------------------------------------------ */

function prioritySelectFor(i) { return $('select[name="collSel_field1_' + (26 + parseInt(i, 10)) + '"]'); }

function setPrioritySelect(i, name, deferRefresh) {
    const $sel = prioritySelectFor(i);
    if (!$sel.length) return;
    $sel.find('option').each(function () {
        if (nectarName($(this).text().trim()) === nectarName(name)) { $sel.val($(this).val()); return false; }
    });
    if (!deferRefresh && $sel.hasClass('selectpicker') && $.fn.selectpicker) $sel.selectpicker('refresh');
}

// Refresh every bootstrap-select priority dropdown once (used after a batch).
function refreshPrioritySelects() {
    for (let i = 1; i <= 5; i++) {
        const $sel = prioritySelectFor(i);
        if ($sel.length && $sel.hasClass('selectpicker') && $.fn.selectpicker) $sel.selectpicker('refresh');
    }
}

// The classic GUI only allows each nectar once; duplicates in later priorities are
// reset to None. Keep the web GUI (and AHK) consistent with that behaviour.
function enforceNectarUniqueness(deferRefresh) {
    const seen = {};
    for (let i = 1; i <= 5; i++) {
        const $sel = prioritySelectFor(i);
        if (!$sel.length) continue;
        const name = nectarName($sel.find('option:selected').text().trim());
        if (name && name !== 'None' && seen[name]) {
            setPrioritySelect(i, 'None', deferRefresh);
            sendPlantsUpdate('n' + i + 'priority', 'None');
        } else if (name && name !== 'None') {
            seen[name] = true;
        }
    }
}

// Buffer a burst of AHK plants updates and apply them in one pass. Priorities, min %
// and the 17 field checks all change at once when a preset is picked, so this collapses
// ~5 bootstrap-select rebuilds into a single refresh and removes the visible "pop-in".
function queuePlantsFromAhk(key, value) {
    pendingPlantsChanges.push([key, value]);
    if (plantsFlushScheduled) return;
    plantsFlushScheduled = true;
    setTimeout(function () {
        plantsFlushScheduled = false;
        const batch = pendingPlantsChanges;
        pendingPlantsChanges = [];
        if (!batch.length) return;
        const prev = suppressPlantsSend;
        suppressPlantsSend = true;
        try {
            batch.forEach(function (kv) { applyPlantsFromAhk(kv[0], kv[1], true); });
            enforceNectarUniqueness(true);
            refreshPrioritySelects();
        } finally {
            suppressPlantsSend = prev;
        }
    }, 0);
}

function applyManualCycle(slot, cycle, kind, value) {
    const i = (parseInt(slot, 10) - 1) * 9 + parseInt(cycle, 10);
    if (kind === 'Planter') {
        const $sel = $('select[name="' + planterSelectName(i) + '"]');
        $sel.find('option').each(function () {
            const t = (PLANTER_NAME_FIX[$(this).text().trim()] || $(this).text().trim());
            if (t === value) { $sel.val($(this).val()); return false; }
        });
        if ($sel.hasClass('selectpicker')) $sel.selectpicker('refresh');
    } else if (kind === 'Field') {
        const $sel = $('select[name="' + fieldSelectName(i) + '"]');
        $sel.find('option').each(function () {
            const t = (FIELD_NAME_FIX[$(this).text().trim()] || $(this).text().trim());
            if (t === value) { $sel.val($(this).val()); return false; }
        });
        if ($sel.hasClass('selectpicker')) $sel.selectpicker('refresh');
    } else if (kind === 'Glitter') {
        $(GLITTER_IDS[i]).prop('checked', !!value);
    } else if (kind === 'AutoFull') {
        setRadioById('planter' + i + 'Collect', value === 'Full' ? ('planter' + i + 'CollectFull') : ('planter' + i + 'CollectTimed'));
    }
}

function restorePlantersTabState(payload) {
    // Idempotent: a repeat init (GUI mode toggle) must re-apply the snapshot.
    try {
        const data = JSON.parse(payload);
        const prev = suppressPlantsSend;
        suppressPlantsSend = true;
        try {
            for (const [key, value] of Object.entries(data)) applyPlantsFromAhk(key, value, true);
            enforceNectarUniqueness(true);
            refreshPrioritySelects();
        } finally {
            suppressPlantsSend = prev;
        }
        hasPlantsInitApplied = true;
        console.log('[restore] Planters tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Planters tab state:', e.message);
    }
}

function setupPlantsMessageListener() {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            try {
                const message = event.data;
                const msg = (typeof message === 'string') ? JSON.parse(message) : message;
                if (msg && msg.type === 'init' && msg.plants) {
                    restorePlantersTabState(JSON.stringify(msg.plants));
                } else if (msg && msg.type === 'plants') {
                    queuePlantsFromAhk(msg.key, msg.value);
                }
            } catch (e) {
                console.warn('[ahk-msg] error processing plants message:', e);
            }
        });
    }
}

$(document).ready(function () {
    if ($('#sidebar-planters').length > 0) {
        initializePlantersTabHandlers();
        setupPlantsMessageListener();
        console.log('Planters tab handlers ready');
    }
});

window.plantersTabHandlers = {
    initialize: initializePlantersTabHandlers,
    applyFromAhk: applyPlantsFromAhk,
    restoreState: restorePlantersTabState,
    send: sendPlantsUpdate
};
