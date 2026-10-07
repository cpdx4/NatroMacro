/*
 * bridge.js
 * ---------------------------------------------------------------------------
 * Shared WebView2 <-> AutoHotkey bridge for the Modern UI.
 *
 * WHY THIS EXISTS
 * Every tab handler used to re-implement the same boilerplate:
 *   - a `window.chrome && window.chrome.webview && ...hostObjects...` guard
 *   - `obj.func(JSON.stringify({ type: 'x', key, value }))` with a try/catch and
 *     a promise-rejection swallow
 *   - a `window.chrome.webview.addEventListener('message', ...)` listener that
 *     parses string-or-object payloads and routes `init` vs live messages
 * This module centralises all of that so each tab file only declares WHAT it
 * does, not HOW the transport works.
 *
 * PROTOCOL
 * Every message sent to AHK is a JSON object with at least:
 *   { v: <protocol version>, type: <string>, ...payload }
 * AHK tolerates a missing `v` (legacy senders) but logs a warning when the
 * version is present and newer than it understands.
 *
 * PUBLIC API (window.AhkBridge)
 *   PROTOCOL_VERSION                   number
 *   webview()                          the chrome.webview object or null
 *   hostObject(name)                   a host object (e.g. 'ahkUpdateState') or null
 *   ready(name?)                       true when the default host object exists
 *   send(hostName, payload)            JSON-send to a named host object
 *   updateState(type, key, value)      the common {type,key,value} send
 *   buttonClick(id)                    fire the ahkButtonClick host object
 *   gatherAction(action, num)          fire the ahkGatherAction host object
 *   formSubmit(source, form)           fire the ahkFormSubmit host object
 *   parse(raw)                         normalise a string/object message, or null
 *   registerTab(type, initKey, h)      route init/live messages to a tab module
 *   onMessage(handler)                 low-level: every parsed message
 */
(function () {
    'use strict';

    // Bump only on a breaking change to the message contract. AHK mirrors this in
    // BootstrapGUI/lib/Bridge.ahk (nm_BridgeProtocolVersion).
    var PROTOCOL_VERSION = 1;

    function webview() {
        return (window.chrome && window.chrome.webview) || null;
    }

    function hostObject(name) {
        var wv = webview();
        return (wv && wv.hostObjects && wv.hostObjects[name]) || null;
    }

    function ready(name) {
        return !!hostObject(name || 'ahkUpdateState');
    }

    // Send `payload` (an object) to the named host object. Returns the host call's
    // promise when there is one, so callers that care can await it; otherwise null.
    function send(hostName, payload) {
        var obj = hostObject(hostName);
        if (!obj) {
            console.warn('[bridge] host object not ready: ' + hostName);
            return null;
        }
        var envelope = payload || {};
        if (envelope.v == null) envelope.v = PROTOCOL_VERSION;
        try {
            var promise = obj.func(JSON.stringify(envelope));
            if (promise && promise.then) {
                promise.then(function () { }, function (err) {
                    console.warn('[bridge] ' + hostName + ' call failed:', err);
                });
            }
            return promise;
        } catch (err) {
            console.warn('[bridge] ' + hostName + ' send error:', err);
            return null;
        }
    }

    // The most common message shape: a single setting change.
    function updateState(type, key, value) {
        return send('ahkUpdateState', { type: type, key: key, value: value });
    }

    function buttonClick(id) {
        // `window.ahkButtonClick` is provided by dynamicTabs.js for backwards
        // compatibility; prefer it when present so button routing stays single-sourced.
        if (typeof window.ahkButtonClick === 'function') {
            window.ahkButtonClick({ id: id });
            return;
        }
        send('ahkButtonClick', { id: id });
    }

    function gatherAction(action, num) {
        return send('ahkGatherAction', { action: action, num: num });
    }

    function formSubmit(source, form) {
        return send('ahkFormSubmit', { source: source, form: form });
    }

    // Normalise an event.data that may be a JSON string, an object, or junk.
    function parse(raw) {
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.warn('[bridge] bad JSON from AHK:', e);
                return null;
            }
        }
        return raw || null;
    }

    // Every parsed message, for modules that need raw access (e.g. dynamicTabs.js
    // which routes several message types through one switch).
    function onMessage(handler) {
        var wv = webview();
        if (!wv) return;
        wv.addEventListener('message', function (event) {
            var msg = parse(event.data);
            if (msg) handler(msg, event);
        });
    }

    // Register a standard per-tab module. Routes:
    //   { type: 'init', <initKey>: {...} }  -> handlers.restoreState(JSON string)
    //   { type: <type>, key, value }        -> handlers.applyFromAhk(key, value)
    // The JSON-string round-trip matches the historical per-tab restoreState
    // signature (which parsed a string) so existing restore functions are reusable.
    function registerTab(type, initKey, handlers) {
        handlers = handlers || {};
        onMessage(function (msg) {
            try {
                if (msg.type === 'init') {
                    if (initKey && msg[initKey] != null && handlers.restoreState) {
                        handlers.restoreState(JSON.stringify(msg[initKey]));
                    }
                } else if (msg.type === type) {
                    if (handlers.applyFromAhk) handlers.applyFromAhk(msg.key, msg.value);
                }
            } catch (e) {
                console.warn('[bridge] handler error for type "' + type + '":', e);
            }
        });
    }

    window.AhkBridge = {
        PROTOCOL_VERSION: PROTOCOL_VERSION,
        webview: webview,
        hostObject: hostObject,
        ready: ready,
        send: send,
        updateState: updateState,
        buttonClick: buttonClick,
        gatherAction: gatherAction,
        formSubmit: formSubmit,
        parse: parse,
        onMessage: onMessage,
        registerTab: registerTab
    };
})();
