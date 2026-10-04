/* Natro2027GUI - ui\js\app.js
   Vanilla QuickJS (Sciter.JS) - no jQuery, no Bootstrap.
   Bridge (MVP): AHK reads window.__n2027Queue on a timer and applies each
   command via the 0x5552/0x5553 settings bus. AHK pushes init state by calling
   window.__n2027Init(...) through Sciter.Eval. */
(function () {
    'use strict';

    var el = function (id) { return document.getElementById(id); };

    function engineInfo() {
        var feats = {
            bigint: typeof 1n === 'bigint',
            arrow: (function () { return 1; })() === 1,
            optionalChaining: ({} ?.a) === undefined,
            nullish: (undefined ?? 'ok') === 'ok',
            templateLiteral: ('1' + 1 === '11'),
            fetch: typeof globalThis.fetch === 'function'
        };
        var ver = 'Sciter.JS (QuickJS)';
        try { ver = 'sciter ' + Window.this.engineVersion(); } catch (e) {}
        el('engine').textContent = ver + '  features: ' + JSON.stringify(feats);
    }

    // AHK -> JS: init payload (called by the entry point via Sciter.Eval).
    window.__n2027Init = function (data) {
        data = data || {};
        if (data.checkNight !== undefined)
            el('checkNight').textContent = String(data.checkNight);
        if (data.version !== undefined)
            el('meta').textContent = 'version ' + data.version;
    };

    // JS -> AHK: pending command queue, drained by the entry point poller.
    window.__n2027Queue = window.__n2027Queue || [];
    function send(cmd) { window.__n2027Queue.push(cmd); }

    var toggle = el('toggleNight');
    toggle.addEventListener('change', function () {
        var v = this.checked ? 1 : 0;
        send({ key: 'CheckNight', value: v, section: 'Settings' });
        el('status').textContent = 'queued CheckNight=' + v;
    });

    engineInfo();
})();
