
// hide the Tab template upon page load
// (we could have started it hidden, but it's easier to manage in a WYSIWYG HTML editor if it's visible)
$(document).ready(function() { $('#tab-content-placeholder').hide(); });

// Tooltips
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
  return new bootstrap.Tooltip(tooltipTriggerEl)
})

const CLIENT_VERSION = 'bootstrap-collect-sync-003';
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


    spacingDelay = spacingDelay * 15;
    var reps = width; // width
    var size = length * 15;  // length
    const rotationMultiplier = 45; // every 1 rotation is 45 degrees
    rotationAngle = rotation * rotationMultiplier; // calculate the angle

    if(invertLR){ invertValueX = '-1'} // if Left/Right should be inverted
    else{ invertValueX = '1'};
    if(invertFB){ invertValueY = '-1'} // if Fwd/Back should be inverted
    else{ invertValueY = '1'};


    // SPECIFIC TO e_lol path
    // TODO: Need to replace this code with a function (?) that can input & read multiple paths
    
    // e_lol pattern example. These are what make up the SVG path trace on the field image
    svgContents ="m " + (OffsetX) + " " + (OffsetY) +
    "l " + -(spacingDelay*9/2000*(reps*2+1)) + " 0"+
    "l 0 " + (5*size)+
    "l " + (spacingDelay*9/2000) + " 0" +
    "l 0 " + -(5*size) +	
    "l " + (spacingDelay*9/2000) + " 0" +
    "l 0 " + ((1094+25*facingcorner)*9/2000*size) +
    "l " + -(spacingDelay*9/2000*(reps*2+0.5)) + " 0"+
    "l 0 " + -(5*size) +
    "l " + (spacingDelay*9/2000) + " 0" +
    "l 0 " + ((1094+25*facingcorner)*9/2000*size) +
    "l " + (spacingDelay*9/2000*1.5) + " 0" +
    "l 0 " + -(5*size) +
    "z"


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
    // Calculate the duration based on a desired total animation time
    const totalAnimationTime = 5000; // 5 seconds in milliseconds
    animationSpeed = pathLength / totalAnimationTime; // Pixels per millisecond
    let dashOffset = 0;
    startTime = performance.now(); // Get the start time
    targetTime = startTime + 15000; // When to stop the animation (15 seconds)
    const animate = (timestamp) => {
        const elapsed = timestamp - startTime;
        dashOffset = elapsed * animationSpeed; // Update dash offset based on elapsed time
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


function buildTab (fieldName) {

        // increment the tab number
        var tabNumber = $('#gather-tab-items li').length+1;

        // check if we're at the tab limit
        if (tabNumber > tabLimit){
            // tab limit exceeded. show message and return from the function
            $('#GatherWarningMessage').show();
            return false;
        }

        // create the header of the tab with the field image
        $('<li class="nav-item"><a href="#gather-tab-'+tabNumber+'" class="nav-link" data-bs-toggle="tab"><img src="assets/img/fieldIcons/'+fieldName+'.png" style="width: 40px;height: 40px;" /></a></li>').appendTo('#gather-tab-items');

        // create the tab content, replacing contents with the field-specific info (field image)
        var htmlCodeToSearch = $('#tab-pane-template').html();
        $('<div class="tab-pane" id="gather-tab-'+tabNumber+'">'+replaceTabContents(fieldName,tabNumber,htmlCodeToSearch)+'</div>').appendTo('#gather-tab-content');

        // make the new tab active
        $('#gather-tab-items a:last').tab('show');

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

                var sprinklerDropLeft = (pos.left - dPos.left) + 20; //left of canvas minus dropped position, centered to middle of sprinkler
                var sprinklerDropTop = (pos.top - dPos.top) + 31; //top of canvas minus dropped position, centered to middle of sprinkler

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

            setTimeout(sendGatherFieldsToAhk, 10);

}


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




});


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
        if (msg.gather && Array.isArray(msg.gather)) {
            msg.gather.forEach(function(field) {
                var normalized = (field.field || '').toLowerCase().replace(/\s+/g, '');
                if (normalized.length && normalized !== 'none') {
                    buildTab(normalized);
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
    } else if (msg.type === 'collect') {
        applyCollectFromAhk(msg.key, msg.value);
    } else if (msg.type === 'kill') {
        // let killTabHandlers handle kill updates via its own listener
        console.log('[ahk-msg] routing kill message to killTabHandlers');
    } else if (msg.type === 'boost') {
        // let boostTabHandlers handle boost updates
        applyBoostFromAhk(msg.key, msg.value);
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
        $('.CollectMondoGroup').prop('disabled', false);        
    } else {
        $('.CollectMondoGroup').prop('disabled', true);
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

// Helper function to apply boost settings from AHK (called from handleAhkMessage)
function applyBoostFromAhk(key, value) {
    if (window.boostTabHandlers && window.boostTabHandlers.applyFromAhk) {
        window.boostTabHandlers.applyFromAhk(key, value);
    }
}
