
// hide the Tab template upon page load
// (we could have started it hidden, but it's easier to manage in a WYSIWYG HTML editor if it's visible)
$(document).ready(function() { $('#tab-content-placeholder').hide(); $('#GatherTabTemplate').hide(); });

// Tooltips
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
  return new bootstrap.Tooltip(tooltipTriggerEl)
})

const CLIENT_VERSION = 'bootstrap-collect-sync-004';
console.log('[ui-version]', CLIENT_VERSION);


// Gather: Variables
var tabLimit = 3;


// this function replaces the Tab template with the actual template
// example:  strawberry field, tab # 2

function replaceTabContents(fieldName, tabNumber, htmlCodeToModify){

    var result = htmlCodeToModify;

    // Create a new javascript Map object that defines key-value pairs to replace (OLD, NEW)
    var replaceMap = new Map();
        replaceMap.set(/placeholder_map.png/g, fieldName+"_map.png"); // replace the template name with a valid field name (eg: strawberry_map.png)
        replaceMap.set(/-tab-0/g, "-tab-"+tabNumber); // anything *-tab-0 is a template. replace it with a valid tab number (eg: -tab-2)
    // Now, iterate through each and replace OLD with NEW.  '/g' means to replace all occurrences
    replaceMap.forEach(function (newString, old) {
        result = result.replace(RegExp(old), newString);
        });

    // return the replaced content
    return result;
};


// this function draws a line on the field at the X,Y coordinates of the sprinkler
// it runs everytime the sprinkler is placed/moved
function drawPathSVG(tabNumber){

    length = $('#length-number-tab-'+ tabNumber).val();
    width = $('#width-number-tab-'+ tabNumber).val();
    rotation = $('#rotate-number-tab-'+ tabNumber).val();
    startX = $('#draggableSprinkler-tab-'+ tabNumber).position().left;
    startY = $('#draggableSprinkler-tab-'+ tabNumber).position().top;
    spacingDelay = 274;
    facingcorner = 0;
    invertLR = $('#invert-left-right-tab-' + tabNumber).is(':checked');
    invertFB = $('#invert-fwd-back-tab-' + tabNumber).is(':checked');

    // clear the previous animation if it's running (ie: animation was running, and user moved it)

    // clear any previous paths
    $("#pathSVG-tab-" + tabNumber).empty();

    // Un-hide the moving ball
    $("#pathBall-tab-" + tabNumber).show() 

    var OffsetX = startX  + 20;
    var OffsetY = startY + 31;

    // find the SVG placeholder for the tab we're targeting
    svg = document.getElementById("pathSVG-tab-" + tabNumber);
    ns = "http://www.w3.org/2000/svg";


    var reps = parseInt(width, 10) || 1; // Width slider -> pattern `reps`
    var size = parseFloat(length) || 1;  // Length slider -> pattern `size`
    const rotationMultiplier = 45; // every 1 rotation is 45 degrees
    rotationAngle = rotation * rotationMultiplier; // calculate the angle

    if(invertLR){ invertValueX = '-1'} // if Left/Right should be inverted
    else{ invertValueX = '1'};
    if(invertFB){ invertValueY = '-1'} // if Fwd/Back should be inverted
    else{ invertValueY = '1'};


    // Render the selected pattern (patterns\<name>.ahk) as an SVG trace. The
    // source is fetched once from AHK and cached; interpreting it is pure JS so
    // dragging the sprinkler / moving the sliders redraws instantly. If the text
    // isn't available yet (or the file is missing) nothing is drawn (blank), and
    // we redraw once it arrives.
    var patternName = $('#pattern-tab-' + tabNumber).find('option:selected').text().trim();
    var segments = (window.nmGetPatternSegments)
        ? window.nmGetPatternSegments(patternName, reps, size, function () { drawPathSVG(tabNumber); })
        : [];

    var svgContents = "m " + OffsetX + " " + OffsetY;
    for (var segIndex = 0; segIndex < segments.length; segIndex++) {
        svgContents += " l " + segments[segIndex].dx + " " + segments[segIndex].dy;
    }


    // setup the rest of the path attributes that make up the SVG
    path = document.createElementNS(ns,'path');
    path.setAttribute('id', "path-solid-tab-"+tabNumber)
    path.setAttribute('d', svgContents); //set the SVG contents
    path.setAttribute('fill', "none"); // we don't want to fill in the shape, just outline
    path.setAttribute('stroke', "tomato"); // color of the line
    path.setAttribute('stroke-width', "4"); // how wide the line should be
    path.setAttribute('transform', "rotate(" + rotationAngle +") scale(" + invertValueX + ", " + invertValueY + ")");
    path.setAttribute('transform-origin', OffsetX + ' ' + OffsetY);
    svg.appendChild(path); // add the path to the SVG

    // setup the rest of the path attributes that make up the SVG
    path2 = document.createElementNS(ns,'path');
    path2.setAttribute('id', "path-dotted-tab-"+tabNumber)
    path2.setAttribute('d', svgContents); //set the SVG contents
    path2.setAttribute('fill', "none"); // we don't want to fill in the shape, just outline
    path2.setAttribute('stroke', "yellow"); // color of the line
    path2.setAttribute('stroke-width', "6"); // how wide the line should be
    path2.setAttribute('transform', "rotate(" + rotationAngle +") scale(" + invertValueX + ", " + invertValueY + ")");
    path2.setAttribute('transform-origin', OffsetX + ' ' + OffsetY);
    svg.appendChild(path2); // add the path to the SVG


    // Draw a dash (1 marching ant) on the SVG
    svgpath = $('#path-dotted-tab-' + tabNumber).get(0);
    pathLength = svgpath.getTotalLength();
    // Fixed marching-ant speed for EVERY pattern. It is the speed the previous
    // code produced for the "Lines" pattern at Width 4 / Length 1: that path is
    // 2880 px and was traversed in 5000 ms -> 0.576 px/ms (= 576 px/s). Using a
    // constant means pattern name / Length / Width no longer change the speed.
    // Reduced by 30% (0.576 * 0.7 = 0.4032 px/ms) to slow the marching ants.
    const FIXED_ANT_SPEED = 0.4032; // SVG px per millisecond
    animationSpeed = FIXED_ANT_SPEED;
    let dashOffset = 0;
    startTime = performance.now(); // Get the start time
    targetTime = startTime + 15000; // When to stop the animation (15 seconds)
    const animate = (timestamp) => {
        const elapsed = timestamp - startTime;
        // March the ant BACKWARDS along the path: start at the far end and move
        // towards the sprinkler. (Subtracting makes the offset decrease over time.)
        dashOffset = pathLength - elapsed * animationSpeed;
        svgpath.style.strokeDasharray = "10 " + pathLength; // Width of ants, space between them
        svgpath.style.strokeDashoffset = dashOffset;
        if (performance.now() < targetTime) {
            requestAnimationFrame(animate); // Continue animation until the target time is reached
        }
        else{

            $('#path-dotted-tab-' + tabNumber).remove(); // delete the yellow ant
        }
    };
    requestAnimationFrame(animate); // Start the animation

}


function buildTab (fieldName, settings, fieldNum) {

        // increment the tab number
        var tabNumber = $('#gather-tab-items li').length+1;

        // check if we're at the tab limit
        if (tabNumber > tabLimit){
            // tab limit exceeded. show message and return from the function
            $('#GatherWarningMessage').show();
            return false;
        }

        // Remember which AHK field number (FieldName1..3) this web tab maps to. When it is
        // not supplied (e.g. the "+ add field" buttons) use the next free field slot, else
        // fall back to the tab position. Recording this explicitly is what keeps duplicate
        // fields (Strawberry x3) from all resolving to field 1.
        if (!fieldNum) {
            fieldNum = 0;
            for (let f = 1; f <= tabLimit; f++) {
                if (window.gatherTabFieldNums.indexOf(f) === -1) { fieldNum = f; break; }
            }
            if (!fieldNum) fieldNum = tabNumber;
        }
        window.gatherTabFieldNums[tabNumber - 1] = fieldNum;

        // create the header of the tab with the field image
        $('<li class="nav-item"><a href="#gather-tab-'+tabNumber+'" class="nav-link" data-bs-toggle="tab"><img src="assets/img/fieldIcons/'+fieldName+'.png" style="width: 40px;height: 40px;" /></a></li>').appendTo('#gather-tab-items');

        // create the tab content, replacing contents with the field-specific info (field image)
        var htmlCodeToSearch = $('#tab-pane-template').html();
        $('<div class="tab-pane" id="gather-tab-'+tabNumber+'">'+replaceTabContents(fieldName,tabNumber,htmlCodeToSearch)+'</div>').appendTo('#gather-tab-content');

        // make the new tab active
        $('#gather-tab-items a:last').tab('show');

        // Bootstrap tooltips do NOT survive cloning (the Tooltip instance lives on the
        // original template element), so initialise them for this freshly built tab.
        var gatherTipEls = [].slice.call(document.querySelectorAll('#gather-tab-' + tabNumber + ' [data-bs-toggle="tooltip"]'));
        gatherTipEls.forEach(function (el) { bootstrap.Tooltip.getOrCreateInstance(el); });

        // create the draggable sprinkler
        $('#draggableSprinkler-tab-'+tabNumber).draggable({
            grid: [ 10, 10 ], // how many steps the sprinkler takes when you drag it
            containment: '#snaptarget-tab-'+tabNumber, // sprinkler must stay within these boundaries
            scroll: false,
            revert: "invalid",
            scope: "items"
        });

        // create a droppable event on the field map (snaptarget) that gets the sprinkler location and draws/animates the path
        $('#snaptarget-tab-'+tabNumber).droppable({
            scope: "items",
            drop: function (event, ui) {
                // find out where the sprinkler was dropped
                var pos = ui.draggable.offset(), dPos = $(this).offset();
                //alert("Uncorrected Sprinkler Drop location: " + ", Top: " + (pos.top - dPos.top) + ", Left: " + (pos.left - dPos.left));

                var sprinklerDropLeft = (pos.left - dPos.left) + GATHER_SPRINKLER_OFFSET_X; //left of canvas minus dropped position, centered to middle of sprinkler
                var sprinklerDropTop = (pos.top - dPos.top) + GATHER_SPRINKLER_OFFSET_Y; //top of canvas minus dropped position, centered to middle of sprinkler

                // Convert the drop point into the classic Gather sprinkler settings (a 3x3
                // compass cell + a 1-10 distance from the centre) and push both to AHK. AHK
                // mirrors them into the classic GUI's "Sprinkler" text + distance UpDown.
                var res = sprinklerFromDropPoint(sprinklerDropLeft, sprinklerDropTop, $(this).width(), $(this).height());
                var fnum = gatherFieldNumForTab(tabNumber);
                window.gatherSprinklerState = window.gatherSprinklerState || {};
                window.gatherSprinklerState[fnum] = { loc: res.loc, dist: res.dist };
                sendGatherFieldToAhk(fnum, 'sprinkloc', res.loc);
                sendGatherFieldToAhk(fnum, 'sprdist', res.dist);

                //alert("Corrected Sprinkler Drop location: " + ", Top: " + sprinklerDropTop + ", Left: " + sprinklerDropLeft);
                // draw the path & animate it
                drawPathSVG(tabNumber,sprinklerDropLeft,sprinklerDropTop);
            }
        });

        // make sprinkler appear on top of the map (snaptarget) instead of hidden behind it
        $('#draggableSprinkler-tab-'+tabNumber).on("click",function(){
            $('#snaptarget-tab-'+tabNumber).css('z-index',0);
            $(this).css('z-index',1);
        });

        // hide the ball that moves along the path. (We'll show it when when we draw the path)
        $("#pathBall-tab-" + tabNumber).hide()

        // draw the path, using defaults (undefined)
        // TODO: Read from saved location and pass that instead of default (undefined) values
        drawPathSVG(tabNumber);
        
        // Width slider dragged
        $('#width-slider-tab-' + tabNumber + ', #width-number-tab-' + tabNumber).on('input', function() {
            $('#width-number-tab-' + tabNumber).val( $(this).val() )
            $('#width-slider-tab-' + tabNumber).val( $(this).val() )
            drawPathSVG(tabNumber);
        });

        // Length slider dragged
        $('#length-slider-tab-' + tabNumber + ', #length-number-tab-' + tabNumber).on('input', function() {
            $('#length-number-tab-' + tabNumber).val( $(this).val() )
            $('#length-slider-tab-' + tabNumber).val( $(this).val() )
            drawPathSVG(tabNumber);
        });

        // Rotate left button clicked
        $('#rotate-left-tab-' + tabNumber).on('click', function() {
            var currentRotation = $('#rotate-number-tab-' + tabNumber).val();
            if( currentRotation > -4){ // don't exceed -4 in value
                currentRotation--
            }
            $('#rotate-number-tab-' + tabNumber).val(currentRotation); // set the input field to the new value
            drawPathSVG(tabNumber);
        });

        // Rotate right button clicked
        $('#rotate-right-tab-' + tabNumber).on('click', function() {
            var currentRotation = $('#rotate-number-tab-' + tabNumber).val();
            if( currentRotation < 4){ // don't exceed 4 in value
                currentRotation++
            }
            $('#rotate-number-tab-' + tabNumber).val(currentRotation); // set the input field to the new value
            drawPathSVG(tabNumber);
        });
        
        // Input field to rotate was clicked, redraw
        $('#rotate-number-tab-' + tabNumber).on('input', function() {
            drawPathSVG(tabNumber);
        });

        // Toggles/checkboxes to invert left/right or forward/back was clicked, redraw
        $('#invert-left-right-tab-' + tabNumber + ', #invert-fwd-back-tab-' + tabNumber).on('input', function() {
            drawPathSVG(tabNumber);
        });

            applyGatherTabSettings(tabNumber, settings || {});
            bindGatherTabControls(tabNumber);
            // Redraw now that the saved pattern/size have been applied (the earlier
            // drawPathSVG call used the template defaults).
            drawPathSVG(tabNumber);
            setTimeout(sendGatherFieldsToAhk, 10);

}

/* ---- Gather per-tab sync helpers ---- */
window.gatherFieldNames = window.gatherFieldNames || { 1: 'None', 2: 'None', 3: 'None' };
/* Web tab position (index 0 = tab 1) -> AHK field number (FieldName1..3). The two can
   differ when an earlier slot is "None" (e.g. FieldName1=None, FieldName2=Strawberry),
   so record the mapping when tabs are built instead of guessing it from the field name.
   Guessing breaks as soon as the same field is used twice (Strawberry x3), because every
   duplicate then resolves to the first matching slot. */
window.gatherTabFieldNums = window.gatherTabFieldNums || [];
const GATHER_SIZE_TO_NUM = { XS: 1, S: 2, M: 3, L: 4, XL: 5 };
const GATHER_NUM_TO_SIZE = { 1: 'XS', 2: 'S', 3: 'M', 4: 'L', 5: 'XL' };

function gatherFieldIdForTab(tabNumber) {
    const src = $('#gather-tab-items li').eq(tabNumber - 1).find('img').first().attr('src') || '';
    const m = /fieldIcons\/([^\.]+)\.png/i.exec(src);
    return m ? m[1].toLowerCase() : '';
}
function gatherFieldNumForTab(tabNumber) {
    const mapped = window.gatherTabFieldNums[tabNumber - 1];
    if (mapped) return mapped;
    return tabNumber;
}
function gatherTabNumberForFieldNum(num) {
    const n = parseInt(num, 10);
    if (!n) return 0;
    for (let i = 0; i < window.gatherTabFieldNums.length; i++) {
        if (window.gatherTabFieldNums[i] === n) return i + 1;
    }
    // Fallback for tabs built before the mapping was recorded: match by field name.
    const want = (window.gatherFieldNames[n] || '').toLowerCase().replace(/\s+/g, '');
    if (!want || want === 'none') return 0;
    let found = 0;
    $('#gather-tab-items li').each(function (i) {
        const src = $(this).find('img').first().attr('src') || '';
        const m = /fieldIcons\/([^\.]+)\.png/i.exec(src);
        if (m && m[1].toLowerCase() === want) { found = i + 1; return false; }
    });
    return found;
}
window.gatherFieldNumForTab = gatherFieldNumForTab;
window.gatherTabNumberForFieldNum = gatherTabNumberForFieldNum;

function sendGatherFieldToAhk(num, key, value) {
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) return;
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var p = obj.func(JSON.stringify({ type: 'gatherField', num: num, key: key, value: value }));
        if (p && p.then) p.then(function () { }, function (e) { console.warn('[ahk-send] gatherField:', e); });
    } catch (e) { console.warn('[ahk-send] gatherField error:', e); }
}

/* ---- Gather sprinkler map <-> classic location/distance ----
   The classic Gather tab stores the sprinkler as a compass position (e.g. "Upper Left")
   plus a distance 1-10 from the field centre (FieldSprinklerLocN / FieldSprinklerDistN).
   The web map stores it as a pixel point. Dropping the sprinkler converts that point to
   (loc, dist) and pushes both to AHK, which mirrors them into the classic GUI. The
   reverse conversion keeps the marker in step when the classic GUI (or a saved profile)
   changes. */
// Classic enum -> unit direction from the centre of the field.
const GATHER_SPRINKLER_DIR = {
    'Center':      [0, 0],
    'Upper':       [0, -1],
    'Upper Left':  [-0.70710678, -0.70710678],
    'Upper Right': [0.70710678, -0.70710678],
    'Left':        [-1, 0],
    'Right':       [1, 0],
    'Lower':       [0, 1],
    'Lower Left':  [-0.70710678, 0.70710678],
    'Lower Right': [0.70710678, 0.70710678]
};
// Sprinkler top-left -> centre offset (must match the values used by the drop handler).
const GATHER_SPRINKLER_OFFSET_X = 20;
const GATHER_SPRINKLER_OFFSET_Y = 31;

/* Split the field into a 3x3 grid and name the cell the normalized point (0..1) is in. */
function sprinklerLocFromNorm(x, y) {
    const col = x < 1 / 3 ? 'Left' : (x < 2 / 3 ? '' : 'Right');
    const row = y < 1 / 3 ? 'Upper' : (y < 2 / 3 ? '' : 'Lower');
    const loc = [row, col].filter(function (s) { return s; }).join(' ');
    return loc || 'Center';
}

/* Normalized distance from the centre, scaled to the classic 1-10 distance (clamped). */
function sprinklerDistFromNorm(x, y) {
    const d = Math.round(Math.sqrt(Math.pow(x - 0.5, 2) + Math.pow(y - 0.5, 2)) * 10);
    if (!isFinite(d)) return 1;
    return Math.max(1, Math.min(10, d));
}

/* Marker point (relative to the map's top-left) -> {loc, dist, x, y}. */
function sprinklerFromDropPoint(left, top, width, height) {
    const x = Math.max(0, Math.min(1, width > 0 ? left / width : 0.5));
    const y = Math.max(0, Math.min(1, height > 0 ? top / height : 0.5));
    return { loc: sprinklerLocFromNorm(x, y), dist: sprinklerDistFromNorm(x, y), x: x, y: y };
}

/* Classic (loc, dist) -> representative normalized point (inverse of the grid split). */
function normPointFromLocDist(loc, dist) {
    const dir = GATHER_SPRINKLER_DIR[loc] || [0, 0];
    const r = Math.max(0, Math.min(10, parseInt(dist, 10) || 0)) / 10;
    return {
        x: Math.max(0, Math.min(1, 0.5 + dir[0] * r)),
        y: Math.max(0, Math.min(1, 0.5 + dir[1] * r))
    };
}

/* Move a tab's sprinkler marker to a normalized point. If the field-map <img> has not
   finished loading yet the placement is retried on its 'load' event. */
function placeSprinklerAtNorm(n, xNorm, yNorm) {
    const $map = $('#snaptarget-tab-' + n), $sp = $('#draggableSprinkler-tab-' + n);
    if (!$map.length || !$sp.length) return;
    const put = function () {
        const w = ($map[0].naturalWidth) || $map.width();
        const h = ($map[0].naturalHeight) || $map.height();
        if (!w || !h) return false;
        $sp.css({
            left: Math.round(xNorm * w - GATHER_SPRINKLER_OFFSET_X),
            top: Math.round(yNorm * h - GATHER_SPRINKLER_OFFSET_Y)
        });
        return true;
    };
    if (!put()) $map.off('load.nmSprinkler').on('load.nmSprinkler', function () { if (put()) drawPathSVG(n); });
}

/* What the marker currently represents, or null if the map size isn't known yet. */
function sprinklerStateFromMarker(n) {
    const $map = $('#snaptarget-tab-' + n), $sp = $('#draggableSprinkler-tab-' + n);
    if (!$map.length || !$sp.length) return null;
    const w = ($map[0].naturalWidth) || $map.width();
    const h = ($map[0].naturalHeight) || $map.height();
    if (!w || !h) return null;
    const p = $sp.position();
    return sprinklerFromDropPoint(p.left + GATHER_SPRINKLER_OFFSET_X, p.top + GATHER_SPRINKLER_OFFSET_Y, w, h);
}

/* Remember a field's (loc, dist) and move its marker, unless the marker already shows
   exactly that pair (which is the case for the classic->web echo of our own drop). */
function applySprinklerLocDist(fieldNum) {
    const n = window.gatherTabNumberForFieldNum ? window.gatherTabNumberForFieldNum(fieldNum) : parseInt(fieldNum, 10);
    if (!n) return;
    const st = window.gatherSprinklerState = window.gatherSprinklerState || {};
    const s = st[fieldNum];
    if (!s || s.loc === undefined || s.dist === undefined) return;
    const cur = sprinklerStateFromMarker(n);
    if (cur && cur.loc === s.loc && Number(cur.dist) === Number(s.dist)) return;
    const pt = normPointFromLocDist(s.loc, s.dist);
    placeSprinklerAtNorm(n, pt.x, pt.y);
    drawPathSVG(n);
}
window.applySprinklerLocDist = applySprinklerLocDist;

/* Select an <option> by its visible text.
   Several gather <option>s share the same `value` (every non-Auryn/CornerXSnake
   pattern used value="14"), so `$s.val(matchedValue)` would snap back to the first
   option with that value instead of the one we actually matched. Select by index
   (and compare case-insensitively) so the right pattern/return type is shown. */
function setSelectByText(sel, text) {
    const $s = $(sel);
    if (!$s.length) return;
    const want = String(text == null ? '' : text).trim().toLowerCase();
    let idx = -1;
    $s.find('option').each(function (i) {
        if (String($(this).text()).trim().toLowerCase() === want) { idx = i; return false; }
    });
    // Fallback: match the option's value attribute too (a stored token can differ from
    // the visible label, e.g. "e_lol"). Without this a value-only change looked like a
    // no-op and the dropdown appeared frozen.
    if (idx < 0) {
        $s.find('option').each(function (i) {
            if (String($(this).val()).trim().toLowerCase() === want) { idx = i; return false; }
        });
    }
    if (idx >= 0) $s.prop('selectedIndex', idx);
}
window.setSelectByText = setSelectByText;

function applyGatherTabSettings(n, s) {
    if (!s) return;
    if (s.pattern) setSelectByText('#pattern-tab-' + n, s.pattern);
    if (s.reps !== undefined && s.reps !== '') { $('#width-number-tab-' + n).val(s.reps); $('#width-slider-tab-' + n).val(s.reps); }
    if (s.size) { const v = GATHER_SIZE_TO_NUM[s.size] || s.size; $('#length-number-tab-' + n).val(v); $('#length-slider-tab-' + n).val(v); }
    if (s.invertfb !== undefined) $('#invert-fwd-back-tab-' + n).prop('checked', !!s.invertfb);
    if (s.invertlr !== undefined) $('#invert-left-right-tab-' + n).prop('checked', !!s.invertlr);
    if (s.drift !== undefined) $('#drift-tab-' + n).prop('checked', !!s.drift);
    if (s.shift !== undefined) $('#shift-tab-' + n).prop('checked', !!s.shift);
    if (s.rottime !== undefined && s.rottime !== '') $('#rotate-number-tab-' + n).val(s.rottime);
    if (s.mins !== undefined && s.mins !== '') $('#mins-tab-' + n).val(s.mins);
    if (s.pack !== undefined && s.pack !== '') $('#pack-tab-' + n).val(s.pack);
    if (s['return']) setSelectByText('#return-tab-' + n, s['return']);
    // Sprinkler position saved for this field (init snapshot / saved default): put the
    // marker where the classic location + distance say it should be.
    if (s.sprinkloc !== undefined || s.sprdist !== undefined) {
        const fnum = gatherFieldNumForTab(n);
        const st = window.gatherSprinklerState = window.gatherSprinklerState || {};
        const rec = st[fnum] = st[fnum] || {};
        if (s.sprinkloc !== undefined) rec.loc = s.sprinkloc;
        if (s.sprdist !== undefined) rec.dist = s.sprdist;
        applySprinklerLocDist(fnum);
    }
}

function bindGatherTabControls(n) {
    // Send against the AHK field number, not the web tab position.
    const fnum = gatherFieldNumForTab(n);
    $('#pattern-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'pattern', $(this).find('option:selected').text().trim()); drawPathSVG(n); });
    // Width / Length / Rotate each have BOTH a number input and a range slider.
    // Previously only the number input fired a 'change' that reached AHK, so dragging
    // the slider (which programmatically updates the number input without firing its
    // change event) never synced. Bind both and always read the number input.
    $('#width-number-tab-' + n + ', #width-slider-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'reps', parseInt($('#width-number-tab-' + n).val(), 10) || 1); });
    $('#length-number-tab-' + n + ', #length-slider-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'size', GATHER_NUM_TO_SIZE[parseInt($('#length-number-tab-' + n).val(), 10)] || 'M'); });
    // Rotation can be changed by typing or by the < / > buttons (which update the number
    // input without firing 'change'), so listen for both change and click.
    $('#rotate-number-tab-' + n + ', #rotate-left-tab-' + n + ', #rotate-right-tab-' + n).on('change click', function () { sendGatherFieldToAhk(fnum, 'rottime', parseInt($('#rotate-number-tab-' + n).val(), 10) || 0); });
    $('#invert-left-right-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'invertlr', this.checked ? 1 : 0); });
    $('#invert-fwd-back-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'invertfb', this.checked ? 1 : 0); });
    $('#drift-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'drift', this.checked ? 1 : 0); });
    $('#shift-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'shift', this.checked ? 1 : 0); });
    $('#mins-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'mins', parseInt($(this).val(), 10) || 0); });
    $('#pack-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'pack', parseInt($(this).val(), 10) || 0); });
    $('#return-tab-' + n).on('change', function () { sendGatherFieldToAhk(fnum, 'return', $(this).find('option:selected').text().trim()); });
}

function gatherWantEntries() {
    const want = [];
    for (let n = 1; n <= 3; n++) {
        const nm = (window.gatherFieldNames[n] || '').toLowerCase().replace(/\s+/g, '');
        if (nm && nm !== 'none') want.push({ num: n, id: nm });
    }
    return want;
}
function gatherWantList() {
    return gatherWantEntries().map(function (e) { return e.id; });
}
function gatherHaveList() {
    const have = [];
    $('#gather-tab-items li').each(function () {
        const src = $(this).find('img').first().attr('src') || '';
        const m = /fieldIcons\/([^\.]+)\.png/i.exec(src);
        have.push(m ? m[1].toLowerCase() : '');
    });
    return have;
}
/* Make every tab's field map picture match its own tab icon. The tab icon (set from
   the field name) and the map <img> (set when the pane template is cloned) are normally
   kept in step, but this guarantees the map can never go stale if a tab is refreshed. */
function syncGatherTabMapImages() {
    $('#gather-tab-items li').each(function (i) {
        const src = $(this).find('img').first().attr('src') || '';
        const m = /fieldIcons\/([^\.]+)\.png/i.exec(src);
        if (!m) return;
        const wantSrc = 'assets/img/fieldMaps/' + m[1].toLowerCase() + '_map.png';
        const $map = $('#snaptarget-tab-' + (i + 1));
        if ($map.length && $map.attr('src') !== wantSrc) $map.attr('src', wantSrc);
    });
}
window.syncGatherTabMapImages = syncGatherTabMapImages;

/* Rebuild the Gather "Pattern Shape" <select> options from the live pattern folder.
   AHK sends the list it scanned from \patterns\ (on init and whenever the folder
   changes), so a pattern dropped in after startup appears here too - including after
   [Stop] / a restart, which reloads the whole script and re-scans the folder. The
   template select is refreshed as well so any tab added later clones the full list. */
function applyPatternList(list) {
    if (!Array.isArray(list)) return;
    var esc = function (s) { return $('<div>').text(String(s == null ? '' : s)).html(); };
    var html = '';
    for (var i = 0; i < list.length; i++) {
        var name = String(list[i] == null ? '' : list[i]).trim();
        if (!name) continue;
        html += '<option value="' + esc(name) + '">' + esc(name) + '</option>';
    }
    if (!html) return;
    var opts = '<optgroup label="Pattern Shape">' + html + '</optgroup>';
    // Update the hidden template pane so buildTab() clones the complete list.
    var $template = $('#tab-pane-template #pattern-tab-0');
    if ($template.length) {
        var curTemplate = $template.find('option:selected').text().trim();
        $template.html(opts);
        if (window.setSelectByText) window.setSelectByText($template, curTemplate);
    }
    // Update every already-built field tab, preserving its current selection.
    $('#gather-tab-content select[id^="pattern-tab-"]').each(function () {
        var $s = $(this);
        var cur = $s.find('option:selected').text().trim();
        $s.html(opts);
        if (window.setSelectByText) window.setSelectByText($s, cur);
    });
}
window.applyPatternList = applyPatternList;

/* Ask AHK for the live pattern list. The list also rides along in the init payload,
   but this explicit request makes the dropdown robust: if the init snapshot is ever
   missed (or a stale page was cached) the dropdown still becomes dynamic instead of
   falling back to the static <option> list baked into index.html. */
function requestPatternList() {
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) return;
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var p = obj.func(JSON.stringify({ type: 'patternListRequest' }));
        if (p && p.then) p.then(function () { }, function (e) { console.warn('[ahk-send] patternListRequest:', e); });
    } catch (e) { console.warn('[ahk-send] patternListRequest error:', e); }
}
window.requestPatternList = requestPatternList;

$(document).ready(function () {
    if ($('#sidebar-gather').length > 0) setTimeout(requestPatternList, 600);
});

function rebuildGatherTabs() {
    const entries = gatherWantEntries();
    const want = entries.map(function (e) { return e.id; });
    const have = gatherHaveList();
    // Only rebuild when the field list actually changed; rebuilding on every
    // FieldNameN broadcast would needlessly tear down (and re-bind) the tabs.
    if (want.join('|') === have.join('|')) { syncGatherTabMapImages(); return; }
    // Same number of tabs -> this is only a field rename (e.g. Spider -> Mountain Top).
    // Refresh the icon + map of each tab IN PLACE so the other fields' settings
    // (pattern / size / sprinkler position ...) are not reset to template defaults.
    if (want.length === have.length) {
        $('#gather-tab-items li').each(function (i) {
            const e = entries[i];
            if (!e) return;
            window.gatherTabFieldNums[i] = e.num;
            const $icon = $(this).find('img').first();
            if (String($icon.attr('src') || '').toLowerCase().indexOf('/' + e.id + '.png') === -1)
                $icon.attr('src', 'assets/img/fieldIcons/' + e.id + '.png');
        });
        syncGatherTabMapImages();
        return;
    }
    $('#gather-tab-items').empty();
    $('#gather-tab-content').empty();
    window.gatherTabFieldNums = [];
    entries.forEach(function (e) { buildTab(e.id, {}, e.num); });
    syncGatherTabMapImages();
}
window.rebuildGatherTabs = rebuildGatherTabs;


// Tell the tab buidler function (buildTab) which tab to add
$('#btnAddBamboo').click(       function (e) {	buildTab("bamboo");	});
$('#btnAddBlueflower').click(   function (e) {	buildTab("blueflower");	});
$('#btnAddCactus').click(       function (e) {	buildTab("cactus");	});
$('#btnAddClover').click(       function (e) {	buildTab("clover");	});
$('#btnAddCoconut').click(      function (e) {	buildTab("coconut");	});
$('#btnAddDandelion').click(    function (e) {	buildTab("dandelion");	});
$('#btnAddMountain').click(     function (e) {	buildTab("mountaintop");	});
$('#btnAddMushroom').click(     function (e) {	buildTab("mushroom");	});
$('#btnAddPepper').click(       function (e) {	buildTab("pepper");	});
$('#btnAddPineapple').click(    function (e) {	buildTab("pineapple");	});
$('#btnAddPinetree').click(     function (e) {	buildTab("pinetree");	});
$('#btnAddPumpkin').click(      function (e) {	buildTab("pumpkin");	});
$('#btnAddRose').click(         function (e) {	buildTab("rose");	});
$('#btnAddSpider').click(       function (e) {	buildTab("spider");	});
$('#btnAddStrawberry').click(   function (e) {	buildTab("strawberry");	});
$('#btnAddStump').click(        function (e) {	buildTab("stump");	});
$('#btnAddSunflower').click(    function (e) {	buildTab("sunflower");	});

$('#btnAddBamboo, #btnAddBlueflower, #btnAddCactus, #btnAddClover, #btnAddCoconut, #btnAddDandelion, #btnAddMountain, #btnAddMushroom, #btnAddPepper, #btnAddPineapple, #btnAddPinetree, #btnAddPumpkin, #btnAddRose, #btnAddSpider, #btnAddStrawberry, #btnAddStump, #btnAddSunflower').click(function(){
    setTimeout(sendGatherFieldsToAhk, 10);
});


$('#Start-Button').click(       function (e) { ahkButtonClick(this); })
$('#Pause-Button').click(       function (e) { ahkButtonClick(this); })
$('#Stop-Button').click(        function (e) { ahkButtonClick(this); })
$('#AutoClick-Button').click(   function (e) { ahkButtonClick(this); })
$('#Status-Button').click(      function (e) { ahkButtonClick(this); })

function sendGatherFieldsToAhk() {
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.log('[ahk-send] gatherFields host not ready, skipping');
        return;
    }
    var fields = [];
    $('#gather-tab-items img').each(function() {
        var src = $(this).attr('src') || '';
        var match = src.match(/fieldIcons\/([^\.]+)\.png/i);
        if (match && match[1]) {
            fields.push(match[1]);
        }
    });
    // Sending the list makes AHK renumber its fields by position (fields[1] -> FieldName1,
    // ...), so keep our per-tab field-number mapping in step with that.
    window.gatherTabFieldNums = [];
    fields.forEach(function (_, i) { window.gatherTabFieldNums[i] = i + 1; });
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'gatherFields', fields: fields }));
        // attach a no-op rejection handler to prevent unhandled rejection
        if (promise && promise.then) {
            promise.then(
                function() { console.log('[ahk-send] gatherFields ok'); },
                function(err) { console.warn('[ahk-send] gatherFields:', err); }
            );
        }
        console.log('[ahk-send] gatherFields', fields);
    } catch (err) {
        console.warn('[ahk-send] gatherFields error:', err);
    }
}


// handles the "Remove" button on tabs
$(document).on('click', '.button-remove-current-tab', function(e) {
    // find & delete the tab header and content
    $('document, #GatherTabs .tab-pane.active').remove()
    $('document, #GatherTabs a.nav-link.active').closest('li').remove();

    // set a new tab (farthest on right) as active
    var totalTabs = $('#gather-tab-items li').length;
    $('document, #gather-tab-items .nav-link').last().addClass('active');
    $('document, #gather-tab-content .tab-pane').last().addClass('active');

    // Renumber tabs so they're always numbered in order (example: tab-1, tab-2, tab-3) even if deleted out of order
    var concatTabs = "";
    $gatherTabsList = $('#GatherTabs ul li')
    // Iterate over each <li> and replace the tab number
    $gatherTabsList.each(function(index,existingTab){
        index++;
        updatedTab = existingTab.outerHTML.replace(/-tab-\d+/, '-tab-' + index);
        concatTabs += updatedTab;
    });
    // Replace the entire <ul> contents with the renumbered tabs
    $('#GatherTabs ul').html(concatTabs);

    // Renumber tabs contents
    var concatTabs = "";
    $gatherTabContentsList = $('#gather-tab-content .tab-pane')
    // Iterate over each <div> and replace the tab number
    $gatherTabContentsList.each(function(index,existingTab){
        index++;
        updatedTab = existingTab.outerHTML.replace(/-tab-\d+/, '-tab-' + index);
        concatTabs += updatedTab;
    });
    // Replace the entire <div> contents with the renumbered tab contents
    $('#gather-tab-content').html(concatTabs);

    // After a removal the tabs are re-sent in DOM order, so field numbers collapse to
    // position order again.
    window.gatherTabFieldNums = [];
    $('#gather-tab-items li').each(function (i) { window.gatherTabFieldNums[i] = i + 1; });
    // tell AHK the field list changed so the classic Gather tab follows
    setTimeout(sendGatherFieldsToAhk, 10);




});


/* Per-tab Gather actions (Save defaults / Copy / Paste).
   The classic GUI had these three controls per field; the web clones the tab template, so
   each one carries a "-tab-N" suffix. Forward the click to AHK together with the mapped
   field number so the classic handlers (nm_SaveFieldDefault / nm_CopyGatherSettings /
   nm_PasteGatherSettings) run against the right field. */
function gatherTabActionFor(el, action) {
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkGatherAction)) {
        console.warn('[ahk-send] ahkGatherAction host not ready');
        return;
    }
    var m = /-tab-(\d+)/.exec(el.id || '');
    var tabNumber = m ? parseInt(m[1], 10) : 0;
    if (!tabNumber) return;
    var fieldNum = gatherFieldNumForTab(tabNumber);
    if (!fieldNum) return;
    try {
        var obj = window.chrome.webview.hostObjects.ahkGatherAction;
        var p = obj.func(action + ':' + fieldNum);
        if (p && p.then) p.then(function () { }, function (e) { console.warn('[ahk-send] gatherAction:', e); });
    } catch (e) { console.warn('[ahk-send] gatherAction error:', e); }
}

$(document).on('click', '[id^="saveTab-tab-"]', function () { gatherTabActionFor(this, 'save'); });
$(document).on('click', '[id^="copyTab-tab-"]', function () { gatherTabActionFor(this, 'copy'); });
$(document).on('click', '[id^="pasteTab-tab-"]', function () { gatherTabActionFor(this, 'paste'); });


// Bridge between AHK and JavaScript provided by WebViewToo
function parseAhkMessage(rawMessage) {
    try {
        return JSON.parse(rawMessage);
    } catch (err) {
        // attempt a quick repair for the common malformed collect payload
        var repaired = rawMessage
            .replace('"collect":}', '"collect":{}')
            .replace('"value":}', '"value":0}')
            .replace(/^\{\{/, '{')
            .replace(/\}\}$/, '}');
        if (repaired !== rawMessage) {
            try {
                console.log('[ahk-msg] repaired malformed collect payload');
                return JSON.parse(repaired);
            } catch (err2) {
                // fall through to raw logging
            }
        }
        console.log('[ahk-msg] parse error, raw:', rawMessage);
        return { type: 'raw', raw: rawMessage };
    }
}

var suppressCollectSend = false;

function handleAhkMessage(event) {
    console.log('[ahk-msg] incoming', event.data);
    var msg = parseAhkMessage(event.data);
    
    if (msg.type === 'init') {
        console.log('[ahk-msg] version', msg.version || 'unknown');
        // Live macro version for the header (same VersionID the classic GUI shows).
        if (msg.natroVersion) $('#headerVersion').text('v' + msg.natroVersion);
        // Refresh the pattern dropdown(s) BEFORE the tabs are (re)built so the clones
        // already contain every pattern on disk.
        if (msg.patternList && window.applyPatternList) window.applyPatternList(msg.patternList);
        else if (window.requestPatternList) window.requestPatternList();
        if (msg.gather && Array.isArray(msg.gather)) {
            $('#gather-tab-items').empty();
            $('#gather-tab-content').empty();
            window.gatherTabFieldNums = [];
            msg.gather.forEach(function(field, idx) {
                window.gatherFieldNames[idx + 1] = field.field || 'None';
                var normalized = (field.field || '').toLowerCase().replace(/\s+/g, '');
                if (normalized.length && normalized !== 'none') {
                    buildTab(normalized, field, field.num || (idx + 1));
                }
            });
        }
        if (msg.collect) {
            suppressCollectSend = true;
            $('#chkCollectMondo').prop('checked', !!msg.collect.MondoBuffCheck).trigger('change');
            $('#chkCollectClock').prop('checked', !!msg.collect.ClockCheck).trigger('change');
            $('#chkCollectRoboPass').prop('checked', !!msg.collect.RoboPassCheck).trigger('change');
            $('#chkCollectHoneystorm').prop('checked', !!msg.collect.HoneystormCheck).trigger('change');
            $('#chkCollectHoneyDis').prop('checked', !!msg.collect.HoneyDisCheck).trigger('change');
            $('#chkCollectTreatDis').prop('checked', !!msg.collect.TreatDisCheck).trigger('change');
            $('#chkCollectBlueberryDis').prop('checked', !!msg.collect.BlueberryDisCheck).trigger('change');
            $('#chkCollectStrawberryDis').prop('checked', !!msg.collect.StrawberryDisCheck).trigger('change');
            $('#chkCollectCoconutDis').prop('checked', !!msg.collect.CoconutDisCheck).trigger('change');
            $('#chkCollectRoyalJellyDis').prop('checked', !!msg.collect.RoyalJellyDisCheck).trigger('change');
            $('#chkCollectGlueDis').prop('checked', !!msg.collect.GlueDisCheck).trigger('change');
            
            if (msg.collect.MondoAction === 'Buff') {
                $('#btnMondoActionBuff').prop('checked', true).trigger('change');
            } else if (msg.collect.MondoAction === 'Kill') {
                $('#btnMondoActionKill').prop('checked', true).trigger('change');
            }
            if (msg.collect.MondoLootDirection === 'Left') {
                $('#btnMondoLootLeft').prop('checked', true);
            } else if (msg.collect.MondoLootDirection === 'Right') {
                $('#btnMondoLootRight').prop('checked', true);
            } else {
                $('#btnMondoLootRandom').prop('checked', true);
            }
            $('#chkCollectAnt').prop('checked', !!msg.collect.AntPassCheck).trigger('change');
            suppressCollectSend = false;
        }
        // Restore the remaining tabs from the init snapshot.
        if (window.collectTabHandlers && window.collectTabHandlers.restoreState) {
            var collectExtras = Object.assign({}, msg.collectExtras || {}, msg.blender || {}, msg.shrine || {});
            if (Object.keys(collectExtras).length) {
                window.collectTabHandlers.restoreState(JSON.stringify(collectExtras));
            }
        }
        if (msg.plants && window.plantersTabHandlers && window.plantersTabHandlers.restoreState) {
            window.plantersTabHandlers.restoreState(JSON.stringify(msg.plants));
        }
        if (msg.quests && window.questsTabHandlers && window.questsTabHandlers.restoreState) {
            window.questsTabHandlers.restoreState(JSON.stringify(msg.quests));
        }
        if (msg.boost && window.boostTabHandlers && window.boostTabHandlers.restoreState) {
            window.boostTabHandlers.restoreState(JSON.stringify(msg.boost));
        }
        if (msg.settings && window.settingsTabHandlers && window.settingsTabHandlers.restoreState) {
            window.settingsTabHandlers.restoreState(JSON.stringify(msg.settings));
        }
        if (msg.status && window.statusTabHandlers && window.statusTabHandlers.restoreState) {
            window.statusTabHandlers.restoreState(JSON.stringify(msg.status));
        }
        if (msg.misc && window.miscTabHandlers && window.miscTabHandlers.restoreState) {
            window.miscTabHandlers.restoreState(JSON.stringify(msg.misc));
        }
        if (msg.gatherSettings && window.gatherTabHandlers && window.gatherTabHandlers.restoreState) {
            window.gatherTabHandlers.restoreState(JSON.stringify(msg.gatherSettings));
        }
    } else if (msg.type === 'collect') {
        // dynamicTabs owns the core collect keys (Mondo/Ant/dispensers/clock...)
        applyCollectFromAhk(msg.key, msg.value);
        // extras (Blender / Wind Shrine / Beesmas / Memory Match) live in collectTabHandlers
        if (window.collectTabHandlers && window.collectTabHandlers.applyFromAhk) {
            window.collectTabHandlers.applyFromAhk(msg.key, msg.value);
        }
    } else if (msg.type === 'settings') {
        if (window.settingsTabHandlers && window.settingsTabHandlers.applyFromAhk) {
            window.settingsTabHandlers.applyFromAhk(msg.key, msg.value);
        }
    } else if (msg.type === 'status') {
        if (window.statusTabHandlers && window.statusTabHandlers.applyFromAhk) {
            window.statusTabHandlers.applyFromAhk(msg.key, msg.value);
        }
    } else if (msg.type === 'misc') {
        if (window.miscTabHandlers && window.miscTabHandlers.applyFromAhk) {
            window.miscTabHandlers.applyFromAhk(msg.key, msg.value);
        }
    } else if (msg.type === 'kill') {
        // killTabHandlers has its own listener, skip here
        console.log('[ahk-msg] kill message (handled by killTabHandlers listener)');
    } else if (msg.type === 'boost') {
        applyBoostFromAhk(msg.key, msg.value);
    } else if (msg.type === 'plants') {
        if (window.plantersTabHandlers && window.plantersTabHandlers.applyFromAhk) {
            window.plantersTabHandlers.applyFromAhk(msg.key, msg.value);
        } else {
            console.warn('[ahk-msg] plantersTabHandlers not ready for', msg.key);
        }
    } else if (msg.type === 'quests') {
        if (window.questsTabHandlers && window.questsTabHandlers.applyFromAhk) {
            window.questsTabHandlers.applyFromAhk(msg.key, msg.value);
        } else {
            console.warn('[ahk-msg] questsTabHandlers not ready for', msg.key);
        }
    } else if (msg.type === 'patternList') {
        // Live pattern-folder refresh (e.g. the user dropped in a new pattern).
        if (window.applyPatternList) window.applyPatternList(msg.patterns);
    } else if (msg.type === 'patternText') {
        // Pattern source for the Gather animation (see patternInterpreter.js).
        if (window.nmResolvePatternText) window.nmResolvePatternText(msg.key, msg.text);
    } else if (msg.type === 'gather') {
        if (window.gatherTabHandlers && window.gatherTabHandlers.applyFromAhk) {
            window.gatherTabHandlers.applyFromAhk(msg.key, msg.value);
        }
    } else if (msg.type === 'tab') {
        // classic GUI tab changed -> switch the web sidebar pill
        showWebTab(msg.value);
    } else {
        console.log('[ahk-msg] unhandled type', msg.type);
    }
}

if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', handleAhkMessage);
}

function applyCollectFromAhk(key, value) {
    suppressCollectSend = true;
    switch (key) {
        case 'MondoBuffCheck':
            $('#chkCollectMondo').prop('checked', !!value).trigger('change');
            break;
        case 'MondoAction':
            if (value === 'Buff') {
                $('#btnMondoActionBuff').prop('checked', true).trigger('change');
            } else if (value === 'Kill') {
                $('#btnMondoActionKill').prop('checked', true).trigger('change');
            }
            break;
        case 'MondoLootDirection':
            if (value === 'Left') {
                $('#btnMondoLootLeft').prop('checked', true).trigger('change');
            } else if (value === 'Right') {
                $('#btnMondoLootRight').prop('checked', true).trigger('change');
            } else {
                $('#btnMondoLootRandom').prop('checked', true).trigger('change');
            }
            break;
        case 'AntPassCheck':
            $('#chkCollectAnt').prop('checked', !!value).trigger('change');
            break;
        case 'ClockCheck':
            $('#chkCollectClock').prop('checked', !!value).trigger('change');
            break;
        case 'RoboPassCheck':
            $('#chkCollectRoboPass').prop('checked', !!value).trigger('change');
            break;
        case 'HoneystormCheck':
            $('#chkCollectHoneystorm').prop('checked', !!value).trigger('change');
            break;
        case 'HoneyDisCheck':
            $('#chkCollectHoneyDis').prop('checked', !!value).trigger('change');
            break;
        case 'TreatDisCheck':
            $('#chkCollectTreatDis').prop('checked', !!value).trigger('change');
            break;
        case 'BlueberryDisCheck':
            $('#chkCollectBlueberryDis').prop('checked', !!value).trigger('change');
            break;
        case 'StrawberryDisCheck':
            $('#chkCollectStrawberryDis').prop('checked', !!value).trigger('change');
            break;
        case 'CoconutDisCheck':
            $('#chkCollectCoconutDis').prop('checked', !!value).trigger('change');
            break;
        case 'RoyalJellyDisCheck':
            $('#chkCollectRoyalJellyDis').prop('checked', !!value).trigger('change');
            break;
        case 'GlueDisCheck':
            $('#chkCollectGlueDis').prop('checked', !!value).trigger('change');
            break;
        default:
            break;
    }
    suppressCollectSend = false;
}


function ahkButtonClick(buttonClicked) {

    if (buttonClicked.id == "Start-Button"){
        // start button clicked
    }

    var obj = window.chrome.webview.hostObjects.ahkButtonClick;
    obj.func(buttonClicked.id);
}

function ahkCopyGlyphCode(ele) {
    var obj = window.chrome.webview.hostObjects.ahkCopyGlyphCode;
    obj.func(ele.title);
}

function ahkFormSubmit(event) {
    
    if (event.target.id != null || "") {
        var eventInfo = event.target.id;
    }
    else if (event.target.name != null || "") {
        var eventInfo = event.target.name;
    }
    else {
        var eventInfo = event.target.outerHTML;
    }
    var obj = window.chrome.webview.hostObjects.ahkFormSubmit;
    obj.func("webpage", eventInfo);

    setTimeout(() => {
        event.target.reset();
    }, 100);
    
}

// COLLECT TAB ///////////////////////////////////////////////////////////////////
$(document).ready(function() { 
    // Evaluate all the current checkbox/positions and show/hide/disable/enable fields
    
    $('#chkCollectMondo').trigger('change');
    $('#btnMondoActionBuff').trigger('change');
    $('#btnMondoActionKill').trigger('change');
    $('#chkCollectAnt').trigger('change');

});


$(document).on('change', '#chkCollectMondo', function() {
    if (this.checked) {
        $('#collectMondoGroup').find(':input').prop('disabled', false);        
    } else {
        $('#collectMondoGroup').find(':input').prop('disabled', true);
    }
    sendCollectUpdate('MondoBuffCheck', this.checked ? 1 : 0);
});

$(document).on('change', '#btnMondoActionBuff', function() {
    if (this.checked) {
    $('#collectMondoSeconds').show();
    $('#collectMondoLoot').hide();
    }
    if (this.checked) sendCollectUpdate('MondoAction', 'Buff');
});

$(document).on('change', '#btnMondoActionKill', function() {
    if (this.checked) {
        $('#collectMondoLoot').show();
        $('#collectMondoSeconds').hide();
    }
    if (this.checked) sendCollectUpdate('MondoAction', 'Kill');
});

$(document).on('change', '#btnMondoLootLeft', function() {
    if (this.checked) sendCollectUpdate('MondoLootDirection', 'Left');
});
$(document).on('change', '#btnMondoLootRight', function() {
    if (this.checked) sendCollectUpdate('MondoLootDirection', 'Right');
});
$(document).on('change', '#btnMondoLootRandom', function() {
    if (this.checked) sendCollectUpdate('MondoLootDirection', 'Random');
});

$(document).on('change', '#chkCollectAnt', function() {
    if (this.checked) {
        $('.collectAntGroup').prop('disabled', false);        
    } else {
        $('.collectAntGroup').prop('disabled', true);
    }
    sendCollectUpdate('AntPassCheck', this.checked ? 1 : 0);
});

$(document).on('change', '#chkCollectClock', function() {
    sendCollectUpdate('ClockCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectRoboPass', function() {
    sendCollectUpdate('RoboPassCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectHoneystorm', function() {
    sendCollectUpdate('HoneystormCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectHoneyDis', function() {
    sendCollectUpdate('HoneyDisCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectTreatDis', function() {
    sendCollectUpdate('TreatDisCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectBlueberryDis', function() {
    sendCollectUpdate('BlueberryDisCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectStrawberryDis', function() {
    sendCollectUpdate('StrawberryDisCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectCoconutDis', function() {
    sendCollectUpdate('CoconutDisCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectRoyalJellyDis', function() {
    sendCollectUpdate('RoyalJellyDisCheck', this.checked ? 1 : 0);
});
$(document).on('change', '#chkCollectGlueDis', function() {
    sendCollectUpdate('GlueDisCheck', this.checked ? 1 : 0);
});

function sendCollectUpdate(key, value) {
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) {
        console.warn('[ahk-send] collect host not ready');
        return;
    }
    if (suppressCollectSend) {
        return;
    }
    console.log('[ahk-send] collect', key, value);
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var promise = obj.func(JSON.stringify({ type: 'collect', key: key, value: value }));
        // attach a no-op rejection handler to prevent unhandled rejection
        if (promise && promise.then) {
            promise.then(
                function() { },
                function(err) { console.warn('[ahk-send] collect:', err); }
            );
        }
    } catch (err) {
        console.warn('[ahk-send] collect error:', err);
    }
}

// KILL Tab

// BOOST Tab - Initialize handlers
$(document).ready(function() {
    if (window.boostTabHandlers && window.boostTabHandlers.initialize) {
        window.boostTabHandlers.initialize();
    } else {
        console.warn('[init] boostTabHandlers not available');
    }
});

// COLLECT Tab - Initialize handlers
$(document).ready(function() {
    if (window.collectTabHandlers && window.collectTabHandlers.initialize) {
        window.collectTabHandlers.initialize();
    } else {
        console.warn('[init] collectTabHandlers not available');
    }
});

// Helper function to apply boost settings from AHK (called from handleAhkMessage)
function applyBoostFromAhk(key, value) {
    if (window.boostTabHandlers && window.boostTabHandlers.applyFromAhk) {
        window.boostTabHandlers.applyFromAhk(key, value);
    }
}

/* ------------------------------------------------------------------ */
/* Sidebar <-> classic tab sync                                        */
/* ------------------------------------------------------------------ */

// Guards against echoing a programmatic tab switch back to AHK (prevents a feedback loop).
var suppressTabSend = false;

// Switch the web sidebar pill for the given web id (e.g. 'collect', 'kill', 'status').
function showWebTab(id) {
    if (!id) return;
    var el = document.querySelector('#sidebar-tabitems a[href="#sidebar-' + id + '"]');
    if (!el) return;
    suppressTabSend = true;
    try {
        if (window.bootstrap && bootstrap.Tab) {
            bootstrap.Tab.getOrCreateInstance(el).show();
        } else {
            el.click();
        }
    } finally {
        setTimeout(function () { suppressTabSend = false; }, 0);
    }
}

function sendTabToAhk(id) {
    if (suppressTabSend || !id) return;
    if (!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.ahkUpdateState)) return;
    try {
        var obj = window.chrome.webview.hostObjects.ahkUpdateState;
        var p = obj.func(JSON.stringify({ type: 'tab', key: 'Tab', value: id }));
        if (p && p.then) p.then(function () { }, function (e) { console.warn('[ahk-send] tab:', e); });
    } catch (e) { console.warn('[ahk-send] tab error:', e); }
}

$(document).ready(function () {
    $('#sidebar-tabitems').on('shown.bs.tab', 'a[data-bs-toggle="pill"]', function () {
        // Reset the right-hand pane to the top; otherwise the scroll position carries
        // over from whichever tab was active before.
        var pane = document.getElementById('field-icon-buttons');
        if (pane) pane.scrollTop = 0;
        $('#field-icon-buttons').scrollTop(0);
        var m = /#sidebar-(.+)$/.exec($(this).attr('href') || '');
        if (m) sendTabToAhk(m[1]);
    });
});

window.showWebTab = showWebTab;
