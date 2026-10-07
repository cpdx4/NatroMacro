/**
 * Quests Tab Event Handlers
 * Bidirectional sync between the Quest tab and the AHK (classic GUI) settings.
 *
 * Message type: { type: 'quests', key, value }
 */

let suppressQuestsSend = false;
let hasQuestsInitApplied = false;

// quest setting key -> checkbox selector
const QUEST_CONTROLS = {
    'PolarQuestCheck':               '#formCheck-51',
    'PolarQuestGatherInterruptCheck': '#formCheck-52',
    'BlackQuestCheck':               '#formCheck-61',
    'BuckoQuestCheck':               '#formCheck-53',
    'BuckoQuestGatherInterruptCheck': '#formCheck-54',
    'RileyQuestCheck':               '#formCheck-59',
    'RileyQuestGatherInterruptCheck': '#formCheck-60',
    'HoneyQuestCheck':               '#formCheck-55',
    'BrownQuestCheck':               '#formCheck-57',
    'QuestBoostCheck':               '#formCheck-24'
};

// Quest detail/progress text — the same strings the classic GUI shows in its
// "<NPC>QuestProgress" Text controls. They use "|" as a line separator, so render
// them as real newlines in the web GUI.
const QUEST_PROGRESS = {
    'PolarQuestProgress': '#questDetails-Polar',
    'BlackQuestProgress': '#questDetails-Black',
    'BuckoQuestProgress': '#questDetails-Bucko',
    'RileyQuestProgress': '#questDetails-Riley',
    'HoneyQuestProgress': '#questDetails-Honey',
    'BrownQuestProgress': '#questDetails-Brown'
};

function initializeQuestsTabHandlers() {
    Object.keys(QUEST_CONTROLS).forEach(function (key) {
        $(document).on('change', QUEST_CONTROLS[key], function () {
            sendQuestsUpdate(key, this.checked ? 1 : 0);
        });
    });

    // Gather limit (minutes)
    $('#inputMondoSeconds-11').on('change', function () {
        sendQuestsUpdate('QuestGatherMins', parseInt($(this).val(), 10) || 5);
    });

    // Return to hive (Walk / Reset)
    $('input[name="btnKingBeetleAmulet"]').on('change', function () {
        if (!this.checked) return;
        sendQuestsUpdate('QuestGatherReturnBy', (this.id === 'btnMondoActionKill-3') ? 'Reset' : 'Walk');
    });

    console.log('[init] Quests tab handlers initialized');
}

function sendQuestsUpdate(key, value) {
    if (suppressQuestsSend) return;
    console.log('[ahk-send] quests', key, value);
    window.AhkBridge.updateState('quests', key, value);
}

function applyQuestsFromAhk(key, value) {
    const prev = suppressQuestsSend;
    suppressQuestsSend = true;
    try {
        const sel = QUEST_CONTROLS[key];
        if (sel) {
            $(sel).prop('checked', !!value);
        } else if (QUEST_PROGRESS[key]) {
            $(QUEST_PROGRESS[key]).text(String(value == null ? '' : value).split('|').join('\n'));
        } else if (key === 'QuestGatherMins') {
            $('#inputMondoSeconds-11').val(value || 5);
        } else if (key === 'QuestGatherReturnBy') {
            const reset = (value === 'Reset');
            $('input[name="btnKingBeetleAmulet"]').prop('checked', false);
            $('#' + (reset ? 'btnMondoActionKill-3' : 'btnKingBeetleAmuletKeepOld-1')).prop('checked', true);
        } else {
            console.log('[applyQuestsFromAhk] Unhandled key: ' + key);
        }
    } finally {
        suppressQuestsSend = prev;
    }
}

function restoreQuestsTabState(payload) {
    // Idempotent: a repeat init (GUI mode toggle) must re-apply the snapshot.
    try {
        const data = JSON.parse(payload);
        for (const [key, value] of Object.entries(data)) applyQuestsFromAhk(key, value);
        hasQuestsInitApplied = true;
        console.log('[restore] Quests tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Quests tab state:', e.message);
    }
}

function setupQuestsMessageListener() {
    // Transport is handled by the shared bridge module (assets/js/2/bridge.js).
    window.AhkBridge.registerTab('quests', 'quests', {
        applyFromAhk: applyQuestsFromAhk,
        restoreState: restoreQuestsTabState
    });
}

$(document).ready(function () {
    if ($('#sidebar-quest').length > 0) {
        initializeQuestsTabHandlers();
        setupQuestsMessageListener();
        console.log('Quests tab handlers ready');
    }
});

window.questsTabHandlers = {
    initialize: initializeQuestsTabHandlers,
    applyFromAhk: applyQuestsFromAhk,
    restoreState: restoreQuestsTabState,
    send: sendQuestsUpdate
};
