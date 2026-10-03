/**
 * Status Tab Event Handlers
 * Mirrors the classic GUI "Status" tab (reverse log / discord debugging / stats).
 *
 * Message type: { type: 'status', key, value }
 */

let suppressStatusSend = false;
let hasStatusInitApplied = false;

const STATUS_CONTROLS = {
    'StatusLogReverse': { sel: '#stStatusLogReverse', kind: 'check' },
    'ssDebugging':      { sel: '#stDiscordDebug', kind: 'check' },
    // --- Discord integration (inline panel on the Status tab) ---
    'DiscordCheck':       { sel: '#stDiscordCheck', kind: 'check' },
    'Webhook':            { sel: '#stWebhook', kind: 'value' },
    'BotToken':           { sel: '#stBotToken', kind: 'value' },
    'MainChannelCheck':   { sel: '#stMainChannelCheck', kind: 'check' },
    'MainChannelID':      { sel: '#stMainChannelID', kind: 'value' },
    'ReportChannelCheck': { sel: '#stReportChannelCheck', kind: 'check' },
    'ReportChannelID':    { sel: '#stReportChannelID', kind: 'value' },
    'ssCheck':            { sel: '#stSsCheck', kind: 'check' },
    'criticalCheck':      { sel: '#stCriticalCheck', kind: 'check' },
    'discordUID':         { sel: '#stDiscordUID', kind: 'value' },
    'discordUIDCommands': { sel: '#stDiscordUIDCommands', kind: 'value' },
    'CriticalSSCheck':    { sel: '#stCriticalSSCheck', kind: 'check' },
    'AmuletSSCheck':      { sel: '#stAmuletSSCheck', kind: 'check' },
    'MachineSSCheck':     { sel: '#stMachineSSCheck', kind: 'check' },
    'BalloonSSCheck':     { sel: '#stBalloonSSCheck', kind: 'check' },
    'ViciousSSCheck':     { sel: '#stViciousSSCheck', kind: 'check' },
    'DeathSSCheck':       { sel: '#stDeathSSCheck', kind: 'check' },
    'PlanterSSCheck':     { sel: '#stPlanterSSCheck', kind: 'check' },
    'HoneySSCheck':       { sel: '#stHoneySSCheck', kind: 'check' },
    'HoneyUpdateSSCheck': { sel: '#stHoneyUpdateSSCheck', kind: 'check' },
    'CriticalErrorPingCheck':    { sel: '#stCriticalErrorPingCheck', kind: 'check' },
    'DisconnectPingCheck':       { sel: '#stDisconnectPingCheck', kind: 'check' },
    'GameFrozenPingCheck':       { sel: '#stGameFrozenPingCheck', kind: 'check' },
    'PhantomPingCheck':          { sel: '#stPhantomPingCheck', kind: 'check' },
    'UnexpectedDeathPingCheck':  { sel: '#stUnexpectedDeathPingCheck', kind: 'check' },
    'EmergencyBalloonPingCheck': { sel: '#stEmergencyBalloonPingCheck', kind: 'check' }
};

function initializeStatusTabHandlers() {
    Object.keys(STATUS_CONTROLS).forEach(function (key) {
        const cfg = STATUS_CONTROLS[key];
        $(document).on('change', cfg.sel, function () {
            if (cfg.kind === 'check') sendStatusUpdate(key, this.checked ? 1 : 0);
            else sendStatusUpdate(key, $(this).val());
            updateDiscordPanelUi();
        });
    });

    // Discord mode is a radio pair (0 = Webhook, 1 = Bot).
    $('input[name="stDiscordMode"]').on('change', function () {
        if (!this.checked) return;
        sendStatusUpdate('DiscordMode', this.id === 'stDiscordModeBot' ? 1 : 0);
        updateDiscordPanelUi();
    });

    const actionButtons = {
        '#stResetTotalStats': 'st-reset-total-stats'
    };
    Object.keys(actionButtons).forEach(function (sel) {
        $(document).on('click', sel, function () {
            if (window.ahkButtonClick) window.ahkButtonClick({ id: actionButtons[sel] });
        });
    });

    $('#btnClearStatusLog').on('click', function () { $('#statusLog').empty(); });

    updateDiscordPanelUi();
    console.log('[init] Status tab handlers initialized');
}

// Show/hide the webhook/bot fields (and dim dependent options) to mirror the
// classic Discord settings window. Purely presentational.
function updateDiscordPanelUi() {
    const isBot = $('#stDiscordModeBot').prop('checked');
    const discordEnabled = $('#stDiscordCheck').prop('checked');
    const ssEnabled = $('#stSsCheck').prop('checked');
    const pingEnabled = $('#stCriticalCheck').prop('checked');

    $('#stWebhookRow').toggle(!isBot);
    $('#stBotTokenRow').toggle(isBot);
    $('#stBotOnly').toggle(isBot);

    $('#stDiscordOptions').css('opacity', discordEnabled ? '' : '0.45');
    $('#stSsSubChecks').find('input').prop('disabled', !(discordEnabled && ssEnabled));
    $('#stPingSubChecks').find('input').prop('disabled', !(discordEnabled && pingEnabled));
}

function sendStatusUpdate(key, value) {
    if (suppressStatusSend) return;
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] status host not ready');
        return;
    }
    console.log('[ahk-send] status', key, value);
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'status', key: key, value: value }));
        if (promise && promise.then) {
            promise.then(function () { }, function (err) { console.warn('[ahk-send] status:', err); });
        }
    } catch (err) {
        console.warn('[ahk-send] status error:', err);
    }
}

function formatDuration(seconds) {
    seconds = parseInt(seconds, 10) || 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm ' : '') + s + 's';
}

// The classic Status Log control contains plain text written by nm_setStatus().
function renderStatusLog(text) {
    const $log = $('#statusLog');
    if (!$log.length) return;
    // The classic Status Log is plain text; normalise CRLF so #statusLog (white-space:
    // pre-wrap) renders one line per entry instead of collapsing them together.
    const value = ((text === null || typeof text === 'undefined') ? '' : String(text)).replace(/\r\n?/g, '\n');
    if ($log.data('lastLog') === value) return;
    $log.data('lastLog', value);
    $log.text(value);
    $log.scrollTop($log.prop('scrollHeight'));
}

function applyStatusFromAhk(key, value) {
    const prev = suppressStatusSend;
    suppressStatusSend = true;
    try {
        // read-only mirror of the classic status log
        if (key === '__Log') {
            renderStatusLog(value);
            return;
        }
        if (key === 'DiscordMode') {
            const id = (parseInt(value, 10) === 1) ? 'stDiscordModeBot' : 'stDiscordModeWebhook';
            $('input[name="stDiscordMode"]').prop('checked', false);
            $('#' + id).prop('checked', true);
            updateDiscordPanelUi();
            return;
        }
        const cfg = STATUS_CONTROLS[key];
        if (cfg) {
            if (cfg.kind === 'check') $(cfg.sel).prop('checked', !!value);
            else $(cfg.sel).val(value === null || typeof value === 'undefined' ? '' : value);
            updateDiscordPanelUi();
        } else {
            applyStatusStat(key, value);
        }
    } finally {
        suppressStatusSend = prev;
    }
}

/* ------------------------------------------------------------------ */
/* Statistics panel                                                    */
/* ------------------------------------------------------------------ */
/* The classic Status tab shows a two-column "Stats" group box (Total /
 * Session). We mirror it here. The panel is (re)built lazily the first
 * time any stat value arrives, so it works even if the one-off `init`
 * snapshot is missed — the 750 ms live poller always delivers the values. */

const STAT_ROWS = [
    { label: 'Runtime',            total: 'TotalRuntime',           session: 'SessionRuntime',           dur: true },
    { label: 'Gather',             total: 'TotalGatherTime',        session: 'SessionGatherTime',        dur: true },
    { label: 'Convert',            total: 'TotalConvertTime',       session: 'SessionConvertTime',       dur: true },
    { label: 'Vicious Kills',      total: 'TotalViciousKills',      session: 'SessionViciousKills' },
    { label: 'Boss Kills',         total: 'TotalBossKills',         session: 'SessionBossKills' },
    { label: 'Bug Kills',          total: 'TotalBugKills',          session: 'SessionBugKills' },
    { label: 'Planters Collected', total: 'TotalPlantersCollected', session: 'SessionPlantersCollected' },
    { label: 'Quests Complete',    total: 'TotalQuestsComplete',    session: 'SessionQuestsComplete' },
    { label: 'Disconnects',        total: 'TotalDisconnects',       session: 'SessionDisconnects' }
];

const STAT_KEYS = {};
STAT_ROWS.forEach(function (r) { STAT_KEYS[r.total] = r; STAT_KEYS[r.session] = r; });

const ST_STATS_CACHE = {};
let stStatsBuilt = false;

function statDisplayValue(row, value) {
    return row.dur ? formatDuration(value) : String(parseInt(value, 10) || 0);
}

function ensureStatsPanel() {
    if (stStatsBuilt && $('#stStatsPanel').children().length) return;
    let html = '<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">'
        + '<thead><tr><th></th><th class="text-end">Total</th><th class="text-end">Session</th></tr></thead><tbody>';
    STAT_ROWS.forEach(function (r) {
        html += '<tr><td>' + r.label + '</td>'
            + '<td class="text-end st-stat-value" data-stat="' + r.total + '">-</td>'
            + '<td class="text-end st-stat-value" data-stat="' + r.session + '">-</td></tr>';
    });
    html += '</tbody></table>';
    $('#stStatsPanel').html(html);
    stStatsBuilt = true;
    // Re-apply anything that arrived before the panel existed.
    Object.keys(ST_STATS_CACHE).forEach(function (k) {
        const row = STAT_KEYS[k];
        if (row) $('#stStatsPanel .st-stat-value[data-stat="' + k + '"]').text(statDisplayValue(row, ST_STATS_CACHE[k]));
    });
}

// Apply one Total*/Session* stat. Returns true when the key was a stat key.
function applyStatusStat(key, value) {
    const row = STAT_KEYS[key];
    if (!row) return false;
    ST_STATS_CACHE[key] = value;
    ensureStatsPanel();
    $('#stStatsPanel .st-stat-value[data-stat="' + key + '"]').text(statDisplayValue(row, value));
    return true;
}

function restoreStatusTabState(payload) {
    try {
        const data = JSON.parse(payload);
        ensureStatsPanel();
        for (const [key, value] of Object.entries(data)) {
            applyStatusFromAhk(key, value);
        }
        hasStatusInitApplied = true;
        console.log('[restore] Status tab state restored from AHK');
    } catch (e) {
        console.error('[restore-error] Failed to restore Status tab state:', e.message);
    }
}

function setupStatusMessageListener() {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            try {
                const message = event.data;
                const msg = (typeof message === 'string') ? JSON.parse(message) : message;
                if (msg && msg.type === 'init' && msg.status && !hasStatusInitApplied) {
                    restoreStatusTabState(JSON.stringify(msg.status));
                } else if (msg && msg.type === 'status') {
                    applyStatusFromAhk(msg.key, msg.value);
                }
            } catch (e) {
                console.warn('[ahk-msg] error processing status message:', e);
            }
        });
    }
}

$(document).ready(function () {
    if ($('#sidebar-status').length > 0) {
        initializeStatusTabHandlers();
        setupStatusMessageListener();
        console.log('Status tab handlers ready');
    }
});

window.statusTabHandlers = {
    initialize: initializeStatusTabHandlers,
    applyFromAhk: applyStatusFromAhk,
    restoreState: restoreStatusTabState,
    send: sendStatusUpdate
};
