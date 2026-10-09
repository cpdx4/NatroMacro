/*
 * patternInterpreter.js
 * ---------------------------------------------------------------------------
 * Renders a Natro pattern file (patterns\<name>.ahk) as an SVG trace for the
 * Gather tab animation.
 *
 * The pattern files are tiny AHK scripts built from a very small vocabulary:
 *
 *     name := expr                       ; variable assignment
 *     loop <expr> { ... }                ; repeat (A_Index = 1..N inside)
 *     if (<expr>) { ... }                ; conditional
 *     send "{Key down}" / "{Key up}"     ; press/release a movement key
 *     Walk(<expr> [, <tolerance>])       ; walk <expr> units in the held direction
 *     Sleep <ms> / HyperSleep(<ms>)      ; ignored (timing only)
 *
 * Movement keys are relative to the sprinkler/centre:
 *     TCFBKey -> +Y   AFCFBKey -> -Y   (toward / away from centre, forward-back)
 *     TCLRKey -> +X   AFCLRKey -> -X   (toward / away from centre, left-right)
 * Both axes are mirrored relative to the on-screen field map, so a pattern drawn
 * as-is matches what the macro actually does with "Invert Left/Right" and
 * "Invert Fwd/Back" OFF. The Invert checkboxes then mirror on top of this base.
 * When two axes are held at once the movement is diagonal; patterns pass the
 * hypotenuse to Walk(), so each axis gets distance / sqrt(2). (FwdKey/BackKey/
 * LeftKey/RightKey are accepted as aliases.)
 *
 * The source text is fetched once per pattern from AHK (the WebView can't read
 * ..\patterns directly) and cached, so re-rendering while dragging the sprinkler
 * or moving the sliders is pure in-memory JS and stays instant.
 */
(function () {
    'use strict';

    // Pattern units -> SVG pixels (a pattern distance of N units draws N*15 px).
    var WALK_SCALE = 15;
    var MAX_LOOP = 10000; // safety cap against a runaway loop count

    // name -> raw source text (null = file missing), name -> AST, cacheKey -> segments
    var textCache = Object.create(null);
    var astCache = Object.create(null);
    var segCache = Object.create(null);
    var pending = Object.create(null); // name -> { promise, resolve }

    function isKnown(name) {
        return Object.prototype.hasOwnProperty.call(textCache, name);
    }

    // ----------------------------------------------------------------------
    // Fetch pattern text from AHK (async, once per name)
    // ----------------------------------------------------------------------
    function bridge() {
        return (window.chrome && window.chrome.webview &&
                window.chrome.webview.hostObjects &&
                window.chrome.webview.hostObjects.ahkUpdateState) || null;
    }

    function requestPatternText(name) {
        if (isKnown(name)) return Promise.resolve(textCache[name]);
        if (pending[name]) return pending[name].promise;

        var entry = {};
        entry.promise = new Promise(function (resolve) { entry.resolve = resolve; });
        pending[name] = entry;

        var sent = false;
        try {
            var obj = bridge();
            if (obj) { obj.func(JSON.stringify({ type: 'patternRequest', key: name })); sent = true; }
        } catch (e) {
            console.warn('[pattern] request failed:', name, e);
        }
        if (!sent) {
            // No bridge yet: don't cache, so a later redraw can retry.
            delete pending[name];
            return Promise.resolve(undefined);
        }
        return entry.promise;
    }

    // Called by dynamicTabs.js when AHK replies with {type:'patternText',...}.
    function resolvePatternText(name, text) {
        textCache[name] = (typeof text === 'string' && text.length) ? text : null;
        var entry = pending[name];
        if (entry) {
            delete pending[name];
            entry.resolve(textCache[name]);
        }
    }

    // ----------------------------------------------------------------------
    // Expression evaluation (compiled + cached per unique expression string)
    // ----------------------------------------------------------------------
    var exprCache = Object.create(null);

    function compileExpr(src) {
        if (exprCache[src]) return exprCache[src];
        // AHK's Sqrt()/sqrt() -> JS Math.sqrt(); `**` already works the same.
        var js = src.replace(/\bSqrt\s*\(/gi, 'Math.sqrt(');
        var fn;
        try {
            // `with` keeps AHK's bare variable names working. The body created by
            // new Function runs in sloppy mode, so `with` is allowed.
            fn = new Function('$', 'with($){return (' + js + ');}');
        } catch (e) {
            console.warn('[pattern] bad expression:', src, e);
            fn = function () { return 0; };
        }
        exprCache[src] = fn;
        return fn;
    }

    function evalExpr(src, vars) {
        try {
            var v = compileExpr(src)(vars);
            return (typeof v === 'number' && isFinite(v)) ? v : 0;
        } catch (e) {
            console.warn('[pattern] eval failed:', src, e);
            return 0;
        }
    }

    // ----------------------------------------------------------------------
    // Parser: source text -> AST
    // ----------------------------------------------------------------------
    function stripComment(line) {
        var inStr = false, q = '';
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (inStr) { if (c === q) inStr = false; }
            else if (c === '"' || c === "'") { inStr = true; q = c; }
            else if (c === ';') return line.slice(0, i);
        }
        return line;
    }

    // Split on a top-level separator (commas), ignoring separators inside (), [], {}
    // and inside quoted strings. Patterns commonly pack several statements per line.
    function splitTopLevel(s, sep) {
        var depth = 0, inStr = false, q = '', out = [], cur = '';
        for (var i = 0; i < s.length; i++) {
            var c = s[i];
            if (inStr) { cur += c; if (c === q) inStr = false; continue; }
            if (c === '"' || c === "'") { inStr = true; q = c; cur += c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (depth === 0 && c === sep) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    }

    // Index of a top-level token (e.g. "&&"), or -1.
    function findTopLevel(s, token) {
        var depth = 0, inStr = false, q = '';
        for (var i = 0; i < s.length; i++) {
            var c = s[i];
            if (inStr) { if (c === q) inStr = false; continue; }
            if (c === '"' || c === "'") { inStr = true; q = c; continue; }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            if (depth === 0 && s.substr(i, token.length) === token) return i;
        }
        return -1;
    }

    // Strip enclosing parentheses only when the first '(' matches the final ')'.
    function stripOuterParens(s) {
        s = s.trim();
        while (s.length > 1 && s[0] === '(' && s[s.length - 1] === ')') {
            var depth = 0, ok = true;
            for (var i = 0; i < s.length; i++) {
                if (s[i] === '(') depth++;
                else if (s[i] === ')') { depth--; if (depth === 0 && i !== s.length - 1) { ok = false; break; } }
            }
            if (!ok) break;
            s = s.slice(1, -1).trim();
        }
        return s;
    }

    function parsePattern(text) {
        var root = { body: [], funcs: {} };
        var stack = [{ body: root.body, indent: -1, brace: false }];
        var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
        var top = function () { return stack[stack.length - 1]; };

        for (var i = 0; i < lines.length; i++) {
            var line = stripComment(lines[i]).replace(/\s+$/, '');
            var t = line.trim();
            if (!t) continue;
            var indent = line.length - line.replace(/^\s+/, '').length;
            var m;

            // Close indentation-based blocks that this line is no longer inside.
            while (stack.length > 1 && !top().brace && indent <= top().indent) stack.pop();
            if (t === '}') { if (stack.length > 1 && top().brace) stack.pop(); continue; }

            if ((m = /^loop\s+(.+?)\s*\{\s*$/i.exec(t))) {
                var lb = { t: 'loop', expr: m[1], body: [] }; top().body.push(lb);
                stack.push({ body: lb.body, indent: -1, brace: true }); continue;
            }
            if ((m = /^loop\s+(.+)$/i.exec(t))) {
                var li = { t: 'loop', expr: m[1], body: [] }; top().body.push(li);
                stack.push({ body: li.body, indent: indent, brace: false }); continue;
            }
            if ((m = /^if\s*\((.+)\)\s*\{\s*$/i.exec(t))) {
                var ib = { t: 'if', expr: m[1], body: [] }; top().body.push(ib);
                stack.push({ body: ib.body, indent: -1, brace: true }); continue;
            }
            if ((m = /^if\s*\((.+?)\)\s*$/i.exec(t))) {
                var ii = { t: 'if', expr: m[1], body: [] }; top().body.push(ii);
                stack.push({ body: ii.body, indent: indent, brace: false }); continue;
            }
            // Pattern-defined helper functions are recorded; their bodies are not run.
            if ((m = /^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{\s*$/.exec(t))) {
                var fb = { t: 'func', name: m[1], params: m[2], body: [] };
                root.funcs[m[1].toLowerCase()] = fb; top().body.push(fb);
                stack.push({ body: fb.body, indent: -1, brace: true }); continue;
            }
            if ((m = /^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*=>\s*(.+)$/.exec(t))) {
                var fx = { t: 'func', name: m[1], params: m[2], expr: m[3], body: [] };
                root.funcs[m[1].toLowerCase()] = fx; top().body.push(fx); continue;
            }

            // A single line can hold several comma-separated statements.
            var parts = splitTopLevel(t, ',');
            for (var j = 0; j < parts.length; j++) {
                var st = parts[j].trim();
                if (!st) continue;
                if ((m = /^([A-Za-z_]\w*)\s*:=\s*(.+)$/.exec(st))) { top().body.push({ t: 'assign', name: m[1], expr: m[2] }); continue; }
                if (/^send\b/i.test(st)) { top().body.push({ t: 'send', raw: st }); continue; }
                if ((m = /^walk\s*\((.*)\)\s*$/i.exec(st))) { top().body.push({ t: 'walk', expr: m[1].trim() }); continue; }
                if (/^(sleep|hypersleep)\b/i.test(st)) { top().body.push({ t: 'noop' }); continue; }
                if ((m = /^([A-Za-z_]\w*)\s*\((.*)\)\s*$/.exec(st))) { top().body.push({ t: 'call', name: m[1], args: m[2] }); continue; }
                top().body.push({ t: 'expr', raw: st });
            }
        }
        return root;
    }

    // ----------------------------------------------------------------------
    // Execution
    // ----------------------------------------------------------------------
    var KEY_AXIS = {
        tcfbkey: 'FB_T', fwdkey: 'FB_T',
        afcfbkey: 'FB_A', backkey: 'FB_A',
        tclrkey: 'LR_T', leftkey: 'LR_T',
        afclrkey: 'LR_A', rightkey: 'LR_A'
    };
    var SEND_RE = /([A-Za-z_]\w*)\s+"\s*(down|up)\b/gi;

    function applySend(raw, down) {
        SEND_RE.lastIndex = 0;
        var m;
        while ((m = SEND_RE.exec(raw))) {
            var axis = KEY_AXIS[m[1].toLowerCase()];
            if (axis) down[axis] = (m[2].toLowerCase() === 'down');
        }
    }

    function walk(distance, down, segs) {
        if (!distance) return;
        // Mirrored vs. the on-screen map (see header note).
        var vx = (down.LR_T ? 1 : 0) - (down.LR_A ? 1 : 0);
        var vy = (down.FB_T ? 1 : 0) - (down.FB_A ? 1 : 0);
        if (!vx && !vy) return;
        if (vx && vy) { vx /= Math.SQRT2; vy /= Math.SQRT2; }
        var dx = vx * distance * WALK_SCALE;
        var dy = vy * distance * WALK_SCALE;
        if (!dx && !dy) return;
        segs.push({ dx: dx, dy: dy });
    }

    // Map a bare key identifier ("LeftKey", "TCFBKey", ...) to its movement axis.
    function keyAxis(s) {
        var t = String(s).trim().replace(/^["']|["']$/g, '');
        return KEY_AXIS[t.toLowerCase()] || null;
    }

    function doWalk(distance, keys, state) {
        if (!distance) return;
        var down = {};
        for (var i = 0; i < keys.length; i++) down[keys[i]] = true;
        walk(distance, down, state.segs);
    }

    // dy_Walk(dist, KeyName[, KeyName2])  /  nm_Walk(...)  /  Walk(...)
    function execWalkArgs(argsStr, vars, state) {
        var args = splitTopLevel(argsStr, ',');
        var dist = evalExpr(args[0], vars);
        var keys = [];
        for (var i = 1; i < args.length; i++) {
            var ax = keyAxis(args[i]);
            if (ax) keys.push(ax);
        }
        doWalk(dist, keys, state);
    }

    // walkSeq([[dist, KeyName[, KeyName2]], ...])  -- the compact pattern helper.
    function execWalkSeq(argsStr, vars, state) {
        var body = argsStr.trim();
        if (body[0] === '[' && body[body.length - 1] === ']') body = body.slice(1, -1);
        var items = splitTopLevel(body, ',');
        for (var i = 0; i < items.length; i++) {
            var el = items[i].trim();
            if (!el) continue;
            if (el[0] === '[' && el[el.length - 1] === ']') el = el.slice(1, -1);
            var parts = splitTopLevel(el, ',');
            var dist = evalExpr(parts[0], vars);
            var keys = [];
            for (var k = 1; k < parts.length; k++) {
                var ax = keyAxis(parts[k]);
                if (ax) keys.push(ax);
            }
            doWalk(dist, keys, state);
        }
    }

    function execOneStatement(st, vars, state) {
        st = st.trim();
        if (!st) return;
        var idx = findTopLevel(st, '&&');
        if (idx >= 0) {
            var cond = stripOuterParens(st.slice(0, idx));
            var rest = stripOuterParens(st.slice(idx + 2));
            if (evalExpr(cond, vars)) execStatementList(rest, vars, state);
            return;
        }
        var m = /^([A-Za-z_]\w*)\s*\((.*)\)\s*$/.exec(st);
        if (m) {
            var nm = m[1].toLowerCase();
            if (nm === 'walkseq') execWalkSeq(m[2], vars, state);
            else if (nm === 'dy_walk' || nm === 'nm_walk' || nm === 'walk') execWalkArgs(m[2], vars, state);
            // cam / ds / nm_camerarotation / toggle ... -> no movement, ignored
            return;
        }
        if ((m = /^([A-Za-z_]\w*)\s*:=\s*(.+)$/.exec(st))) { vars[m[1]] = evalExpr(m[2], vars); return; }
    }

    function execStatementList(str, vars, state) {
        var parts = splitTopLevel(str, ',');
        for (var i = 0; i < parts.length; i++) execOneStatement(parts[i], vars, state);
    }

    function execNodes(nodes, vars, state) {
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            switch (n.t) {
                case 'assign':
                    vars[n.name] = evalExpr(n.expr, vars);
                    break;
                case 'loop': {
                    var count = Math.round(evalExpr(n.expr, vars));
                    if (!(count > 0)) break;
                    if (count > MAX_LOOP) count = MAX_LOOP;
                    var prev = vars.A_Index;
                    for (var k = 1; k <= count; k++) {
                        vars.A_Index = k;
                        execNodes(n.body, vars, state);
                    }
                    vars.A_Index = prev;
                    break;
                }
                case 'if':
                    if (evalExpr(n.expr, vars)) execNodes(n.body, vars, state);
                    break;
                case 'send':
                    applySend(n.raw, state.down);
                    break;
                case 'walk':
                    walk(evalExpr(n.expr, vars), state.down, state.segs);
                    break;
                case 'call':
                    execOneStatement(n.name + '(' + n.args + ')', vars, state);
                    break;
                case 'expr':
                    execOneStatement(n.raw, vars, state);
                    break;
                default:
                    break; // noop / func / unknown
            }
        }
    }

    function interpret(name, text, reps, size) {
        var ast = astCache[name];
        if (!ast) { ast = parsePattern(text); astCache[name] = ast; }
        var vars = { size: size, reps: reps, facingcorner: 0, A_Index: 0 };
        var state = {
            down: { FB_T: false, FB_A: false, LR_T: false, LR_A: false },
            segs: []
        };
        try {
            execNodes(ast.body, vars, state);
        } catch (e) {
            console.warn('[pattern] interpret failed:', name, e);
        }
        return state.segs;
    }

    // ----------------------------------------------------------------------
    // Public API used by dynamicTabs.js
    // ----------------------------------------------------------------------
    // Returns [{dx,dy}, ...] for the pattern, in SVG pixels, relative to the
    // start point. If the source isn't cached yet it kicks off a fetch and calls
    // onReady() once it arrives (so the caller can redraw). A missing file (or
    // one that hasn't loaded) yields [] -> nothing is drawn (blank).
    window.nmGetPatternSegments = function (name, reps, size, onReady) {
        if (!name) return [];
        reps = parseInt(reps, 10) || 1;
        size = parseFloat(size) || 1;

        var key = name + '|' + reps + '|' + size;
        if (Object.prototype.hasOwnProperty.call(segCache, key)) return segCache[key];

        if (isKnown(name)) {
            if (!textCache[name]) return []; // known missing -> stay blank
            var segs = interpret(name, textCache[name], reps, size);
            segCache[key] = segs;
            return segs;
        }

        // Not fetched yet.
        requestPatternText(name).then(function (text) {
            if (typeof text === 'string' && text && typeof onReady === 'function') onReady();
        });
        return [];
    };

    window.nmResolvePatternText = resolvePatternText;
})();
