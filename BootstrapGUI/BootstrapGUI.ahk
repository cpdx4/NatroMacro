/**
 * Natro Macro (Modern UI) - WebView2 GUI bridge.
 *
 * Everything the fork adds on top of the baseline NatroMacro script lives here, so the
 * diff against the baseline is this one new file plus small hook lines in
 * submacros/natro_macro.ahk.
 *
 * Included by submacros/natro_macro.ahk *after* the WebViewToo includes, so the
 * WebViewGui / WebViewCtrl classes are already available. Contains function
 * definitions only, plus nm_BootstrapWebGui() which the main script invokes once.
 */

;///////////////////////////////////////////////////////////////////////////////////////////
; Batched INI writer (used by nm_NectarPersistPreset below)
;///////////////////////////////////////////////////////////////////////////////////////////
; Lives in lib/ and is pulled in here so the fork needs zero changes to the upstream
; submacros/natro_macro.ahk. Provides nm_IniWriteSection(), which updates a whole INI
; section with one read + one write instead of one read/write per key.
#Include "%A_ScriptDir%\..\lib\nm_IniWriteSection.ahk"

;///////////////////////////////////////////////////////////////////////////////////////////
; WebView2 GUI bootstrap
;///////////////////////////////////////////////////////////////////////////////////////////

; Pick a per-user WebView2 user-data folder - never the script folder. Prefer %LOCALAPPDATA%, then %APPDATA%,
; and return the first the OS lets us create. If none is writable (e.g. a security policy blocks AutoHotkey.exe
; from writing under AppData), fail with a clear message instead of dropping profile data into the repository.
nm_PickWebViewDataDir() {
    local dir
    for dir in [EnvGet("LOCALAPPDATA") "\NatroMacro\WebView2", EnvGet("APPDATA") "\NatroMacro\WebView2"] {
        try {
            DirCreate(dir)
            return dir
        }
    }
    msg := "Natro Macro needs a WebView2 data folder but Windows denied write access to both:`n`n"
        . EnvGet("LOCALAPPDATA") "\NatroMacro\WebView2`n"
        . EnvGet("APPDATA") "\NatroMacro\WebView2`n`n"
        . "AutoHotkey.exe is being blocked from writing under AppData (error 5, Access is denied). "
        . "Allow AutoHotkey.exe in your security/application-control policy, or run the macro outside this restricted environment, then restart."
    MsgBox msg, "Natro Macro - WebView2 error", 0x10
    ExitApp
}

nm_BootstrapWebGui() {
	global MyWindow, WebView2DataDir
;WebViewToo v1.0.1 (breaking update): `WebviewWindow` was renamed to `WebViewGui`.
;`Load()` was replaced by `Navigate()` and the title moved to the constructor (native Gui).
;NOTE: `+ToolWindow` (WS_EX_TOOLWINDOW) is what previously hid this window from the taskbar
;and Alt+Tab and left only a Close button (no Minimize/Maximize). Use the normal application
;window style instead so the new GUI shows up as its own taskbar window with Min/Max/Restore.
;
;IMPORTANT: always pass an explicit WebView2 DataDir here (see CONTEXT.md). Leaving it empty makes the
;vendored `WebViewToo_Resources\WebView2.ahk` fall back to the Edge browser's own profile, which is locked
;whenever Edge runs -> 0x800700AA (ERROR_BUSY). Use a per-user AppData folder ONLY - never the script folder.
;If the OS denies directory creation there ("Access is denied", as it does for AutoHotkey*.exe on some
;locked-down machines), WebView2 startup fails with a visible error rather than writing into the repo.
WebView2DataDir := nm_PickWebViewDataDir()
try
    MyWindow := WebViewGui("+Resize +Caption +MinimizeBox +MaximizeBox", "Natro Macro (Modern UI)", , {DataDir: WebView2DataDir})
catch as e {
    MsgBox "Failed to create the WebView2 window.`n`n" e.Message "`n`nDataDir: " WebView2DataDir, "Natro Macro - WebView2 error", 0x10
    ExitApp
}
MyWindow.OnEvent("Close", (*) => ExitApp())
; The GUI is served over the https virtual host "ahk.localhost", so the WebView
; caches index.html / its scripts. Append a per-run query so a restart always picks
; up edited HTML (CSS is inline, and the changed scripts carry their own ?v= token).
MyWindow.Navigate("BootstrapGUI/index.html?v=" A_TickCount)
; --- DevTools (F12) auto-open: commented out, kept for later debugging ---
; This call opened the WebView2 developer tools on every launch. Re-enable the line below
; (or call MyWindow.Debug() from a hotkey) when the DevTools are needed again.
; MyWindow.Debug()
;`NavigationCompleted` is now a `WebViewCtrl` handler method (proxied onto `WebViewGui`), not a GUI event.
MyWindow.NavigationCompleted((*) => SetTimer(SendBootstrapState, -50))
MyWindow.AddHostObjectToScript("ahkButtonClick", {func:WebButtonClickEvent})
MyWindow.AddHostObjectToScript("ahkCopyGlyphCode", {func:CopyGlyphCodeEvent})
MyWindow.AddHostObjectToScript("ahkFormSubmit", {func:FormSubmitEvent})
MyWindow.AddHostObjectToScript("ahkUpdateState", {func:WebUpdateStateSafe})
MyWindow.AddHostObjectToScript("ahkGatherAction", {func:WebGatherActionEvent})
; Create the WebView window HIDDEN for now: which GUI is visible depends on the persisted
; [Settings] UseNewGUI flag, which is only loaded later by nm_importConfig(). nm_ApplyGuiMode()
; shows exactly one of the two windows once the classic MainGui has been built. Showing it with
; "Hide" (rather than never showing it) still lays the WebView2 control out at its final size,
; so the page renders correctly the moment the window is really shown.
MyWindow.Show("w1050 h650 Center Hide")
}

;///////////////////////////////////////////////////////////////////////////////////////////
; GUI mode toggle (Classic AHK GUI <-> New WebView2 GUI)
;///////////////////////////////////////////////////////////////////////////////////////////
; Persisted as [Settings] UseNewGUI in settings\nm_config.ini (0 = Classic, the default;
; 1 = New). Only ONE of MainGui / MyWindow is ever visible: flipping the switch in either
; GUI calls nm_SetGuiMode(), which swaps the windows, saves the choice and mirrors the new
; state to the web so its header switch stays in step.
nm_SetGuiMode(useNew, persist := true) {
	global UseNewGUI, MainGui, MyWindow
	UseNewGUI := useNew ? 1 : 0
	if persist
		try IniWrite UseNewGUI, "settings\nm_config.ini", "Settings", "UseNewGUI"
	nm_ShowGuiForCurrentMode()
	nm_WebBroadcastGuiMode()
}

; Startup: apply the value nm_importConfig() already loaded, without rewriting the INI.
nm_ApplyGuiMode() {
	nm_ShowGuiForCurrentMode()
	nm_WebBroadcastGuiMode()
}

; Show exactly one of the two GUI windows for the current UseNewGUI value.
nm_ShowGuiForCurrentMode() {
	global UseNewGUI, MainGui, MyWindow
	local mode
	mode := UseNewGUI ? 1 : 0
	if IsSet(MyWindow) && IsObject(MyWindow) {
		try {
			if (mode)
				MyWindow.Show("w1050 h650 Center")
			else
				MyWindow.Hide()
		}
	}
	if IsSet(MainGui) && IsObject(MainGui) {
		; Use WinHide/WinShow (not Gui.Hide/Gui.Show) so the classic window's size is never
		; re-derived: Gui.Show() re-applied the border every time it was re-shown, which made
		; the window creep a few pixels bigger on each New -> Classic toggle.
		try {
			if (mode) {
				WinHide("ahk_id " MainGui.Hwnd)
			} else {
				WinShow("ahk_id " MainGui.Hwnd)
				WinActivate("ahk_id " MainGui.Hwnd)
			}
		}
	}
	nm_UpdateClassicGuiToggle()
}

; Push the current GUI mode to the WebView so its header switch reflects it.
nm_WebBroadcastGuiMode() {
	global MyWindow, UseNewGUI
	if !IsSet(MyWindow)
		return
	try MyWindow.PostWebMessageAsString('{"type":"guiMode","value":"' (UseNewGUI ? "new" : "classic") '"}')
}

; Swap the classic Gather-row switch graphic to match the current mode.
nm_UpdateClassicGuiToggle() {
	global MainGui, UseNewGUI
	if !IsSet(MainGui) || !IsObject(MainGui)
		return
	local ctrl, hBM
	ctrl := ""
	try ctrl := MainGui["GuiToggleSwitch"]
	if !IsObject(ctrl)
		return
	hBM := nm_CreateGuiSwitchBitmap(UseNewGUI ? 1 : 0)
	try ctrl.Value := "HBITMAP:*" hBM
	DllCall("DeleteObject", "Ptr", hBM)
}

; Draw a small pill switch (grey = Classic/off, green = New/on) and return its HBITMAP.
nm_CreateGuiSwitchBitmap(state) {
	local w := 36, h := 20, bmp, g, brush, knobD, knobX, hBM
	bmp := Gdip_CreateBitmap(w, h)
	g := Gdip_GraphicsFromImage(bmp)
	Gdip_SetSmoothingMode(g, 4)
	; Track (grey = Classic/off, green = New/on). The corner radius must not exceed half the
	; rect height, or the rounded-rectangle path degenerates and leaves stray pixels.
	brush := Gdip_BrushCreateSolid(state ? 0xff4bb543 : 0xffaeb6bf)
	Gdip_FillRoundedRectangle(g, brush, 0, 0, w - 1, h - 1, (h - 1) // 2)
	Gdip_DeleteBrush(brush)
	; Knob with a uniform 2px margin all round.
	knobD := h - 4
	knobX := state ? (w - 2 - knobD) : 2
	brush := Gdip_BrushCreateSolid(0xffffffff)
	Gdip_FillEllipse(g, brush, knobX, 2, knobD, knobD)
	Gdip_DeleteBrush(brush)
	hBM := Gdip_CreateHBITMAPFromBitmap(bmp)
	Gdip_DisposeImage(bmp)
	Gdip_DeleteGraphics(g)
	return hBM
}

WebButtonClickEvent(button) {
	btn := StrLower(button)
	switch btn {
		case "start-button":
			return SetTimer(start, -50)
		case "pause-button":
			return nm_pause()
		case "stop-button":
			return stop()
		case "autoclick-button":
			return autoclicker()
		case "status-button":
			return timers()
		; --- Settings tab action buttons ---
		case "set-reset-field-defaults":
			return nm_ResetFieldDefaultGUI()
		case "set-reset-all":
			return nm_ResetConfig()
		case "set-test-reconnect":
			return nm_testReconnect()
		; --- Status tab action buttons ---
		case "st-change-discord":
			return nm_WebhookGUI()
		case "st-reset-total-stats":
			return nm_ResetTotalStats()
		; --- Misc tab launcher buttons ---
		case "misc-basic-egg":
			return nm_BasicEggHatcher()
		case "misc-bitterberry":
			return nm_BitterberryFeeder()
		case "misc-auto-jelly":
			return blc_mutations()
		case "misc-bee-list":
			return nm_GenerateBeeList()
		; --- Misc tab: tools that are now embedded in the web GUI ---
		; These "popups" are no longer opened from the web GUI, but the classic
		; entry points are kept for backwards compatibility.
		case "misc-calculators":
			return nm_BSSCalculators()
		case "misc-ticket-calc":
			return Run("https://docs.google.com/spreadsheets/d/1_5JP_9uZUv7PUqjL76T5orEA3MIHe4R8gLu27L8KJ-A/")
		case "misc-ssa-calc":
			return Run("https://docs.google.com/spreadsheets/d/1nupF_6g1TLJk1W5MpLBsfe1yk6C99-ooMMffuxdn580/")
		case "misc-bond-calc":
			return Run("https://docs.google.com/spreadsheets/d/1TFTAahwsB4WRmRkX4YiM8mPQyk53CDmfAKOSOYv-Bow/")
		case "misc-beequip-calc":
			return Run("https://docs.google.com/spreadsheets/d/10_7oay1yHgykAccrhqYp5gr-P_0jpEKMbTJS9ty4JA8/")
		case "misc-open-log":
			return Run('explorer.exe /e, /n, /select,"' A_WorkingDir '\settings\debug_log.txt"')
		case "misc-copy-logs":
			return nm_copyDebugLog()
		case "misc-reset-hotkeys":
			return nm_WebResetHotkeys()
		case "misc-fps":
			return robloxFPSGui()
		case "misc-autoclicker-settings":
			return nm_AutoClickerButton()
		case "misc-hotkeys":
			return nm_HotkeyGUI()
		case "misc-debug":
			return nm_DebugLogGUI()
		case "misc-autostart":
			return nm_AutoStartManager()
		case "misc-night-announcement":
			return nm_NightAnnouncementGUI()
		case "misc-report-bug":
			return nm_ReportBugButton()
		case "misc-suggest":
			return nm_MakeSuggestionButton()
		case "misc-export-settings", "misc-import-settings":
			return
		default:
			MsgBox(button)
	}
}

; Wrapper registered as the web host object ("ahkUpdateState"). It guarantees that a
; bad bridge message can never surface as an unhandled promise rejection in the page,
; and records the exact error (message + offending variable + line) for diagnosis.
WebUpdateStateSafe(payload) {
	global MyWindow
	try {
		WebUpdateState(payload)
	} catch as e {
		msg := "", extra := "", line := ""
		try msg := e.Message
		try extra := e.Extra
		try line := e.Line
		OutputDebug "[ahk] WebUpdateState error: " msg " | " extra " | line " line
		try FileAppend A_Now " | " msg " | var=" extra " | line=" line " | payload=" SubStr(payload, 1, 300) "`n", "settings\nm_web_errors.txt"
	}
}

; Send a pattern file's source text to the web GUI so the Gather tab can render the
; pattern animation. The web side asks with {"type":"patternRequest","key":"<name>"};
; we reply with {"type":"patternText","key":"<name>","text":"<source>"} (text is ""
; when the file is missing). The name is restricted to the simple set the dropdown
; uses, which also blocks path traversal (no backslash / slash / dot / colon).
nm_WebSendPatternText(name) {
	global MyWindow
	if !IsSet(MyWindow)
		return
	text := ""
	if (name ~= "i)^[A-Za-z0-9_\- ]+$") {
		filePath := A_WorkingDir "\patterns\" name ".ahk"
		try {
			if FileExist(filePath)
				text := FileRead(filePath, "UTF-8")
		} catch as e {
			OutputDebug "[ahk] pattern read failed: " name " | " e.Message
		}
	} else {
		OutputDebug "[ahk] pattern request rejected (bad name): " name
	}
	msg := '{"type":"patternText","key":"' name '","text":"' nm_JsonEscapeStr(text) '"}'
	OutputDebug "[ahk] send patternText " name " (" StrLen(text) " chars)"
	try MyWindow.PostWebMessageAsString(msg)
}

; Push the live list of installed pattern names to the web Gather dropdown, so the
; dropdown is driven by \patterns\ instead of the static list baked into index.html.
; Sent on init (see SendBootstrapState) and whenever the web asks with
; {"type":"patternListRequest"}.
nm_WebSendPatternList() {
	global MyWindow, patternlist
	if !IsSet(MyWindow)
		return
	list := IsSet(patternlist) ? patternlist : []
	msg := '{"type":"patternList","patterns":' JSON.stringify(list) '}'
	OutputDebug "[ahk] send patternList (" list.Length " patterns)"
	try MyWindow.PostWebMessageAsString(msg)
}

; Minimal JSON string escaper for a value embedded in a hand-built message (the
; backslash MUST be replaced first). Kept explicit instead of relying on a
; Stringify() helper so the escape rules are obvious and self-contained.
nm_JsonEscapeStr(s) {
	s := StrReplace(s, "\", "\\")
	s := StrReplace(s, '"', '\"')
	s := StrReplace(s, "`r", "\r")
	s := StrReplace(s, "`n", "\n")
	s := StrReplace(s, "`t", "\t")
	return s
}

WebUpdateState(payload) {
	global FieldName1, FieldName2, FieldName3, MainGui
	global FieldPattern1, FieldPattern2, FieldPattern3, FieldPatternSize1, FieldPatternSize2, FieldPatternSize3
	global FieldPatternReps1, FieldPatternReps2, FieldPatternReps3, FieldDriftCheck1, FieldDriftCheck2, FieldDriftCheck3
	global FieldPatternShift1, FieldPatternShift2, FieldPatternShift3, FieldPatternInvertFB1, FieldPatternInvertFB2, FieldPatternInvertFB3
	global FieldPatternInvertLR1, FieldPatternInvertLR2, FieldPatternInvertLR3, FieldRotateDirection1, FieldRotateDirection2, FieldRotateDirection3
	global FieldRotateTimes1, FieldRotateTimes2, FieldRotateTimes3, FieldUntilMins1, FieldUntilMins2, FieldUntilMins3
	global FieldUntilPack1, FieldUntilPack2, FieldUntilPack3, FieldReturnType1, FieldReturnType2, FieldReturnType3
	global FieldSprinklerLoc1, FieldSprinklerLoc2, FieldSprinklerLoc3, FieldSprinklerDist1, FieldSprinklerDist2, FieldSprinklerDist3
	global ClockCheck, MondoBuffCheck, MondoAction, MondoLootDirection, AntPassCheck, RoboPassCheck, HoneystormCheck, HoneyDisCheck
	global TreatDisCheck, BlueberryDisCheck, StrawberryDisCheck, CoconutDisCheck, RoyalJellyDisCheck, GlueDisCheck
	global KillBugRunGatherInterrupt, KillBugRunRespawnTime, KillLadybugsMode, KillRhinoBeetlesMode, KillSpiderMode, KillMantisMode, KillScorpionsMode, KillWerewolfMode
	global KillViciousBeeEnabled, KillViciousBeeOnlyDaily, KillViciousBeeFieldClover, KillViciousBeeFieldSpider, KillViciousBeeFieldCactus
	global KillViciousBeeFieldRose, KillViciousBeeFieldMountainTop, KillViciousBeeFieldPepper
	global KillKingBeetleEnabled, KillKingBeetleWaitBabyLove, KillKingBeetleAmuletAction
	global KillTunnelBearEnabled, KillTunnelBearWaitBabyLove
	global KillCocoCrabEnabled
	global KillCommandoChickEnabled, KillCommandoChickLevel, KillCommandoChickHP, KillCommandoChickTime
	global KillStumpSnailEnabled, KillStumpSnailHP, KillStumpSnailAmuletAction, KillStumpSnailTime
	; Boost tab (web -> classic). Without these declarations the assignments further down
	; only created function-local copies, so the real globals never changed and the
	; classic GUI / macro never saw the web-side edits.
	global FieldBooster1, FieldBooster2, FieldBooster3, FieldBoosterMins, BoostChaserCheck
	global AutoFieldBoostActive, AutoFieldBoostRefresh, SprinklerType
	global HotbarWhile2, HotbarWhile3, HotbarWhile4, HotbarWhile5, HotbarWhile6, HotbarWhile7
	global HotbarTime2, HotbarTime3, HotbarTime4, HotbarTime5, HotbarTime6, HotbarTime7
	global BlueFlowerBoosterCheck, BambooBoosterCheck, PineTreeBoosterCheck, DandelionBoosterCheck
	global SunflowerBoosterCheck, CloverBoosterCheck, SpiderBoosterCheck, PineappleBoosterCheck
	global CactusBoosterCheck, PumpkinBoosterCheck, MushroomBoosterCheck, StrawberryBoosterCheck
	global RoseBoosterCheck, PepperBoosterCheck, StumpBoosterCheck, CoconutBoosterCheck
	global StickerStackCheck, StickerStackMode, StickerStackTimer, StickerStackItem
	global StickerStackHive, StickerStackCub, StickerStackVoucher
	global StickerPrinterCheck, StickerPrinterEgg
	try {
		data := JSON.parse(payload)
	} catch {
		OutputDebug "[ahk] JSON parse failed: " payload
		return
	}

	switch data["type"] {
		case "gatherFields":
			OutputDebug "[ahk] recv gatherFields"
			try {
				fields := data["fields"]
				if IsSet(fields) {
					; Add / change fields. nm_UpdateGUIVar() mirrors the value into the classic GUI
					; and (for FieldNameN) runs nm_FieldSelectN, which enables the per-field controls
					; and applies the field's defaults. Without it, adding/renaming a field in the web
					; GUI only changed the global + INI while the classic Gather tab stayed disabled.
					loop 3 {
						n := A_Index
						vname := "FieldName" n
						if (fields.Length >= n && fields[n]) {
							newName := nm_FormatFieldName(fields[n])
							if (!IsSet(%vname%) || (%vname% != newName)) {
								try %vname% := newName
								try IniWrite newName, "settings\nm_config.ini", "Gather", vname
								try nm_UpdateGUIVar(vname)
							}
						} else if (n >= 2) {
							; A field removed in the web GUI has to be cleared in the classic GUI too,
							; otherwise FieldName2/3 keep a stale copy of FieldName1. Field 1 is never
							; cleared because its classic DropDownList has no "None" entry.
							if (!IsSet(%vname%) || (%vname% != "None")) {
								try %vname% := "None"
								try IniWrite "None", "settings\nm_config.ini", "Gather", vname
								try nm_UpdateGUIVar(vname)
							}
						}
					}
				}
			}

		case "gatherField":
			OutputDebug "[ahk] recv gatherField " data["num"] " " data["key"] "=" data["value"]
			num := data["num"], key := data["key"], value := data["value"]
			if (num = 1) {
				switch key {
					case "pattern": FieldPattern1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPattern1"), MainGui["FieldPattern1"].Text := value
					case "size": FieldPatternSize1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternSize1")
					case "reps": FieldPatternReps1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternReps1")
					case "drift": FieldDriftCheck1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldDriftCheck1")
					case "shift": FieldPatternShift1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternShift1")
					case "invertfb": FieldPatternInvertFB1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternInvertFB1")
					case "invertlr": FieldPatternInvertLR1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternInvertLR1")
					case "rotdir": FieldRotateDirection1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldRotateDirection1")
					case "rottime": FieldRotateTimes1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldRotateTimes1")
					case "mins": FieldUntilMins1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldUntilMins1")
					case "pack": FieldUntilPack1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldUntilPack1")
					case "return": FieldReturnType1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldReturnType1")
					case "sprinkloc": FieldSprinklerLoc1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldSprinklerLoc1")
					case "sprdist": FieldSprinklerDist1 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldSprinklerDist1")
				}
			}
			else if (num = 2) {
				switch key {
					case "pattern": FieldPattern2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPattern2"), MainGui["FieldPattern2"].Text := value
					case "size": FieldPatternSize2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternSize2")
					case "reps": FieldPatternReps2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternReps2")
					case "drift": FieldDriftCheck2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldDriftCheck2")
					case "shift": FieldPatternShift2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternShift2")
					case "invertfb": FieldPatternInvertFB2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternInvertFB2")
					case "invertlr": FieldPatternInvertLR2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternInvertLR2")
					case "rotdir": FieldRotateDirection2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldRotateDirection2")
					case "rottime": FieldRotateTimes2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldRotateTimes2")
					case "mins": FieldUntilMins2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldUntilMins2")
					case "pack": FieldUntilPack2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldUntilPack2")
					case "return": FieldReturnType2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldReturnType2")
					case "sprinkloc": FieldSprinklerLoc2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldSprinklerLoc2")
					case "sprdist": FieldSprinklerDist2 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldSprinklerDist2")
				}
			}
			else if (num = 3) {
				switch key {
					case "pattern": FieldPattern3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPattern3"), MainGui["FieldPattern3"].Text := value
					case "size": FieldPatternSize3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternSize3")
					case "reps": FieldPatternReps3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternReps3")
					case "drift": FieldDriftCheck3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldDriftCheck3")
					case "shift": FieldPatternShift3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternShift3")
					case "invertfb": FieldPatternInvertFB3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternInvertFB3")
					case "invertlr": FieldPatternInvertLR3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldPatternInvertLR3")
					case "rotdir": FieldRotateDirection3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldRotateDirection3")
					case "rottime": FieldRotateTimes3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldRotateTimes3")
					case "mins": FieldUntilMins3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldUntilMins3")
					case "pack": FieldUntilPack3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldUntilPack3")
					case "return": FieldReturnType3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldReturnType3")
					case "sprinkloc": FieldSprinklerLoc3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldSprinklerLoc3")
					case "sprdist": FieldSprinklerDist3 := value, IniWrite(value, "settings\nm_config.ini", "Gather", "FieldSprinklerDist3")
				}
			}

			; Mirror the new value into the classic GUI (web -> classic), and cover the
			; per-field keys the hand-written cases above don't handle
			; (rotdir / sprinkloc / sprdist). Re-writing the global + INI is harmless.
			if (num >= 1 && num <= 3) {
				gmap := Map("pattern", "FieldPattern"
					, "size", "FieldPatternSize", "reps", "FieldPatternReps"
					, "drift", "FieldDriftCheck", "shift", "FieldPatternShift"
					, "invertfb", "FieldPatternInvertFB", "invertlr", "FieldPatternInvertLR"
					, "rotdir", "FieldRotateDirection", "rottime", "FieldRotateTimes"
					, "mins", "FieldUntilMins", "pack", "FieldUntilPack", "return", "FieldReturnType"
					, "sprinkloc", "FieldSprinklerLoc", "sprdist", "FieldSprinklerDist")
				if gmap.Has(key) {
					vname := gmap[key] num
					try %vname% := value
					try IniWrite value, "settings\nm_config.ini", "Gather", vname
					try nm_UpdateGUIVar(vname)
				}
			}

		case "collect":
			key := data["key"], value := data["value"]
			OutputDebug "[ahk] recv collect " key "=" value
			if (key = "MondoBuffCheck") {
				MondoBuffCheck := value ? 1 : 0
				IniWrite MondoBuffCheck, "settings\nm_config.ini", "Collect", "MondoBuffCheck"
				try MainGui["MondoBuffCheck"].Value := MondoBuffCheck
			}
			else if (key = "MondoAction") {
				MondoAction := value
				IniWrite MondoAction, "settings\nm_config.ini", "Collect", "MondoAction"
				try MainGui["MondoAction"].Text := MondoAction
			}
			else if (key = "MondoLootDirection") {
				MondoLootDirection := value
				IniWrite MondoLootDirection, "settings\nm_config.ini", "Collect", "MondoLootDirection"
				try MainGui["MondoLootDirection"].Text := MondoLootDirection
			}
			else if (key = "AntPassCheck") {
				AntPassCheck := value ? 1 : 0
				IniWrite AntPassCheck, "settings\nm_config.ini", "Collect", "AntPassCheck"
				try MainGui["AntPassCheck"].Value := AntPassCheck
			}
			else if (key = "ClockCheck") {
				ClockCheck := value ? 1 : 0
				IniWrite ClockCheck, "settings\nm_config.ini", "Collect", "ClockCheck"
				try MainGui["ClockCheck"].Value := ClockCheck
			}
			else if (key = "RoboPassCheck") {
				RoboPassCheck := value ? 1 : 0
				IniWrite RoboPassCheck, "settings\nm_config.ini", "Collect", "RoboPassCheck"
				try MainGui["RoboPassCheck"].Value := RoboPassCheck
			}
			else if (key = "HoneystormCheck") {
				HoneystormCheck := value ? 1 : 0
				IniWrite HoneystormCheck, "settings\nm_config.ini", "Collect", "HoneystormCheck"
				try MainGui["HoneystormCheck"].Value := HoneystormCheck
			}
			else if (key = "HoneyDisCheck") {
				HoneyDisCheck := value ? 1 : 0
				IniWrite HoneyDisCheck, "settings\nm_config.ini", "Collect", "HoneyDisCheck"
				try MainGui["HoneyDisCheck"].Value := HoneyDisCheck
			}
			else if (key = "TreatDisCheck") {
				TreatDisCheck := value ? 1 : 0
				IniWrite TreatDisCheck, "settings\nm_config.ini", "Collect", "TreatDisCheck"
				try MainGui["TreatDisCheck"].Value := TreatDisCheck
			}
			else if (key = "BlueberryDisCheck") {
				BlueberryDisCheck := value ? 1 : 0
				IniWrite BlueberryDisCheck, "settings\nm_config.ini", "Collect", "BlueberryDisCheck"
				try MainGui["BlueberryDisCheck"].Value := BlueberryDisCheck
			}
			else if (key = "StrawberryDisCheck") {
				StrawberryDisCheck := value ? 1 : 0
				IniWrite StrawberryDisCheck, "settings\nm_config.ini", "Collect", "StrawberryDisCheck"
				try MainGui["StrawberryDisCheck"].Value := StrawberryDisCheck
			}
			else if (key = "CoconutDisCheck") {
				CoconutDisCheck := value ? 1 : 0
				IniWrite CoconutDisCheck, "settings\nm_config.ini", "Collect", "CoconutDisCheck"
				try MainGui["CoconutDisCheck"].Value := CoconutDisCheck
			}
			else if (key = "RoyalJellyDisCheck") {
				RoyalJellyDisCheck := value ? 1 : 0
				IniWrite RoyalJellyDisCheck, "settings\nm_config.ini", "Collect", "RoyalJellyDisCheck"
				try MainGui["RoyalJellyDisCheck"].Value := RoyalJellyDisCheck
			}
			else if (key = "GlueDisCheck") {
				GlueDisCheck := value ? 1 : 0
				IniWrite GlueDisCheck, "settings\nm_config.ini", "Collect", "GlueDisCheck"
				try MainGui["GlueDisCheck"].Value := GlueDisCheck
			}
			; --- Blender slots (item / amount / repeat) ---
			; NOTE the prefix lengths: "BlenderItem"=11, "BlenderIndex"=12, "BlenderAmount"=13.
			; (These used to be off by one, so amount/index never matched and fell through to
			; the generic branch, writing them into the wrong INI section.)
			else if (SubStr(key, 1, 11) = "BlenderItem") {
				nm_WebApplySetting("Blender", key, nm_WebBlenderItemFromWeb(value))
			}
			else if (SubStr(key, 1, 13) = "BlenderAmount" || SubStr(key, 1, 12) = "BlenderIndex") {
				nm_WebApplySetting("Blender", key, value)
			}
			; --- Wind Shrine slots ---
			else if (SubStr(key, 1, 10) = "ShrineItem") {
				nm_WebApplySetting("Shrine", key, nm_WebBlenderItemFromWeb(value))
			}
			else if (SubStr(key, 1, 12) = "ShrineAmount" || SubStr(key, 1, 11) = "ShrineIndex") {
				nm_WebApplySetting("Shrine", key, value)
			}
			; --- Beesmas + Memory Match checkboxes ---
			else if (key = "BeesmasGatherInterruptCheck" || key = "StockingsCheck" || key = "WreathCheck" || key = "FeastCheck" || key = "RBPDelevelCheck" || key = "GingerbreadCheck" || key = "SnowMachineCheck" || key = "CandlesCheck" || key = "SamovarCheck" || key = "LidArtCheck" || key = "GummyBeaconCheck" || key = "NormalMemoryMatchCheck" || key = "MegaMemoryMatchCheck" || key = "ExtremeMemoryMatchCheck") {
				nm_WebApplySetting("Collect", key, value ? 1 : 0)
			}
			else {
				; everything else persists generically into the Collect section
				nm_WebApplySetting("Collect", key, value)
			}

		case "kill":
			key := data["key"], value := data["value"]
			OutputDebug "[ahk] recv kill " key "=" value
			; Keep the legacy classic GUI globals (which the macro runtime reads) and the
			; classic controls in step with the web Kill tab. The hand-written cases below
			; only ever set the classic *control* values, and assigning a control's Value
			; does NOT update its associated global, so the runtime used to ignore web edits.
			nm_WebKillToClassic(key, value)
			if (key = "KillBugRunGatherInterrupt") {
				KillBugRunGatherInterrupt := value ? 1 : 0
				IniWrite KillBugRunGatherInterrupt, "settings\nm_config.ini", "Kill", "BugRunGatherInterrupt"
				SendKillMessage(key, KillBugRunGatherInterrupt)
				; Update Classic GUI checkbox
				try MainGui["BugrunInterruptCheck"].Value := KillBugRunGatherInterrupt
				; Update Collect section for backward compatibility
				IniWrite KillBugRunGatherInterrupt, "settings\nm_config.ini", "Collect", "BugrunInterruptCheck"
			}
			else if (key = "KillBugRunRespawnTime") {
				KillBugRunRespawnTime := value
				IniWrite KillBugRunRespawnTime, "settings\nm_config.ini", "Kill", "BugRunRespawnTime"
				SendKillMessage(key, KillBugRunRespawnTime)
				; Update Classic GUI and Collect section
				try MainGui["MonsterRespawnTime"].Value := value
				IniWrite value, "settings\nm_config.ini", "Collect", "MonsterRespawnTime"
			}
			else if (key = "KillLadybugsMode") {
				KillLadybugsMode := value
				IniWrite KillLadybugsMode, "settings\nm_config.ini", "Kill", "LadybugsMode"
				SendKillMessage(key, KillLadybugsMode)
				; Map Web Off/Kill/Kill+Loot to Classic GUI Loot checkbox
				; Off: don't loot (0)
				; Kill: don't loot (0)
				; Kill+Loot: loot (1)
				if (value = "Kill+Loot") {
					try MainGui["BugrunLadybugsLoot"].Value := 1
				} else {
					try MainGui["BugrunLadybugsLoot"].Value := 0
				}
				; Update Kill checkbox (0 = Off, 1 = Kill or Kill+Loot)
				try MainGui["BugrunLadybugsCheck"].Value := (value != "Off") ? 1 : 0
			}
			else if (key = "KillRhinoBeetlesMode") {
				KillRhinoBeetlesMode := value
				IniWrite KillRhinoBeetlesMode, "settings\nm_config.ini", "Kill", "RhinoBeetlesMode"
				SendKillMessage(key, KillRhinoBeetlesMode)
				if (value = "Kill+Loot") {
					try MainGui["BugrunRhinoBeetlesLoot"].Value := 1
				} else {
					try MainGui["BugrunRhinoBeetlesLoot"].Value := 0
				}
				try MainGui["BugrunRhinoBeetlesCheck"].Value := (value != "Off") ? 1 : 0
			}
			else if (key = "KillSpiderMode") {
				KillSpiderMode := value
				IniWrite KillSpiderMode, "settings\nm_config.ini", "Kill", "SpiderMode"
				SendKillMessage(key, KillSpiderMode)
				if (value = "Kill+Loot") {
					try MainGui["BugrunSpiderLoot"].Value := 1
				} else {
					try MainGui["BugrunSpiderLoot"].Value := 0
				}
				try MainGui["BugrunSpiderCheck"].Value := (value != "Off") ? 1 : 0
			}
			else if (key = "KillMantisMode") {
				KillMantisMode := value
				IniWrite KillMantisMode, "settings\nm_config.ini", "Kill", "MantisMode"
				SendKillMessage(key, KillMantisMode)
				if (value = "Kill+Loot") {
					try MainGui["BugrunMantisLoot"].Value := 1
				} else {
					try MainGui["BugrunMantisLoot"].Value := 0
				}
				try MainGui["BugrunMantisCheck"].Value := (value != "Off") ? 1 : 0
			}
			else if (key = "KillScorpionsMode") {
				KillScorpionsMode := value
				IniWrite KillScorpionsMode, "settings\nm_config.ini", "Kill", "ScorpionsMode"
				SendKillMessage(key, KillScorpionsMode)
				if (value = "Kill+Loot") {
					try MainGui["BugrunScorpionsLoot"].Value := 1
				} else {
					try MainGui["BugrunScorpionsLoot"].Value := 0
				}
				try MainGui["BugrunScorpionsCheck"].Value := (value != "Off") ? 1 : 0
			}
			else if (key = "KillWerewolfMode") {
				KillWerewolfMode := value
				IniWrite KillWerewolfMode, "settings\nm_config.ini", "Kill", "WerewolfMode"
				SendKillMessage(key, KillWerewolfMode)
				if (value = "Kill+Loot") {
					try MainGui["BugrunWerewolfLoot"].Value := 1
				} else {
					try MainGui["BugrunWerewolfLoot"].Value := 0
				}
				try MainGui["BugrunWerewolfCheck"].Value := (value != "Off") ? 1 : 0
			}
			else if (key = "KillViciousBeeEnabled") {
				KillViciousBeeEnabled := value ? 1 : 0
				IniWrite KillViciousBeeEnabled, "settings\nm_config.ini", "Kill", "ViciousBeeEnabled"
				SendKillMessage(key, KillViciousBeeEnabled)
				try MainGui["StingerCheck"].Value := KillViciousBeeEnabled
			}
			else if (key = "KillViciousBeeOnlyDaily") {
				KillViciousBeeOnlyDaily := value ? 1 : 0
				IniWrite KillViciousBeeOnlyDaily, "settings\nm_config.ini", "Kill", "ViciousBeeOnlyDaily"
				SendKillMessage(key, KillViciousBeeOnlyDaily)
				try MainGui["StingerDailyBonusCheck"].Value := KillViciousBeeOnlyDaily
			}
			else if (key = "KillViciousBeeFieldClover") {
				KillViciousBeeFieldClover := value ? 1 : 0
				IniWrite KillViciousBeeFieldClover, "settings\nm_config.ini", "Kill", "ViciousBeeFieldClover"
				SendKillMessage(key, KillViciousBeeFieldClover)
				try MainGui["StingerCloverCheck"].Value := KillViciousBeeFieldClover
			}
			else if (key = "KillViciousBeeFieldSpider") {
				KillViciousBeeFieldSpider := value ? 1 : 0
				IniWrite KillViciousBeeFieldSpider, "settings\nm_config.ini", "Kill", "ViciousBeeFieldSpider"
				SendKillMessage(key, KillViciousBeeFieldSpider)
				try MainGui["StingerSpiderCheck"].Value := KillViciousBeeFieldSpider
			}
			else if (key = "KillViciousBeeFieldCactus") {
				KillViciousBeeFieldCactus := value ? 1 : 0
				IniWrite KillViciousBeeFieldCactus, "settings\nm_config.ini", "Kill", "ViciousBeeFieldCactus"
				SendKillMessage(key, KillViciousBeeFieldCactus)
				try MainGui["StingerCactusCheck"].Value := KillViciousBeeFieldCactus
			}
			else if (key = "KillViciousBeeFieldRose") {
				KillViciousBeeFieldRose := value ? 1 : 0
				IniWrite KillViciousBeeFieldRose, "settings\nm_config.ini", "Kill", "ViciousBeeFieldRose"
				SendKillMessage(key, KillViciousBeeFieldRose)
				try MainGui["StingerRoseCheck"].Value := KillViciousBeeFieldRose
			}
			else if (key = "KillViciousBeeFieldMountainTop") {
				KillViciousBeeFieldMountainTop := value ? 1 : 0
				IniWrite KillViciousBeeFieldMountainTop, "settings\nm_config.ini", "Kill", "ViciousBeeFieldMountainTop"
				SendKillMessage(key, KillViciousBeeFieldMountainTop)
				try MainGui["StingerMountainTopCheck"].Value := KillViciousBeeFieldMountainTop
			}
			else if (key = "KillViciousBeeFieldPepper") {
				KillViciousBeeFieldPepper := value ? 1 : 0
				IniWrite KillViciousBeeFieldPepper, "settings\nm_config.ini", "Kill", "ViciousBeeFieldPepper"
				SendKillMessage(key, KillViciousBeeFieldPepper)
				try MainGui["StingerPepperCheck"].Value := KillViciousBeeFieldPepper
			}
			else if (key = "KillKingBeetleEnabled") {
				KillKingBeetleEnabled := value ? 1 : 0
				IniWrite KillKingBeetleEnabled, "settings\nm_config.ini", "Kill", "KingBeetleEnabled"
				SendKillMessage(key, KillKingBeetleEnabled)
				try MainGui["KingBeetleCheck"].Value := KillKingBeetleEnabled
			}
			else if (key = "KillKingBeetleWaitBabyLove") {
				KillKingBeetleWaitBabyLove := value ? 1 : 0
				IniWrite KillKingBeetleWaitBabyLove, "settings\nm_config.ini", "Kill", "KingBeetleWaitBabyLove"
				SendKillMessage(key, KillKingBeetleWaitBabyLove)
			}
			else if (key = "KillKingBeetleAmuletAction") {
				KillKingBeetleAmuletAction := value
				IniWrite KillKingBeetleAmuletAction, "settings\nm_config.ini", "Kill", "KingBeetleAmuletAction"
				SendKillMessage(key, KillKingBeetleAmuletAction)
				; Update Classic GUI checkbox and text
				try {
					kbMode := (value = "Keep Old") ? 1 : 0
					MainGui["KingBeetleAmuletMode"].Value := kbMode
					MainGui["KingBeetleAmuletModeText"].Text := (kbMode = 1) ? " Keep Old" : "Do Nothing"
					IniWrite kbMode, "settings\nm_config.ini", "Collect", "KingBeetleAmuletMode"
				} catch {
					OutputDebug "[ahk] Error updating KingBeetleAmuletMode"
				}
			}
			else if (key = "KillTunnelBearEnabled") {
				KillTunnelBearEnabled := value ? 1 : 0
				IniWrite KillTunnelBearEnabled, "settings\nm_config.ini", "Kill", "TunnelBearEnabled"
				SendKillMessage(key, KillTunnelBearEnabled)
				try MainGui["TunnelBearCheck"].Value := KillTunnelBearEnabled
			}
			else if (key = "KillTunnelBearWaitBabyLove") {
				KillTunnelBearWaitBabyLove := value ? 1 : 0
				IniWrite KillTunnelBearWaitBabyLove, "settings\nm_config.ini", "Kill", "TunnelBearWaitBabyLove"
				SendKillMessage(key, KillTunnelBearWaitBabyLove)
			}
			else if (key = "KillCocoCrabEnabled") {
				KillCocoCrabEnabled := value ? 1 : 0
				IniWrite KillCocoCrabEnabled, "settings\nm_config.ini", "Kill", "CocoCrabEnabled"
				SendKillMessage(key, KillCocoCrabEnabled)
				try MainGui["CocoCrabCheck"].Value := KillCocoCrabEnabled
			}
			else if (key = "KillCommandoChickEnabled") {
				KillCommandoChickEnabled := value ? 1 : 0
				IniWrite KillCommandoChickEnabled, "settings\nm_config.ini", "Kill", "CommandoChickEnabled"
				SendKillMessage(key, KillCommandoChickEnabled)
				try MainGui["CommandoCheck"].Value := KillCommandoChickEnabled
			}
			else if (key = "KillCommandoChickLevel") {
				KillCommandoChickLevel := value
				IniWrite KillCommandoChickLevel, "settings\nm_config.ini", "Kill", "CommandoChickLevel"
				SendKillMessage(key, KillCommandoChickLevel)
				; Update Classic GUI controls
				try MainGui["ChickLevel"].Value := value
				try MainGui["ChickLevelText"].Text := value
				; Update Collect section for backward compatibility
				IniWrite value, "settings\nm_config.ini", "Collect", "ChickLevel"
			}
			else if (key = "KillCommandoChickHP") {
				global CommandoChickHealth, InputChickHealth
				KillCommandoChickHP := value
				IniWrite KillCommandoChickHP, "settings\nm_config.ini", "Kill", "CommandoChickHP"
				SendKillMessage(key, KillCommandoChickHP)
				; Update Classic GUI controls
				try {
					MainGui["ChickHealthEdit"].Value := value
					ChickLevel := MainGui["ChickLevel"].Value
					MaxHealth := CommandoChickHealth.Has(ChickLevel) ? CommandoChickHealth[ChickLevel] : 10000000
					InputChickHealth := Round(Min(100, ((value || 0) / MaxHealth) * 100), 2)
					MainGui["ChickHealthText"].Opt("+c" Format("0x{1:02x}{2:02x}{3:02x}", Round(Min(3*(100-InputChickHealth), 150)), Round(Min(3*InputChickHealth, 150)), 0) " +Redraw")
					MainGui["ChickHealthText"].Text := InputChickHealth "%"
					; Update Collect section for backward compatibility
					IniWrite InputChickHealth, "settings\nm_config.ini", "Collect", "InputChickHealth"
				}
			}
			else if (key = "KillCommandoChickTime") {
				global ChickTime
				KillCommandoChickTime := value
				IniWrite KillCommandoChickTime, "settings\nm_config.ini", "Kill", "CommandoChickTime"
				SendKillMessage(key, KillCommandoChickTime)
				; Update Classic GUI controls - convert time string to UpDown index
				try {
					static timeMap := Map("5m", 1, "10m", 2, "15m", 3, "Kill", 4)
					if (timeMap.Has(value)) {
						MainGui["ChickTimeUpDown"].Value := timeMap[value]
						ChickTime := (value = "Kill") ? "Kill" : SubStr(value, 1, -1)
						MainGui["ChickTimeText"].Text := value
						; Update Collect section for backward compatibility
						IniWrite ChickTime, "settings\nm_config.ini", "Collect", "ChickTime"
					}
				}
			}
			else if (key = "KillStumpSnailEnabled") {
				KillStumpSnailEnabled := value ? 1 : 0
				IniWrite KillStumpSnailEnabled, "settings\nm_config.ini", "Kill", "StumpSnailEnabled"
				SendKillMessage(key, KillStumpSnailEnabled)
				try MainGui["StumpSnailCheck"].Value := KillStumpSnailEnabled
			}
			else if (key = "KillStumpSnailHP") {
				global InputSnailHealth
				KillStumpSnailHP := value
				IniWrite KillStumpSnailHP, "settings\nm_config.ini", "Kill", "StumpSnailHP"
				SendKillMessage(key, KillStumpSnailHP)
				; Update Classic GUI controls
				try {
					MainGui["SnailHealthEdit"].Value := value
					InputSnailHealth := Round(((value || 0) / 30000000) * 100, 2)
					MainGui["SnailHealthText"].Opt("+c" Format("0x{1:02x}{2:02x}{3:02x}", Round(Min(3*(100-InputSnailHealth), 150)), Round(Min(3*InputSnailHealth, 150)), 0) " +Redraw")
					MainGui["SnailHealthText"].Text := InputSnailHealth "%"
					; Update Collect section for backward compatibility
					IniWrite InputSnailHealth, "settings\nm_config.ini", "Collect", "InputSnailHealth"
				}
			}
			else if (key = "KillStumpSnailAmuletAction") {
				KillStumpSnailAmuletAction := value
				IniWrite KillStumpSnailAmuletAction, "settings\nm_config.ini", "Kill", "StumpSnailAmuletAction"
				SendKillMessage(key, KillStumpSnailAmuletAction)
				; Update Classic GUI checkbox and text
				try {
					snailMode := (value = "Keep Old") ? 1 : 0
					MainGui["ShellAmuletMode"].Value := snailMode
					MainGui["ShellAmuletModeText"].Text := (snailMode = 1) ? " Keep Old" : "Do Nothing"
					IniWrite snailMode, "settings\nm_config.ini", "Collect", "ShellAmuletMode"
				} catch {
					OutputDebug "[ahk] Error updating ShellAmuletMode"
				}
			}
			else if (key = "KillStumpSnailTime") {
			global SnailTime
			KillStumpSnailTime := value
			IniWrite KillStumpSnailTime, "settings\nm_config.ini", "Kill", "StumpSnailTime"
			SendKillMessage(key, KillStumpSnailTime)
			; Update Classic GUI controls - convert time string to UpDown index
			try {
				static timeMap := Map("5m", 1, "10m", 2, "15m", 3, "Kill", 4)
				if (timeMap.Has(value)) {
					MainGui["SnailTimeUpDown"].Value := timeMap[value]
					SnailTime := (value = "Kill") ? "Kill" : SubStr(value, 1, -1)
					MainGui["SnailTimeText"].Text := value
					; Update Collect section for backward compatibility
					IniWrite SnailTime, "settings\nm_config.ini", "Collect", "SnailTime"
				}
			}
		}
		case "boost":
			key := data["key"], value := data["value"]
			OutputDebug "[ahk] recv boost " key "=" value
			if (key = "FieldBooster1") {
				FieldBooster1 := value
				IniWrite FieldBooster1, "settings\nm_config.ini", "Boost", "FieldBooster1"
				try MainGui["FieldBooster1"].Text := value
				SendBoostMessage(key, value)
			}
			else if (key = "FieldBooster2") {
				FieldBooster2 := value
				IniWrite FieldBooster2, "settings\nm_config.ini", "Boost", "FieldBooster2"
				try MainGui["FieldBooster2"].Text := value
				SendBoostMessage(key, value)
			}
			else if (key = "FieldBooster3") {
				FieldBooster3 := value
				IniWrite FieldBooster3, "settings\nm_config.ini", "Boost", "FieldBooster3"
				try MainGui["FieldBooster3"].Text := value
				SendBoostMessage(key, value)
			}
			else if (key = "FieldBoosterMins") {
				FieldBoosterMins := value
				IniWrite FieldBoosterMins, "settings\nm_config.ini", "Boost", "FieldBoosterMins"
				try MainGui["FieldBoosterMins"].Text := value
				try MainGui["FieldBoosterMinsUpDown"].Value := value // 5
				SendBoostMessage(key, value)
			}
			else if (key = "BoostChaserCheck") {
				BoostChaserCheck := value ? 1 : 0
				IniWrite BoostChaserCheck, "settings\nm_config.ini", "Boost", "BoostChaserCheck"
				try MainGui["BoostChaserCheck"].Value := BoostChaserCheck
				SendBoostMessage(key, BoostChaserCheck)
			}
			else if (key = "BlueFlowerBoosterCheck") {
				BlueFlowerBoosterCheck := value ? 1 : 0
				IniWrite BlueFlowerBoosterCheck, "settings\nm_config.ini", "Boost", "BlueFlowerBoosterCheck"
				try MainGui["BlueFlowerBoosterCheck"].Value := BlueFlowerBoosterCheck
				SendBoostMessage(key, BlueFlowerBoosterCheck)
			}
			else if (key = "BambooBoosterCheck") {
				BambooBoosterCheck := value ? 1 : 0
				IniWrite BambooBoosterCheck, "settings\nm_config.ini", "Boost", "BambooBoosterCheck"
				try MainGui["BambooBoosterCheck"].Value := BambooBoosterCheck
				SendBoostMessage(key, BambooBoosterCheck)
			}
			else if (key = "PineTreeBoosterCheck") {
				PineTreeBoosterCheck := value ? 1 : 0
				IniWrite PineTreeBoosterCheck, "settings\nm_config.ini", "Boost", "PineTreeBoosterCheck"
				try MainGui["PineTreeBoosterCheck"].Value := PineTreeBoosterCheck
				SendBoostMessage(key, PineTreeBoosterCheck)
			}
			else if (key = "DandelionBoosterCheck") {
				DandelionBoosterCheck := value ? 1 : 0
				IniWrite DandelionBoosterCheck, "settings\nm_config.ini", "Boost", "DandelionBoosterCheck"
				try MainGui["DandelionBoosterCheck"].Value := DandelionBoosterCheck
				SendBoostMessage(key, DandelionBoosterCheck)
			}
			else if (key = "SunflowerBoosterCheck") {
				SunflowerBoosterCheck := value ? 1 : 0
				IniWrite SunflowerBoosterCheck, "settings\nm_config.ini", "Boost", "SunflowerBoosterCheck"
				try MainGui["SunflowerBoosterCheck"].Value := SunflowerBoosterCheck
				SendBoostMessage(key, SunflowerBoosterCheck)
			}
			else if (key = "CloverBoosterCheck") {
				CloverBoosterCheck := value ? 1 : 0
				IniWrite CloverBoosterCheck, "settings\nm_config.ini", "Boost", "CloverBoosterCheck"
				try MainGui["CloverBoosterCheck"].Value := CloverBoosterCheck
				SendBoostMessage(key, CloverBoosterCheck)
			}
			else if (key = "SpiderBoosterCheck") {
				SpiderBoosterCheck := value ? 1 : 0
				IniWrite SpiderBoosterCheck, "settings\nm_config.ini", "Boost", "SpiderBoosterCheck"
				try MainGui["SpiderBoosterCheck"].Value := SpiderBoosterCheck
				SendBoostMessage(key, SpiderBoosterCheck)
			}
			else if (key = "PineappleBoosterCheck") {
				PineappleBoosterCheck := value ? 1 : 0
				IniWrite PineappleBoosterCheck, "settings\nm_config.ini", "Boost", "PineappleBoosterCheck"
				try MainGui["PineappleBoosterCheck"].Value := PineappleBoosterCheck
				SendBoostMessage(key, PineappleBoosterCheck)
			}
			else if (key = "CactusBoosterCheck") {
				CactusBoosterCheck := value ? 1 : 0
				IniWrite CactusBoosterCheck, "settings\nm_config.ini", "Boost", "CactusBoosterCheck"
				try MainGui["CactusBoosterCheck"].Value := CactusBoosterCheck
				SendBoostMessage(key, CactusBoosterCheck)
			}
			else if (key = "PumpkinBoosterCheck") {
				PumpkinBoosterCheck := value ? 1 : 0
				IniWrite PumpkinBoosterCheck, "settings\nm_config.ini", "Boost", "PumpkinBoosterCheck"
				try MainGui["PumpkinBoosterCheck"].Value := PumpkinBoosterCheck
				SendBoostMessage(key, PumpkinBoosterCheck)
			}
			else if (key = "MushroomBoosterCheck") {
				MushroomBoosterCheck := value ? 1 : 0
				IniWrite MushroomBoosterCheck, "settings\nm_config.ini", "Boost", "MushroomBoosterCheck"
				try MainGui["MushroomBoosterCheck"].Value := MushroomBoosterCheck
				SendBoostMessage(key, MushroomBoosterCheck)
			}
			else if (key = "StrawberryBoosterCheck") {
				StrawberryBoosterCheck := value ? 1 : 0
				IniWrite StrawberryBoosterCheck, "settings\nm_config.ini", "Boost", "StrawberryBoosterCheck"
				try MainGui["StrawberryBoosterCheck"].Value := StrawberryBoosterCheck
				SendBoostMessage(key, StrawberryBoosterCheck)
			}
			else if (key = "RoseBoosterCheck") {
				RoseBoosterCheck := value ? 1 : 0
				IniWrite RoseBoosterCheck, "settings\nm_config.ini", "Boost", "RoseBoosterCheck"
				try MainGui["RoseBoosterCheck"].Value := RoseBoosterCheck
				SendBoostMessage(key, RoseBoosterCheck)
			}
			else if (key = "PepperBoosterCheck") {
				PepperBoosterCheck := value ? 1 : 0
				IniWrite PepperBoosterCheck, "settings\nm_config.ini", "Boost", "PepperBoosterCheck"
				try MainGui["PepperBoosterCheck"].Value := PepperBoosterCheck
				SendBoostMessage(key, PepperBoosterCheck)
			}
			else if (key = "StumpBoosterCheck") {
				StumpBoosterCheck := value ? 1 : 0
				IniWrite StumpBoosterCheck, "settings\nm_config.ini", "Boost", "StumpBoosterCheck"
				try MainGui["StumpBoosterCheck"].Value := StumpBoosterCheck
				SendBoostMessage(key, StumpBoosterCheck)
			}
			else if (key = "CoconutBoosterCheck") {
				CoconutBoosterCheck := value ? 1 : 0
				IniWrite CoconutBoosterCheck, "settings\nm_config.ini", "Boost", "CoconutBoosterCheck"
				try MainGui["CoconutBoosterCheck"].Value := CoconutBoosterCheck
				SendBoostMessage(key, CoconutBoosterCheck)
			}
			else if (key = "AutoFieldBoostActive") {
				AutoFieldBoostActive := value ? 1 : 0
				IniWrite AutoFieldBoostActive, "settings\nm_config.ini", "Boost", "AutoFieldBoostActive"
				try MainGui["AutoFieldBoostButton"].Text := (AutoFieldBoostActive ? "Auto Field Boost`n[ON]" : "Auto Field Boost`n[OFF]")
				SendBoostMessage(key, AutoFieldBoostActive)
			}
			else if (key = "AutoFieldBoostRefresh") {
				AutoFieldBoostRefresh := value
				IniWrite AutoFieldBoostRefresh, "settings\nm_config.ini", "Boost", "AutoFieldBoostRefresh"
				SendBoostMessage(key, value)
			}
			; --- Hotbar slots (2-7) + sprinkler (slot 1) ---
			else if (SubStr(key, 1, 11) = "HotbarWhile" || SubStr(key, 1, 10) = "HotbarTime") {
				nm_WebApplySetting("Boost", key, value)
			}
			else if (key = "SprinklerType") {
				nm_WebApplySetting("Settings", key, value)
			}
			; The Sticker Printer controls are shown on the web Boost tab, but the
			; setting itself is stored in the [Collect] section like the classic GUI.
			else if (key = "StickerPrinterCheck" || key = "StickerPrinterEgg") {
				nm_WebApplySetting("Collect", key, value)
			}
			else {
				; everything else persists generically into the Boost section
				nm_WebApplySetting("Boost", key, value)
			}
			; mirror boosted-gather-field checkboxes into the classic floating window
			nm_WebMirrorBoostedFieldGui(key)
		case "killSettings":
			OutputDebug "[ahk] recv killSettings"
			try {
				; BUG RUN SETTINGS
				if (data.HasKey("bugRun") && data["bugRun"]) {
					bugRun := data["bugRun"]
					if (bugRun.HasKey("allowGatherInterrupt")) {
						KillBugRunGatherInterrupt := bugRun["allowGatherInterrupt"] ? 1 : 0
						IniWrite KillBugRunGatherInterrupt, "settings\nm_config.ini", "Kill", "BugRunGatherInterrupt"
					}
					if (bugRun.HasKey("respawnTime")) {
						KillBugRunRespawnTime := bugRun["respawnTime"]
						IniWrite KillBugRunRespawnTime, "settings\nm_config.ini", "Kill", "BugRunRespawnTime"
					}
					if (bugRun.HasKey("loot") && bugRun["loot"]) {
						loot := bugRun["loot"]
						if (loot.HasKey("ladybugs")) {
							KillLadybugsMode := loot["ladybugs"]
							IniWrite KillLadybugsMode, "settings\nm_config.ini", "Kill", "LadybugsMode"
						}
						if (loot.HasKey("rhinoBeetles")) {
							KillRhinoBeetlesMode := loot["rhinoBeetles"]
							IniWrite KillRhinoBeetlesMode, "settings\nm_config.ini", "Kill", "RhinoBeetlesMode"
						}
						if (loot.HasKey("spider")) {
							KillSpiderMode := loot["spider"]
							IniWrite KillSpiderMode, "settings\nm_config.ini", "Kill", "SpiderMode"
						}
						if (loot.HasKey("mantis")) {
							KillMantisMode := loot["mantis"]
							IniWrite KillMantisMode, "settings\nm_config.ini", "Kill", "MantisMode"
						}
						if (loot.HasKey("scorpions")) {
							KillScorpionsMode := loot["scorpions"]
							IniWrite KillScorpionsMode, "settings\nm_config.ini", "Kill", "ScorpionsMode"
						}
						if (loot.HasKey("werewolf")) {
							KillWerewolfMode := loot["werewolf"]
							IniWrite KillWerewolfMode, "settings\nm_config.ini", "Kill", "WerewolfMode"
						}
					}
				}
				; STINGERS SETTINGS
				if (data.HasKey("stingers") && data["stingers"]) {
					stingers := data["stingers"]
					if (stingers.HasKey("killViciousBee")) {
						KillViciousBeeEnabled := stingers["killViciousBee"] ? 1 : 0
						IniWrite KillViciousBeeEnabled, "settings\nm_config.ini", "Kill", "ViciousBeeEnabled"
					}
					if (stingers.HasKey("onlyDaily")) {
						KillViciousBeeOnlyDaily := stingers["onlyDaily"] ? 1 : 0
						IniWrite KillViciousBeeOnlyDaily, "settings\nm_config.ini", "Kill", "ViciousBeeOnlyDaily"
					}
					if (stingers.HasKey("fields") && stingers["fields"]) {
						fields := stingers["fields"]
						KillViciousBeeFieldClover := fields["clover"] ? 1 : 0, IniWrite KillViciousBeeFieldClover, "settings\nm_config.ini", "Kill", "ViciousBeeFieldClover"
						KillViciousBeeFieldSpider := fields["spider"] ? 1 : 0, IniWrite KillViciousBeeFieldSpider, "settings\nm_config.ini", "Kill", "ViciousBeeFieldSpider"
						KillViciousBeeFieldCactus := fields["cactus"] ? 1 : 0, IniWrite KillViciousBeeFieldCactus, "settings\nm_config.ini", "Kill", "ViciousBeeFieldCactus"
						KillViciousBeeFieldRose := fields["rose"] ? 1 : 0, IniWrite KillViciousBeeFieldRose, "settings\nm_config.ini", "Kill", "ViciousBeeFieldRose"
						KillViciousBeeFieldMountainTop := fields["mountainTop"] ? 1 : 0, IniWrite KillViciousBeeFieldMountainTop, "settings\nm_config.ini", "Kill", "ViciousBeeFieldMountainTop"
						KillViciousBeeFieldPepper := fields["pepper"] ? 1 : 0, IniWrite KillViciousBeeFieldPepper, "settings\nm_config.ini", "Kill", "ViciousBeeFieldPepper"
					}
				}
				; BOSSES SETTINGS
				if (data.HasKey("bosses") && data["bosses"]) {
					bosses := data["bosses"]
					; King Beetle
					if (bosses.HasKey("kingBeetle") && bosses["kingBeetle"]) {
						kb := bosses["kingBeetle"]
						if (kb.HasKey("enabled")) {
							KillKingBeetleEnabled := kb["enabled"] ? 1 : 0, IniWrite KillKingBeetleEnabled, "settings\nm_config.ini", "Kill", "KingBeetleEnabled"
						}
						if (kb.HasKey("waitBabyLove")) {
							KillKingBeetleWaitBabyLove := kb["waitBabyLove"] ? 1 : 0, IniWrite KillKingBeetleWaitBabyLove, "settings\nm_config.ini", "Kill", "KingBeetleWaitBabyLove"
						}
						if (kb.HasKey("amuletAction")) {
							KillKingBeetleAmuletAction := kb["amuletAction"], IniWrite KillKingBeetleAmuletAction, "settings\nm_config.ini", "Kill", "KingBeetleAmuletAction"
						}
					}
					; Tunnel Bear
					if (bosses.HasKey("tunnelBear") && bosses["tunnelBear"]) {
						tb := bosses["tunnelBear"]
						if (tb.HasKey("enabled")) {
							KillTunnelBearEnabled := tb["enabled"] ? 1 : 0, IniWrite KillTunnelBearEnabled, "settings\nm_config.ini", "Kill", "TunnelBearEnabled"
						}
						if (tb.HasKey("waitBabyLove")) {
							KillTunnelBearWaitBabyLove := tb["waitBabyLove"] ? 1 : 0, IniWrite KillTunnelBearWaitBabyLove, "settings\nm_config.ini", "Kill", "TunnelBearWaitBabyLove"
						}
					}
					; Coco Crab
					if (bosses.HasKey("cocoCrab") && bosses["cocoCrab"]) {
						if (bosses["cocoCrab"].HasKey("enabled")) {
							KillCocoCrabEnabled := bosses["cocoCrab"]["enabled"] ? 1 : 0
							IniWrite KillCocoCrabEnabled, "settings\nm_config.ini", "Kill", "CocoCrabEnabled"
						}
					}
					; Commando Chick
					if (bosses.HasKey("commandoChick") && bosses["commandoChick"]) {
						cc := bosses["commandoChick"]
						if (cc.HasKey("enabled")) {
							KillCommandoChickEnabled := cc["enabled"] ? 1 : 0, IniWrite KillCommandoChickEnabled, "settings\nm_config.ini", "Kill", "CommandoChickEnabled"
						}
						if (cc.HasKey("level")) {
							KillCommandoChickLevel := cc["level"], IniWrite KillCommandoChickLevel, "settings\nm_config.ini", "Kill", "CommandoChickLevel"
						}
						if (cc.HasKey("hp")) {
							KillCommandoChickHP := cc["hp"], IniWrite KillCommandoChickHP, "settings\nm_config.ini", "Kill", "CommandoChickHP"
						}
						if (cc.HasKey("time")) {
							KillCommandoChickTime := cc["time"], IniWrite KillCommandoChickTime, "settings\nm_config.ini", "Kill", "CommandoChickTime"
						}
					}
					; Stump Snail
					if (bosses.HasKey("stumpSnail") && bosses["stumpSnail"]) {
						ss := bosses["stumpSnail"]
						if (ss.HasKey("enabled")) {
							KillStumpSnailEnabled := ss["enabled"] ? 1 : 0, IniWrite KillStumpSnailEnabled, "settings\nm_config.ini", "Kill", "StumpSnailEnabled"
						}
						if (ss.HasKey("hp")) {
							KillStumpSnailHP := ss["hp"], IniWrite KillStumpSnailHP, "settings\nm_config.ini", "Kill", "StumpSnailHP"
						}
						if (ss.HasKey("amuletAction")) {
							KillStumpSnailAmuletAction := ss["amuletAction"], IniWrite KillStumpSnailAmuletAction, "settings\nm_config.ini", "Kill", "StumpSnailAmuletAction"
						}
						if (ss.HasKey("time")) {
							KillStumpSnailTime := ss["time"], IniWrite KillStumpSnailTime, "settings\nm_config.ini", "Kill", "StumpSnailTime"
						}
					}
				}
				OutputDebug "[ahk] killSettings saved to INI"
			}
			catch {
				OutputDebug "[ahk] Error processing killSettings"
			}
			; Mirror the bulk update onto the classic GUI globals/controls too.
			try nm_WebSyncKillToClassic()
			; Broadcast the updated state to both UIs (bidirectional sync)
			OutputDebug "[ahk] Broadcasting updated kill settings to all UIs"
			SendBootstrapState()
	
		case "plants":
		key := data["key"], value := data["value"]
		OutputDebug "[ahk] recv plants " key "=" value
		if (key = "Field") {
			; PlanterPlant1/2/3 mapping
			num := StrReplace(key, "Field")
			varName := "PlanterPlant" num
			try {
				%varName% := value
				IniWrite value, "settings\nm_config.ini", "Plants", "PlanterPlant" num
				try MainGui["PlanterPlant" num "Tab"].Text := value
			}
		}
		else if (key = "Flower") {
			num := StrReplace(key, "Flower")
			varName := "PlanterFlower" num
			try {
				%varName% := value
				IniWrite value, "settings\nm_config.ini", "Plants", "PlanterFlower" num
				try MainGui["PlanterFlower" num "Tab"].Text := value
			}
		}
		else {
			; All web planters settings are persisted in the Planters section.
			nm_WebApplySetting("Planters", key, value)
		}

	case "quests":
		key := data["key"], value := data["value"]
		OutputDebug "[ahk] recv quests " key "=" value
		if (key = "Field") {
			num := StrReplace(key, "Field")
			varName := "QuestField" num
			try {
				%varName% := value
				IniWrite value, "settings\nm_config.ini", "Quests", "QuestField" num
				try MainGui["QuestField" num "Tab"].Text := value
			}
		}
		else if (key = "Loot") {
			num := StrReplace(key, "Loot")
			varName := "QuestLoot" num
			try {
				%varName% := value
				IniWrite value, "settings\nm_config.ini", "Quests", "QuestLoot" num
				try MainGui["QuestLoot" num "Tab"].Text := value
			}
		}
		else if (key = "MondoLoot") {
			num := StrReplace(key, "MondoLoot")
			varName := "QuestMondoLoot" num
			try {
				%varName% := value
				IniWrite value, "settings\nm_config.ini", "Quests", "QuestMondoLoot" num
				try MainGui["QuestMondoLoot" num "Tab"].Text := value
			}
		}
		else if (key = "MondoAction") {
			num := StrReplace(key, "MondoAction")
			varName := "QuestMondoAction" num
			try {
				%varName% := value
				IniWrite value, "settings\nm_config.ini", "Quests", "QuestMondoAction" num
				try MainGui["QuestMondoAction" num "Tab"].Text := value
			}
		}
		else if (key = "GatherPlanterLoot") {
			num := StrReplace(key, "GatherPlanterLoot")
			varName := "QuestGatherPlanterLoot" num
			try {
				%varName% := value ? 1 : 0
				IniWrite %varName%, "settings\nm_config.ini", "Quests", "QuestGatherPlanterLoot" num
				try MainGui["QuestGatherPlanterLoot" num "Tab"].Value := %varName%
			}
		}
		else {
			; All web quests settings are persisted in the Quests section.
			nm_WebApplySetting("Quests", key, value)
		}


	case "gather":
		key := data["key"], value := data["value"]
		OutputDebug "[ahk] recv gather " key "=" value
		nm_WebApplySetting("Gather", key, value)

	case "patternRequest":
		nm_WebSendPatternText(data.Has("key") ? data["key"] : "")
	case "patternListRequest":
		OutputDebug "[ahk] recv patternListRequest"
		nm_WebSendPatternList()

	case "status":
		key := data["key"], value := data["value"]
		OutputDebug "[ahk] recv status " key "=" value
		nm_WebApplySetting("Status", key, value)
		; Discord integration values must also be pushed to the Status submacro.
		nm_WebNotifyDiscord(key)

	case "settings":
		key := data["key"], value := data["value"]
		OutputDebug "[ahk] recv settings " key "=" value
		nm_WebApplySetting("Settings", key, value)

	case "misc":
		key := data["key"], value := data["value"]
		OutputDebug "[ahk] recv misc " key "=" value
		nm_WebApplyMiscSetting(key, value)

	case "guiMode":
		; web header switch flipped -> swap Classic <-> New (persist + mirror back).
		OutputDebug "[ahk] recv guiMode " data["value"]
		nm_SetGuiMode(StrLower(data["value"]) = "new")

	case "tab":
		; web sidebar tab clicked -> switch the classic GUI tab
		nm_WebSelectClassicTab(data["value"])

	       }
    }

FormSubmitEvent(source, form) {
    if (source = "webpage") {
        SetTimer((*) => FormSubmitEvent("ahk", form), -1)
    }
    else {
        ;WebViewToo v1.0.1 (breaking update): `GetFormData()` was removed; collect form
        ;data directly with `ExecuteScript` and `WebViewCtrl.ForEach` (replaces `WebviewWindow.forEach`).
        formValues := {}
        js := "Array.from(document.getElementById('" form "').elements).filter(e => ['reset','submit','button'].indexOf(e.type) === -1).map(e => ({id: e.id, value: e.value}))"
        try formValues := JSON.parse(MyWindow.ExecuteScript("return JSON.stringify(" js ")"), true, true)
        if (formValues.Has("inputEmail"))
            MsgBox(formValues["inputEmail"])
        MsgBox(WebViewCtrl.ForEach(formValues, form))
    }
}

SendBootstrapState() {
	global MyWindow, VersionID, FieldName1, FieldName2, FieldName3, FieldPattern1, FieldPattern2, FieldPattern3
	global UseNewGUI
	global FieldPatternSize1, FieldPatternSize2, FieldPatternSize3, FieldPatternReps1, FieldPatternReps2, FieldPatternReps3
	global FieldDriftCheck1, FieldDriftCheck2, FieldDriftCheck3, FieldPatternShift1, FieldPatternShift2, FieldPatternShift3
	global FieldPatternInvertFB1, FieldPatternInvertFB2, FieldPatternInvertFB3, FieldPatternInvertLR1, FieldPatternInvertLR2, FieldPatternInvertLR3
	global FieldRotateDirection1, FieldRotateDirection2, FieldRotateDirection3, FieldRotateTimes1, FieldRotateTimes2, FieldRotateTimes3
	global FieldUntilMins1, FieldUntilMins2, FieldUntilMins3, FieldUntilPack1, FieldUntilPack2, FieldUntilPack3
	global FieldReturnType1, FieldReturnType2, FieldReturnType3, FieldSprinklerLoc1, FieldSprinklerLoc2, FieldSprinklerLoc3
	global FieldSprinklerDist1, FieldSprinklerDist2, FieldSprinklerDist3
	; Names of every pattern currently in \patterns\ (filled in by nm_importPatterns);
	; pushed to the web Gather dropdown so it can learn about patterns added after the
	; page first loaded.
	global patternlist
	global ClockCheck, MondoBuffCheck, MondoAction, MondoLootDirection, AntPassCheck, RoboPassCheck, HoneystormCheck, HoneyDisCheck
	global TreatDisCheck, BlueberryDisCheck, StrawberryDisCheck, CoconutDisCheck, RoyalJellyDisCheck, GlueDisCheck
	global KillBugRunGatherInterrupt, KillBugRunRespawnTime, KillLadybugsMode, KillRhinoBeetlesMode, KillSpiderMode, KillMantisMode, KillScorpionsMode, KillWerewolfMode
	global KillViciousBeeEnabled, KillViciousBeeOnlyDaily, KillViciousBeeFieldClover, KillViciousBeeFieldSpider, KillViciousBeeFieldCactus
	global KillViciousBeeFieldRose, KillViciousBeeFieldMountainTop, KillViciousBeeFieldPepper
	global KillKingBeetleEnabled, KillKingBeetleWaitBabyLove, KillKingBeetleAmuletAction
	global KillTunnelBearEnabled, KillTunnelBearWaitBabyLove
	global KillCocoCrabEnabled
	global KillCommandoChickEnabled, KillCommandoChickLevel, KillCommandoChickHP, KillCommandoChickTime
	global KillStumpSnailEnabled, KillStumpSnailHP, KillStumpSnailAmuletAction, KillStumpSnailTime
	; NavigationCompleted can fire before nm_importConfig has populated the globals;
	; the -1000 ms timer set after nm_importConfig guarantees a later (valid) send.
	if !IsSet(FieldName1)
		return
	appVersion := "2025-12-30T" A_Hour ":" A_Min ":" A_Sec
	try {
		; coerce numeric fields to 0 when blank
		p1dist := (FieldSprinklerDist1 = "") ? 0 : FieldSprinklerDist1
		p2dist := (FieldSprinklerDist2 = "") ? 0 : FieldSprinklerDist2
		p3dist := (FieldSprinklerDist3 = "") ? 0 : FieldSprinklerDist3
		p1dist := (FieldSprinklerDist1 = "") ? 0 : FieldSprinklerDist1
		p2dist := (FieldSprinklerDist2 = "") ? 0 : FieldSprinklerDist2
		p3dist := (FieldSprinklerDist3 = "") ? 0 : FieldSprinklerDist3
		p1reps := (FieldPatternReps1 = "") ? 0 : FieldPatternReps1
		p2reps := (FieldPatternReps2 = "") ? 0 : FieldPatternReps2
		p3reps := (FieldPatternReps3 = "") ? 0 : FieldPatternReps3
		p1mins := (FieldUntilMins1 = "") ? 0 : FieldUntilMins1
		p2mins := (FieldUntilMins2 = "") ? 0 : FieldUntilMins2
		p3mins := (FieldUntilMins3 = "") ? 0 : FieldUntilMins3
		p1pack := (FieldUntilPack1 = "") ? 0 : FieldUntilPack1
		p2pack := (FieldUntilPack2 = "") ? 0 : FieldUntilPack2
		p3pack := (FieldUntilPack3 = "") ? 0 : FieldUntilPack3
		p1rot := (FieldRotateTimes1 = "") ? 0 : FieldRotateTimes1
		p2rot := (FieldRotateTimes2 = "") ? 0 : FieldRotateTimes2
		p3rot := (FieldRotateTimes3 = "") ? 0 : FieldRotateTimes3
		p1drift := (FieldDriftCheck1 = "") ? 0 : FieldDriftCheck1
		p2drift := (FieldDriftCheck2 = "") ? 0 : FieldDriftCheck2
		p3drift := (FieldDriftCheck3 = "") ? 0 : FieldDriftCheck3
		p1shift := (FieldPatternShift1 = "") ? 0 : FieldPatternShift1
		p2shift := (FieldPatternShift2 = "") ? 0 : FieldPatternShift2
		p3shift := (FieldPatternShift3 = "") ? 0 : FieldPatternShift3
		p1fb := (FieldPatternInvertFB1 = "") ? 0 : FieldPatternInvertFB1
		p2fb := (FieldPatternInvertFB2 = "") ? 0 : FieldPatternInvertFB2
		p3fb := (FieldPatternInvertFB3 = "") ? 0 : FieldPatternInvertFB3
		p1lr := (FieldPatternInvertLR1 = "") ? 0 : FieldPatternInvertLR1
		p2lr := (FieldPatternInvertLR2 = "") ? 0 : FieldPatternInvertLR2
		p3lr := (FieldPatternInvertLR3 = "") ? 0 : FieldPatternInvertLR3
		; build field JSON objects manually to avoid Format brace issues
		f1 := '{"num":1,"field":"' StrLower(FieldName1) '","pattern":"' FieldPattern1 '","size":"' FieldPatternSize1 '","reps":' p1reps ',"drift":' p1drift ',"shift":' p1shift ',"invertfb":' p1fb ',"invertlr":' p1lr ',"rotdir":"' FieldRotateDirection1 '","rottime":' p1rot ',"mins":' p1mins ',"pack":' p1pack ',"return":"' FieldReturnType1 '","sprinkloc":"' FieldSprinklerLoc1 '","sprdist":' p1dist '}'
		f2 := '{"num":2,"field":"' StrLower(FieldName2) '","pattern":"' FieldPattern2 '","size":"' FieldPatternSize2 '","reps":' p2reps ',"drift":' p2drift ',"shift":' p2shift ',"invertfb":' p2fb ',"invertlr":' p2lr ',"rotdir":"' FieldRotateDirection2 '","rottime":' p2rot ',"mins":' p2mins ',"pack":' p2pack ',"return":"' FieldReturnType2 '","sprinkloc":"' FieldSprinklerLoc2 '","sprdist":' p2dist '}'
		f3 := '{"num":3,"field":"' StrLower(FieldName3) '","pattern":"' FieldPattern3 '","size":"' FieldPatternSize3 '","reps":' p3reps ',"drift":' p3drift ',"shift":' p3shift ',"invertfb":' p3fb ',"invertlr":' p3lr ',"rotdir":"' FieldRotateDirection3 '","rottime":' p3rot ',"mins":' p3mins ',"pack":' p3pack ',"return":"' FieldReturnType3 '","sprinkloc":"' FieldSprinklerLoc3 '","sprdist":' p3dist '}'
		cClock := (ClockCheck="") ? 0 : ClockCheck
		cMondo := (MondoBuffCheck="") ? 0 : MondoBuffCheck
		cAnt := (AntPassCheck="") ? 0 : AntPassCheck
		cRobo := (RoboPassCheck="") ? 0 : RoboPassCheck
		cHoney := (HoneyDisCheck="") ? 0 : HoneyDisCheck
		cTreat := (TreatDisCheck="") ? 0 : TreatDisCheck
		cBlue := (BlueberryDisCheck="") ? 0 : BlueberryDisCheck
		cStraw := (StrawberryDisCheck="") ? 0 : StrawberryDisCheck
		cCoco := (CoconutDisCheck="") ? 0 : CoconutDisCheck
		cRoyal := (RoyalJellyDisCheck="") ? 0 : RoyalJellyDisCheck
		cGlue := (GlueDisCheck="") ? 0 : GlueDisCheck
		cHoneyStorm := (HoneystormCheck="") ? 0 : HoneystormCheck
		; build collect JSON object manually
		col := '{"ClockCheck":' cClock ',"MondoBuffCheck":' cMondo ',"MondoAction":"' MondoAction '","MondoLootDirection":"' MondoLootDirection '","AntPassCheck":' cAnt ',"RoboPassCheck":' cRobo ',"HoneystormCheck":' cHoneyStorm ',"HoneyDisCheck":' cHoney ',"TreatDisCheck":' cTreat ',"BlueberryDisCheck":' cBlue ',"StrawberryDisCheck":' cStraw ',"CoconutDisCheck":' cCoco ',"RoyalJellyDisCheck":' cRoyal ',"GlueDisCheck":' cGlue '}'
		OutputDebug "[ahk] collect payload: " col
		
		; build kill JSON object - coerce values to correct types
		kBugRunGatherInt := (KillBugRunGatherInterrupt="") ? 0 : KillBugRunGatherInterrupt
		kBugRunRespawnTime := (KillBugRunRespawnTime="") ? 0 : KillBugRunRespawnTime
		kLadybugsMode := (KillLadybugsMode="") ? "Kill+Loot" : KillLadybugsMode
		kRhinoBeetlesMode := (KillRhinoBeetlesMode="") ? "Kill+Loot" : KillRhinoBeetlesMode
		kSpiderMode := (KillSpiderMode="") ? "Kill+Loot" : KillSpiderMode
		kMantisMode := (KillMantisMode="") ? "Kill+Loot" : KillMantisMode
		kScorpionsMode := (KillScorpionsMode="") ? "Kill+Loot" : KillScorpionsMode
		kWerewolfMode := (KillWerewolfMode="") ? "Kill+Loot" : KillWerewolfMode
		
		kViciousBeeEnabled := (KillViciousBeeEnabled="") ? 0 : KillViciousBeeEnabled
		kViciousBeeOnlyDaily := (KillViciousBeeOnlyDaily="") ? 0 : KillViciousBeeOnlyDaily
		kVBFieldClover := (KillViciousBeeFieldClover="") ? 0 : KillViciousBeeFieldClover
		kVBFieldSpider := (KillViciousBeeFieldSpider="") ? 0 : KillViciousBeeFieldSpider
		kVBFieldCactus := (KillViciousBeeFieldCactus="") ? 0 : KillViciousBeeFieldCactus
		kVBFieldRose := (KillViciousBeeFieldRose="") ? 0 : KillViciousBeeFieldRose
		kVBFieldMountainTop := (KillViciousBeeFieldMountainTop="") ? 0 : KillViciousBeeFieldMountainTop
		kVBFieldPepper := (KillViciousBeeFieldPepper="") ? 0 : KillViciousBeeFieldPepper
		
		kKBEnabled := (KillKingBeetleEnabled="") ? 0 : KillKingBeetleEnabled
		kKBWaitBabyLove := (KillKingBeetleWaitBabyLove="") ? 0 : KillKingBeetleWaitBabyLove
		kKBAmuletAction := (KillKingBeetleAmuletAction="") ? "Keep Old" : KillKingBeetleAmuletAction
		
		kTBEnabled := (KillTunnelBearEnabled="") ? 0 : KillTunnelBearEnabled
		kTBWaitBabyLove := (KillTunnelBearWaitBabyLove="") ? 0 : KillTunnelBearWaitBabyLove
		
		kCCEnabled := (KillCocoCrabEnabled="") ? 0 : KillCocoCrabEnabled
		
		kCCHEnabled := (KillCommandoChickEnabled="") ? 0 : KillCommandoChickEnabled
		kCCHLevel := (KillCommandoChickLevel="") ? 10 : KillCommandoChickLevel
		kCCHHP := (KillCommandoChickHP="") ? 250000 : KillCommandoChickHP
		kCCHTime := (KillCommandoChickTime="") ? "5m" : KillCommandoChickTime
		
		kSSEnabled := (KillStumpSnailEnabled="") ? 0 : KillStumpSnailEnabled
		kSSHP := (KillStumpSnailHP="") ? 30000000 : KillStumpSnailHP
		kSSAmuletAction := (KillStumpSnailAmuletAction="") ? "Keep Old" : KillStumpSnailAmuletAction
		kSSTime := (KillStumpSnailTime="") ? "5m" : KillStumpSnailTime
		
		; build kill JSON manually
		kill := '{"bugRun":{"allowGatherInterrupt":' kBugRunGatherInt ',"respawnTime":' kBugRunRespawnTime ',"loot":{"ladybugs":"' kLadybugsMode '","rhinoBeetles":"' kRhinoBeetlesMode '","spider":"' kSpiderMode '","mantis":"' kMantisMode '","scorpions":"' kScorpionsMode '","werewolf":"' kWerewolfMode '"}},"stingers":{"killViciousBee":' kViciousBeeEnabled ',"onlyDaily":' kViciousBeeOnlyDaily ',"fields":{"clover":' kVBFieldClover ',"spider":' kVBFieldSpider ',"cactus":' kVBFieldCactus ',"rose":' kVBFieldRose ',"mountainTop":' kVBFieldMountainTop ',"pepper":' kVBFieldPepper '}},"bosses":{"kingBeetle":{"enabled":' kKBEnabled ',"waitBabyLove":' kKBWaitBabyLove ',"amuletAction":"' kKBAmuletAction '"},"tunnelBear":{"enabled":' kTBEnabled ',"waitBabyLove":' kTBWaitBabyLove '},"cocoCrab":{"enabled":' kCCEnabled '},"commandoChick":{"enabled":' kCCHEnabled ',"level":' kCCHLevel ',"hp":' kCCHHP ',"time":"' kCCHTime '"},"stumpSnail":{"enabled":' kSSEnabled ',"hp":' kSSHP ',"amuletAction":"' kSSAmuletAction '","time":"' kSSTime '"}}}'
		OutputDebug "[ahk] kill payload: " kill
		
		; build full init JSON (extra tabs serialised from the catalog snapshot).
		; NOTE: do NOT name a local `json` here — identifiers are case-insensitive and
		; it would shadow the JSON class, breaking JSON.stringify.
		snap := nm_WebSnapshot()
		initJson := '{"type":"init","version":"' appVersion '","natroVersion":"' VersionID '","gather":[' f1 ',' f2 ',' f3 '],"collect":' col ',"kill":' kill
			. ',"boost":' JSON.stringify(snap["Boost"])
			. ',"plants":' JSON.stringify(snap["Planters"])
			. ',"quests":' JSON.stringify(snap["Quests"])
			. ',"settings":' JSON.stringify(snap["Settings"])
			. ',"status":' JSON.stringify(snap["Status"])
			. ',"misc":' JSON.stringify(snap["misc"])
			. ',"blender":' JSON.stringify(snap["Blender"])
			. ',"shrine":' JSON.stringify(snap["Shrine"])
			. ',"gatherSettings":' JSON.stringify(snap["Gather"])
			. ',"collectExtras":' JSON.stringify(snap["Collect"])
			. ',"guiMode":"' (UseNewGUI ? "new" : "classic") '"'
			. ',"patternList":' JSON.stringify(patternlist) '}'
		OutputDebug "[ahk] send init: " initJson
		MyWindow.PostWebMessageAsString(initJson)
		; keep the web sidebar in step with the classic tab selection on first paint
		try nm_WebBroadcastTab(nm_ClassicTabToWeb())
	} catch as e {
		OutputDebug "[ahk] init error: " e.Message
	}
}

;///////////////////////////////////////////////////////////////////////////////////////////
; Bootstrap web bridge - snapshot / apply / broadcast (web GUI <-> classic GUI sync)
;///////////////////////////////////////////////////////////////////////////////////////////

; Apply the web GUI's own upper-left logo as this window's native icon (title bar, Alt+Tab
; and taskbar). The logo is a PNG while WM_SETICON needs an HICON, so convert it via GDI+
; (LoadPicture cannot feed a PNG straight to WM_SETICON).
nm_ApplyWebWindowIcon() {
	global MyWindow, pToken
	if (!IsSet(pToken) || !IsSet(MyWindow))
		return
	path := A_WorkingDir "\BootstrapGUI\assets\img\misc\NatroRedLogo.png"
	if !FileExist(path)
		path := A_ScriptDir "\..\BootstrapGUI\assets\img\misc\NatroRedLogo.png"
	if !FileExist(path)
		return
	; WM_SETICON: wParam 0 = ICON_SMALL (title bar), 1 = ICON_BIG (Alt+Tab / taskbar).
	; Render each at its native size so Windows never has to stretch a single bitmap.
	hSmall := nm_HIconFromPng(path, 16)
	hBig := nm_HIconFromPng(path, 32)
	; NOTE: SendMessage takes exactly 4 parameters (hWnd, Msg, wParam, lParam). Passing a
	; fifth arg makes AHK v2 throw "Parameter list too large", and since the call site is
	; wrapped in `try`, that error used to be swallowed silently and the icon never changed.
	if (hSmall >= 1)
		DllCall("SendMessage", "Ptr", MyWindow.Hwnd, "UInt", 0x0080, "Ptr", 0, "Ptr", hSmall)
	if (hBig >= 1)
		DllCall("SendMessage", "Ptr", MyWindow.Hwnd, "UInt", 0x0080, "Ptr", 1, "Ptr", hBig)
}

; Render a PNG at the given square size and return an HICON (0 on failure).
nm_HIconFromPng(path, size) {
	global pToken
	if !IsSet(pToken)
		return 0
	pSrc := Gdip_CreateBitmapFromFile(path)
	if (pSrc < 1)
		return 0
	pDst := Gdip_CreateBitmap(size, size)
	if (pDst < 1) {
		Gdip_DisposeImage(pSrc)
		return 0
	}
	G := Gdip_GraphicsFromImage(pDst)
	Gdip_SetInterpolationMode(G, 7) ; HighQualityBicubic
	Gdip_DrawImage(G, pSrc, 0, 0, size, size)
	Gdip_DeleteGraphics(G)
	Gdip_DisposeImage(pSrc)
	hIcon := Gdip_CreateHICONFromBitmap(pDst)
	Gdip_DisposeImage(pDst)
	return (hIcon >= 1) ? hIcon : 0
}

nm_WebSnapshot() {
	global
	local m, bm, pm, cm, sm, stm, mm, k, i, f, n, sec, cat, _v, kind, j, mpm, _, asm
	m := Map()

	; ---- Boost / hotbar ----
	bm := Map()
	bm["FieldBooster1"] := FieldBooster1
	bm["FieldBooster2"] := FieldBooster2
	bm["FieldBooster3"] := FieldBooster3
	bm["FieldBoosterMins"] := (FieldBoosterMins = "") ? 0 : FieldBoosterMins
	bm["BoostChaserCheck"] := (BoostChaserCheck = "") ? 0 : BoostChaserCheck
	bm["AutoFieldBoostActive"] := (AutoFieldBoostActive = "") ? 0 : AutoFieldBoostActive
	bm["AutoFieldBoostRefresh"] := (AutoFieldBoostRefresh = "") ? 12.5 : AutoFieldBoostRefresh
	bm["SprinklerType"] := SprinklerType
	for _, f in ["BlueFlower","Bamboo","PineTree","Dandelion","Sunflower","Clover","Spider","Pineapple","Cactus","Pumpkin","Mushroom","Strawberry","Rose","Pepper","Stump","Coconut"] {
		k := f "BoosterCheck"
		try {
			bm[k] := %k%
		}
	}
	loop 6 {
		i := A_Index + 1
		k := "HotbarWhile" i
		try {
			bm[k] := %k%
		}
		k := "HotbarTime" i
		try {
			bm[k] := (%k% = "") ? 0 : %k%
		}
	}
	m["boost"] := bm

	; ---- Planters ----
	pm := Map()
	pm["PlanterMode"] := (PlanterMode = "") ? 0 : PlanterMode
	pm["NectarPreset"] := (nPreset = "") ? "Blue" : nPreset
	pm["MaxAllowedPlanters"] := (MaxAllowedPlanters = "") ? 3 : MaxAllowedPlanters
	pm["HarvestInterval"] := (HarvestInterval = "") ? 2 : HarvestInterval
	pm["AutomaticHarvestInterval"] := (AutomaticHarvestInterval = "") ? 0 : AutomaticHarvestInterval
	pm["HarvestFullGrown"] := (HarvestFullGrown = "") ? 0 : HarvestFullGrown
	pm["HarvestMode"] := HarvestFullGrown ? "Full" : (AutomaticHarvestInterval ? "Auto" : "Timed")
	pm["ConvertFullBagHarvest"] := (ConvertFullBagHarvest = "") ? 0 : ConvertFullBagHarvest
	pm["GatherPlanterLoot"] := (GatherPlanterLoot = "") ? 1 : GatherPlanterLoot
	loop 3 {
		i := A_Index
		for _, pre in ["MPlanterGather","PlanterManualCycle","PlanterHarvestFull"] {
			k := pre i
			try {
				pm[k] := %k%
			}
		}
	}
	loop 5 {
		i := A_Index
		k := "n" i "priority"
		try {
			pm[k] := %k%
		}
		k := "n" i "minPercent"
		try {
			pm[k] := (%k% = "") ? 0 : %k%
		}
	}
	for _, n in ["Plastic","Candy","BlueClay","RedClay","Tacky","Pesticide","HeatTreated","Hydroponic","Petal","PlanterOfPlenty","Paper","Ticket"] {
		k := n "PlanterCheck"
		try {
			pm[k] := %k%
		}
	}
	for _, n in ["Bamboo","BlueFlower","Cactus","Clover","Coconut","Dandelion","MountainTop","Mushroom","Pepper","PineTree","Pineapple","Pumpkin","Rose","Spider","Strawberry","Stump","Sunflower"] {
		k := n "FieldCheck"
		try {
			pm[k] := %k%
		}
	}
	m["plants"] := pm

	; ---- Quests ----
	qm := Map()
	for _, k in ["QuestGatherMins","QuestGatherReturnBy","QuestBoostCheck","PolarQuestCheck","PolarQuestGatherInterruptCheck","HoneyQuestCheck","BlackQuestCheck","BrownQuestCheck","BuckoQuestCheck","BuckoQuestGatherInterruptCheck","RileyQuestCheck","RileyQuestGatherInterruptCheck"] {
		try {
			qm[k] := %k%
		}
	}
	m["quests"] := qm

	; ---- Settings ----
	sm := Map()
	for _, k in ["AlwaysOnTop","GuiTheme","GuiTransparency","KeyDelay","HiveSlot","HiveBees","ClaimMethod","ReconnectMethod","PrivServer","ReconnectInterval","ReconnectHour","ReconnectMin","PublicFallback","MoveSpeedNum","NewWalk","MoveMethod","SprinklerType","ConvertBalloon","ConvertMins","DisableToolUse","ReleaseChannel","FallbackServer1","FallbackServer2","FallbackServer3","AnnounceGuidingStar","HideErrors"] {
		try {
			sm[k] := %k%
		}
	}
	m["settings"] := sm

	; ---- Status ----
	stm := Map()
	for _, k in ["StatusLogReverse","ssCheck","ssDebugging","DiscordMode","Webhook","BotToken","MainChannelID","ReportChannelID","DebugLogEnabled","TotalRuntime","SessionRuntime","TotalGatherTime","SessionGatherTime","TotalBugKills","SessionBugKills","TotalBossKills","SessionBossKills","TotalViciousKills","SessionViciousKills","TotalQuestsComplete","SessionQuestsComplete","TotalDisconnects","SessionDisconnects"] {
		try {
			stm[k] := (%k% = "") ? 0 : %k%
		}
	}
	; Read-only mirror of the classic Status Log so the web Status tab can show it.
	try stm["__Log"] := MainGui["statuslog"].Text
	m["status"] := stm

	; ---- Misc (Settings tab tools that live on the web Misc tab) ----
	mm := Map()
	for _, k in ["HideErrors","AnnounceGuidingStar","DebugLogEnabled"
		,"ClickMode","ClickCount","ClickDelay","ClickDuration"
		,"StartHotkey","PauseHotkey","StopHotkey","AutoClickerHotkey","TimersHotkey","DebugHotkey"
		,"ShowOnPause","NightAnnouncementCheck","NightAnnouncementName","NightAnnouncementPingID"
		,"NightAnnouncementWebhook","AutoStartEnabled","AutoStartDelay"] {
		try {
			mm[k] := (%k% = "") ? 0 : %k%
		}
	}
	; Auto-start + Roblox FPS values are not persisted in nm_config.ini.
	try {
		asm := nm_WebReadAutoStart()
		mm["AutoStartEnabled"] := asm.enabled
		mm["AutoStartDelay"] := asm.delay
	}
	; Reading Roblox's settings XML is comparatively expensive, so only do it for the
	; initial snapshot (live changes are echoed back when the web applies them).
	static fpsSent := 0
	if !fpsSent {
		fpsSent := 1
		try mm["WebFPSCount"] := nm_WebReadFPSCount("Web").fps
		try mm["UWPFPSCount"] := nm_WebReadFPSCount("UWP").fps
	}
	m["misc"] := mm

	; ---- Collect extras (Blender / Wind Shrine / Beesmas / Memory Match) ----
	cm := Map()
	loop 3 {
		i := A_Index
		try {
			cm["BlenderItem" i] := nm_WebBlenderItemToWeb(%("BlenderItem" i)%)
		}
		try {
			cm["BlenderAmount" i] := (%("BlenderAmount" i)% = "") ? 0 : %("BlenderAmount" i)%
		}
		try {
			cm["BlenderIndex" i] := %("BlenderIndex" i)%
		}
	}
	loop 2 {
		i := A_Index
		try {
			cm["ShrineItem" i] := nm_WebBlenderItemToWeb(%("ShrineItem" i)%)
		}
		try {
			cm["ShrineAmount" i] := (%("ShrineAmount" i)% = "") ? 0 : %("ShrineAmount" i)%
		}
		try {
			cm["ShrineIndex" i] := %("ShrineIndex" i)%
		}
	}
	for _, k in ["BeesmasGatherInterruptCheck","StockingsCheck","WreathCheck","FeastCheck","RBPDelevelCheck","GingerbreadCheck","SnowMachineCheck","CandlesCheck","SamovarCheck","LidArtCheck","GummyBeaconCheck","NormalMemoryMatchCheck","MegaMemoryMatchCheck","ExtremeMemoryMatchCheck"] {
		try {
			cm[k] := (%k% = "") ? 0 : %k%
		}
	}
	m["collect"] := cm

	; ---- Full catalog: every persisted setting, straight from nm_importConfig.
	; This is a superset of the hand-built sections above, so it guarantees that
	; nothing is missed for either first paint or live polling.
	if IsSet(nm_SettingsCatalog) {
		for sec, cat in nm_SettingsCatalog {
			sub := Map()
			for k, _v in cat {
				try {
					sub[k] := %k%
				}
			}
			m[sec] := sub
		}
	}

	; Runtime-only value (not persisted): lets the web Boost tab render the classic
	; hotbar descriptive text ("@ Boosted" vs "@ Full Pack", "@ Hive Return", ...).
	if m.Has("Boost")
		m["Boost"]["PFieldBoosted"] := (PFieldBoosted = "") ? 0 : PFieldBoosted

	; ---- Manual planter cycles (settings\manual_planters.ini) ----
	if !m.Has("Planters")
		m["Planters"] := Map()
	mpm := m["Planters"]
	loop 3 {
		i := A_Index
		loop 9 {
			j := A_Index
			for _, kind in ["Planter","Field","Glitter","AutoFull"] {
				k := "MSlot" i "Cycle" j kind
				try {
					mpm[k] := %k%
				}
			}
		}
	}
	; Derived keys (not present in the import catalog).
	mpm["NectarPreset"] := nPreset
	mpm["HarvestMode"] := HarvestFullGrown ? "Full" : (AutomaticHarvestInterval ? "Auto" : "Timed")

	; GuiTransparency is stored/applied as 0-70 in steps of 5 (the classic UpDown holds
	; 0-14, i.e. value * 5). The web control mirrors the *displayed* 0-70 value so its
	; up/down arrows count exactly the way the classic GUI does.
	if m.Has("Settings")
		try m["Settings"]["GuiTransparency"] := (GuiTransparency = "") ? 0 : GuiTransparency

	; ---- Kill settings are stored separately from the import catalog ----
	km := Map()
	for _, k in ["KillBugRunGatherInterrupt","KillBugRunRespawnTime","KillLadybugsMode","KillRhinoBeetlesMode","KillSpiderMode","KillMantisMode","KillScorpionsMode","KillWerewolfMode","KillViciousBeeEnabled","KillViciousBeeOnlyDaily","KillViciousBeeFieldClover","KillViciousBeeFieldSpider","KillViciousBeeFieldCactus","KillViciousBeeFieldRose","KillViciousBeeFieldMountainTop","KillViciousBeeFieldPepper","KillKingBeetleEnabled","KillKingBeetleWaitBabyLove","KillKingBeetleAmuletAction","KillTunnelBearEnabled","KillTunnelBearWaitBabyLove","KillCocoCrabEnabled","KillCommandoChickEnabled","KillCommandoChickLevel","KillCommandoChickHP","KillCommandoChickTime","KillStumpSnailEnabled","KillStumpSnailHP","KillStumpSnailAmuletAction","KillStumpSnailTime"] {
		try {
			km[k] := %k%
		}
	}
	m["Kill"] := km

	return m
}

;///////////////////////////////////////////////////////////////////////////////////////////
; Kill tab <-> classic GUI mirroring
;
; The web Kill tab persists to the [Kill] INI section using keys such as KillLadybugsMode,
; while the legacy classic GUI (and the macro runtime) read a different set of globals
; (BugrunLadybugsCheck/BugrunLadybugsLoot, Stinger*, KingBeetle*, ...). WebUpdateState's
; `kill` case updated the classic *controls* but not those globals, and nothing reconciled
; the two at startup, so the old UI showed stale "Off" values (and the runtime kept using
; the stale globals) until a Kill control was touched. These helpers keep them in step.
;///////////////////////////////////////////////////////////////////////////////////////////

; Apply one Kill* setting (key = "KillXxx", value) to the classic globals + [Collect] INI
; and, when the classic GUI exists, to the matching controls. Safe to call before MainGui
; exists: the controls are skipped and the globals drive their initial ("Checked"/value) state.
; NOTE: explicit global names are used (not dynamic %name% := assignment, which in AHK v2
; raises "Variable not found" unless the target variable already holds a value).
nm_WebKillToClassic(key, value) {
	global
	hasGui := IsSet(MainGui)
	switch key, 0 {
		; --- Bug Run: one mode string -> the classic Check + Loot pair ---
		case "KillLadybugsMode":
			BugrunLadybugsCheck := (value = "Off") ? 0 : 1
			BugrunLadybugsLoot := (value = "Kill+Loot") ? 1 : 0
			nm_WebKillPair("Ladybugs", BugrunLadybugsCheck, BugrunLadybugsLoot, hasGui)
		case "KillRhinoBeetlesMode":
			BugrunRhinoBeetlesCheck := (value = "Off") ? 0 : 1
			BugrunRhinoBeetlesLoot := (value = "Kill+Loot") ? 1 : 0
			nm_WebKillPair("RhinoBeetles", BugrunRhinoBeetlesCheck, BugrunRhinoBeetlesLoot, hasGui)
		case "KillSpiderMode":
			BugrunSpiderCheck := (value = "Off") ? 0 : 1
			BugrunSpiderLoot := (value = "Kill+Loot") ? 1 : 0
			nm_WebKillPair("Spider", BugrunSpiderCheck, BugrunSpiderLoot, hasGui)
		case "KillMantisMode":
			BugrunMantisCheck := (value = "Off") ? 0 : 1
			BugrunMantisLoot := (value = "Kill+Loot") ? 1 : 0
			nm_WebKillPair("Mantis", BugrunMantisCheck, BugrunMantisLoot, hasGui)
		case "KillScorpionsMode":
			BugrunScorpionsCheck := (value = "Off") ? 0 : 1
			BugrunScorpionsLoot := (value = "Kill+Loot") ? 1 : 0
			nm_WebKillPair("Scorpions", BugrunScorpionsCheck, BugrunScorpionsLoot, hasGui)
		case "KillWerewolfMode":
			BugrunWerewolfCheck := (value = "Off") ? 0 : 1
			BugrunWerewolfLoot := (value = "Kill+Loot") ? 1 : 0
			nm_WebKillPair("Werewolf", BugrunWerewolfCheck, BugrunWerewolfLoot, hasGui)

		; --- Stingers / bosses / bug-run extras: classic bool global <-> Kill* key ---
		case "KillBugRunGatherInterrupt":
			BugrunInterruptCheck := value ? 1 : 0
			nm_WebKillClassicStore("BugrunInterruptCheck", BugrunInterruptCheck, hasGui)
		case "KillBugRunRespawnTime":
			MonsterRespawnTime := (value = "") ? 0 : value
			nm_WebKillClassicStore("MonsterRespawnTime", MonsterRespawnTime, hasGui)
		case "KillViciousBeeEnabled":
			StingerCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerCheck", StingerCheck, hasGui)
		case "KillViciousBeeOnlyDaily":
			StingerDailyBonusCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerDailyBonusCheck", StingerDailyBonusCheck, hasGui)
		case "KillViciousBeeFieldClover":
			StingerCloverCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerCloverCheck", StingerCloverCheck, hasGui)
		case "KillViciousBeeFieldSpider":
			StingerSpiderCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerSpiderCheck", StingerSpiderCheck, hasGui)
		case "KillViciousBeeFieldCactus":
			StingerCactusCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerCactusCheck", StingerCactusCheck, hasGui)
		case "KillViciousBeeFieldRose":
			StingerRoseCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerRoseCheck", StingerRoseCheck, hasGui)
		case "KillViciousBeeFieldMountainTop":
			StingerMountainTopCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerMountainTopCheck", StingerMountainTopCheck, hasGui)
		case "KillViciousBeeFieldPepper":
			StingerPepperCheck := value ? 1 : 0
			nm_WebKillClassicStore("StingerPepperCheck", StingerPepperCheck, hasGui)
		case "KillKingBeetleEnabled":
			KingBeetleCheck := value ? 1 : 0
			nm_WebKillClassicStore("KingBeetleCheck", KingBeetleCheck, hasGui)
		case "KillKingBeetleWaitBabyLove":
			KingBeetleBabyCheck := value ? 1 : 0
			nm_WebKillClassicStore("KingBeetleBabyCheck", KingBeetleBabyCheck, hasGui)
		case "KillKingBeetleAmuletAction":
			KingBeetleAmuletMode := (value = "Keep Old") ? 1 : 0
			nm_WebKillClassicStore("KingBeetleAmuletMode", KingBeetleAmuletMode, hasGui)
			if hasGui
				try MainGui["KingBeetleAmuletModeText"].Text := (KingBeetleAmuletMode = 1) ? " Keep Old" : "Do Nothing"
		case "KillTunnelBearEnabled":
			TunnelBearCheck := value ? 1 : 0
			nm_WebKillClassicStore("TunnelBearCheck", TunnelBearCheck, hasGui)
		case "KillTunnelBearWaitBabyLove":
			TunnelBearBabyCheck := value ? 1 : 0
			nm_WebKillClassicStore("TunnelBearBabyCheck", TunnelBearBabyCheck, hasGui)
		case "KillCocoCrabEnabled":
			CocoCrabCheck := value ? 1 : 0
			nm_WebKillClassicStore("CocoCrabCheck", CocoCrabCheck, hasGui)
		case "KillCommandoChickEnabled":
			CommandoCheck := value ? 1 : 0
			nm_WebKillClassicStore("CommandoCheck", CommandoCheck, hasGui)
		case "KillStumpSnailEnabled":
			StumpSnailCheck := value ? 1 : 0
			nm_WebKillClassicStore("StumpSnailCheck", StumpSnailCheck, hasGui)
		case "KillCommandoChickLevel":
			ChickLevel := (value = "") ? 10 : value
			nm_WebKillClassicStore("ChickLevel", ChickLevel, hasGui)
			if hasGui
				try MainGui["ChickLevelText"].Text := ChickLevel
		case "KillCommandoChickTime":
			ChickTime := (value = "Kill") ? "Kill" : SubStr(value, 1, -1)
			nm_WebKillClassicStore("ChickTime", ChickTime, hasGui)
			if hasGui
				nm_WebKillSetTimeCtrl("ChickTime", value)
		case "KillStumpSnailTime":
			SnailTime := (value = "Kill") ? "Kill" : SubStr(value, 1, -1)
			nm_WebKillClassicStore("SnailTime", SnailTime, hasGui)
			if hasGui
				nm_WebKillSetTimeCtrl("SnailTime", value)
		case "KillCommandoChickHP":
			lvl := IsSet(ChickLevel) ? ChickLevel : 10
			maxHP := CommandoChickHealth.Has(lvl) ? CommandoChickHealth[lvl] : 10000000
			InputChickHealth := Round(Min(100, ((value || 0) / maxHP) * 100), 2)
			try IniWrite InputChickHealth, "settings\nm_config.ini", "Collect", "InputChickHealth"
		case "KillStumpSnailHP":
			InputSnailHealth := Round(Min(100, ((value || 0) / 30000000) * 100), 2)
			try IniWrite InputSnailHealth, "settings\nm_config.ini", "Collect", "InputSnailHealth"
	}
}

; Persist + mirror one Bug Run Check/Loot pair (classic control names are Bugrun<Type>Check/Loot).
nm_WebKillPair(t, check, loot, hasGui) {
	global
	try IniWrite check, "settings\nm_config.ini", "Collect", "Bugrun" t "Check"
	try IniWrite loot, "settings\nm_config.ini", "Collect", "Bugrun" t "Loot"
	if hasGui {
		try MainGui["Bugrun" t "Check"].Value := check
		try MainGui["Bugrun" t "Loot"].Value := loot
	}
}

; Persist + mirror a classic setting whose global, control and [Collect] key share one name.
nm_WebKillClassicStore(gname, gval, hasGui) {
	global
	try IniWrite gval, "settings\nm_config.ini", "Collect", gname
	if hasGui
		try MainGui[gname].Value := gval
}

nm_WebKillSetTimeCtrl(vn, value) {
	global MainGui
	static timeMap := Map("5m", 1, "10m", 2, "15m", 3, "Kill", 4)
	updown := (vn = "ChickTime") ? "ChickTimeUpDown" : "SnailTimeUpDown"
	if timeMap.Has(value)
		try MainGui[updown].Value := timeMap[value]
	try MainGui[vn "Text"].Text := value
}

; Rewrite the [Kill] section from the in-memory Kill* globals and mirror every Kill setting
; onto the classic globals. Called once after nm_importConfig() and before MainGui is built.
nm_WebSyncKillToClassic() {
	global
	static killKeys := ["KillBugRunGatherInterrupt", "KillBugRunRespawnTime", "KillLadybugsMode", "KillRhinoBeetlesMode"
		, "KillSpiderMode", "KillMantisMode", "KillScorpionsMode", "KillWerewolfMode"
		, "KillViciousBeeEnabled", "KillViciousBeeOnlyDaily", "KillViciousBeeFieldClover", "KillViciousBeeFieldSpider"
		, "KillViciousBeeFieldCactus", "KillViciousBeeFieldRose", "KillViciousBeeFieldMountainTop", "KillViciousBeeFieldPepper"
		, "KillKingBeetleEnabled", "KillKingBeetleWaitBabyLove", "KillKingBeetleAmuletAction"
		, "KillTunnelBearEnabled", "KillTunnelBearWaitBabyLove", "KillCocoCrabEnabled"
		, "KillCommandoChickEnabled", "KillCommandoChickLevel", "KillCommandoChickHP", "KillCommandoChickTime"
		, "KillStumpSnailEnabled", "KillStumpSnailHP", "KillStumpSnailAmuletAction", "KillStumpSnailTime"]
	for _, k in killKeys {
		if !IsSet(%k%)
			continue
		v := %k%
		; nm_importConfig() rewrites the whole INI from its catalog and drops [Kill].
		try IniWrite v, "settings\nm_config.ini", "Kill", SubStr(k, 5)
		nm_WebKillToClassic(k, v)
	}
}

; Classic GUI -> web: derive the Kill* values from the legacy controls and store them in the
; Kill* globals so nm_WebSyncTimer's snapshot pushes them to the web GUI. Health/time/level
; are omitted because their classic handlers already broadcast the correct keys on change.
nm_WebPushClassicKill() {
	global MainGui
	if !IsSet(MainGui)
		return
	static bugTypes := ["Ladybugs", "RhinoBeetles", "Spider", "Mantis", "Scorpions", "Werewolf"]
	for _, t in bugTypes {
		try chk := MainGui["Bugrun" t "Check"].Value
		catch
			continue
		try loot := MainGui["Bugrun" t "Loot"].Value
		catch
			loot := 0
		nm_WebSetKillVar("Kill" t "Mode", chk ? (loot ? "Kill+Loot" : "Kill") : "Off")
	}
	nm_WebPushFromCtrl("BugrunInterruptCheck", "KillBugRunGatherInterrupt", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("MonsterRespawnTime", "KillBugRunRespawnTime", (v) => (v = "") ? 0 : v + 0)
	nm_WebPushFromCtrl("StingerCheck", "KillViciousBeeEnabled", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerDailyBonusCheck", "KillViciousBeeOnlyDaily", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerCloverCheck", "KillViciousBeeFieldClover", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerSpiderCheck", "KillViciousBeeFieldSpider", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerCactusCheck", "KillViciousBeeFieldCactus", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerRoseCheck", "KillViciousBeeFieldRose", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerMountainTopCheck", "KillViciousBeeFieldMountainTop", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StingerPepperCheck", "KillViciousBeeFieldPepper", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("KingBeetleCheck", "KillKingBeetleEnabled", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("KingBeetleBabyCheck", "KillKingBeetleWaitBabyLove", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("KingBeetleAmuletMode", "KillKingBeetleAmuletAction", (v) => v ? "Keep Old" : "Do Nothing")
	nm_WebPushFromCtrl("TunnelBearCheck", "KillTunnelBearEnabled", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("TunnelBearBabyCheck", "KillTunnelBearWaitBabyLove", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("CocoCrabCheck", "KillCocoCrabEnabled", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("CommandoCheck", "KillCommandoChickEnabled", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("StumpSnailCheck", "KillStumpSnailEnabled", (v) => v ? 1 : 0)
	nm_WebPushFromCtrl("ShellAmuletMode", "KillStumpSnailAmuletAction", (v) => v ? "Keep Old" : "Do Nothing")
}

nm_WebPushFromCtrl(ctrl, killKey, transform) {
	global MainGui
	try
		v := MainGui[ctrl].Value
	catch
		return
	nm_WebSetKillVar(killKey, transform(v))
}

nm_WebSetKillVar(name, value) {
	global
	; All Kill* globals are declared + assigned by nm_LoadKillSettings, so the dynamic
	; reference is valid; guard anyway (AHK v2 errors if a dynamic target does not exist).
	if !IsSet(%name%)
		return
	if (%name% != value) {
		%name% := value
		try IniWrite value, "settings\nm_config.ini", "Kill", SubStr(name, 5)
	}
}

; Poll the AHK state and push any changed values to the web GUI.
; This keeps the classic GUI -> web GUI direction in sync for every setting,
; including ones whose classic controls do not route through nm_saveConfig.
nm_WebSyncTimer() {
	global MyWindow
	if !IsSet(MyWindow)
		return
	; Adopt any classic-GUI Kill changes into the Kill* globals first so the snapshot below
	; pushes them to the web GUI.
	nm_WebPushClassicKill()
	static last := Map()
	try {
		snap := nm_WebSnapshot()
	} catch {
		return
	}
	for section, obj in snap {
		type := nm_WebTypeForSection(section)
		for k, v in obj {
			lk := section "|" k
			if (!last.Has(lk) || (last[lk] != v)) {
				last[lk] := v
				try MyWindow.PostWebMessageAsString(JSON.stringify(Map("type", type, "key", k, "value", v)))
			}
		}
	}
}

; Map an AHK-style section name to the JS message type.
nm_WebTypeForSection(section) {
	switch section, 0 {
		case "Settings", "settings": return "settings"
		case "Status", "status": return "status"
		case "Plants", "Planters", "Planter", "plants": return "plants"
		case "Quests", "quests": return "quests"
		case "Collect", "Blender", "Shrine", "collect": return "collect"
		case "Boost", "boost": return "boost"
		case "Kill": return "kill"
		case "Gather", "gather": return "gather"
		default: return "misc"
	}
}

; Push a single setting change (originating in the classic GUI or AHK) to the web GUI.
nm_WebBroadcastSetting(section, key, value) {
	global MyWindow
	if !IsSet(MyWindow)
		return
	try MyWindow.PostWebMessageAsString(JSON.stringify(Map("type", nm_WebTypeForSection(section), "key", key, "value", value)))
}

; Per-field Gather actions coming from the web GUI ("save" / "copy" / "paste").
; The classic controls (SaveFieldDefault1..3 / CopyGather1..3 / PasteGather1..3) are
; identified by the trailing field number, so reuse the existing classic handlers.
WebGatherActionEvent(payload) {
	try {
		parts := StrSplit(payload, ":")
		if (parts.Length >= 2)
			nm_WebGatherAction(parts[1], Integer(parts[2]))
	} catch as e {
		OutputDebug "[ahk] gather action error: " e.Message
	}
}

nm_WebGatherAction(action, num) {
	global MainGui
	if (num < 1 || num > 3)
		return
	switch StrLower(action) {
		case "save":
			try nm_SaveFieldDefault(MainGui["SaveFieldDefault" num])
		case "copy":
			try nm_CopyGatherSettings(MainGui["CopyGather" num])
		case "paste":
			try nm_PasteGatherSettings(MainGui["PasteGather" num])
	}
}

;///////////////////////////////////////////////////////////////////////////////////////////
; Tab sync (web sidebar <-> classic TabCtrl)
;///////////////////////////////////////////////////////////////////////////////////////////
; Map a web sidebar id -> classic tab name (used for web -> classic).
nm_WebSelectClassicTab(webid) {
	global TabCtrl, MainGui, nm_SubTabKill
	if !IsSet(TabCtrl) || (webid = "")
		return
	static m := Map(
		"gather", "Gather", "collect", "Collect/Kill", "kill", "Collect/Kill",
		"boost", "Boost", "quest", "Quests", "planters", "Planters",
		"status", "Status", "settings", "Settings", "misc", "Misc", "about", "Credits")
	name := m.Has(webid) ? m[webid] : webid
	; The web splits the classic "Collect/Kill" tab into "Collect" and "Kill".
	; Flip the sub-tab BEFORE choosing the tab: `TabCtrl.Choose()` fires the classic
	; Change event, which broadcasts the tab back and would otherwise report the
	; stale sub-tab and bounce the web GUI back to Collect.
	if (webid = "collect" || webid = "kill") {
		wantKill := (webid = "kill") ? 1 : 0
		if (!IsSet(nm_SubTabKill) || (nm_SubTabKill != wantKill))
			try nm_CollectKillButton(MainGui[wantKill ? "KillSubTab" : "CollectSubTab"])
	}
	try TabCtrl.Choose(name)
}

; Map the currently selected classic tab -> web sidebar id (used for classic -> web).
nm_ClassicTabToWeb() {
	global TabCtrl, nm_SubTabKill
	if !IsSet(TabCtrl)
		return ""
	i := 0
	try i := TabCtrl.Value
	; classic TabArr order: Gather, Collect/Kill, Boost, Quests, Planters, Status, Settings, Misc, Credits, [Advanced]
	static names := ["gather", "collect", "boost", "quest", "planters", "status", "settings", "misc", "about", "settings"]
	if (i < 1 || i > names.Length)
		return ""
	id := names[i]
	; The classic "Collect/Kill" tab is split into "Collect" and "Kill" on the web,
	; so report whichever classic sub-tab is currently showing.
	if (id = "collect")
		id := (IsSet(nm_SubTabKill) && nm_SubTabKill) ? "kill" : "collect"
	return id
}

nm_WebBroadcastTab(webid) {
	global MyWindow
	if !IsSet(MyWindow) || (webid = "")
		return
	try MyWindow.PostWebMessageAsString(JSON.stringify(Map("type", "tab", "key", "Tab", "value", webid)))
}

nm_OnTabChange(*) {
	global TabCtrl
	try TabCtrl.Focus()
	nm_WebBroadcastTab(nm_ClassicTabToWeb())
}

; Apply a setting that originated in the web GUI: persist, mirror the classic GUI, then echo back.
nm_WebApplySetting(section, key, value) {
	global
	local slot, z, si, sa, sx

	; Blender slots drive the classic Blender card (ingredient picture / Add-Clear
	; button / "(amount) [repeat]" line). This mirrors the classic `ba_AddBlenderItem`
	; flow directly instead of relying on nm_UpdateGUIVar()'s `case ""` fallthrough,
	; whose first statement could throw and silently skip the rest (the caller wraps
	; nm_UpdateGUIVar in `try`).
	if (SubStr(key, 1, 11) = "BlenderItem") {
		try %key% := value
		try IniWrite value, "settings\nm_config.ini", "Blender", key
		z := SubStr(key, -1)
		try MainGui["BlenderItem" z "Picture"].Value := hBitmapsSB[%key%] ? ("HBITMAP:*" hBitmapsSB[%key%]) : ""
		try MainGui["BlenderAdd" z].Text := ((BlenderItem%z% = "None" || BlenderItem%z% = "") ? "Add" : "Clear")
		try MainGui["BlenderData" z].Text := "(" BlenderAmount%z% ") [" ((BlenderIndex%z% = "Infinite") ? "∞" : BlenderIndex%z%) "]"
		nm_WebBroadcastSetting("Blender", key, value)
		return
	}
	if (SubStr(key, 1, 13) = "BlenderAmount" || SubStr(key, 1, 12) = "BlenderIndex") {
		try %key% := value
		try IniWrite value, "settings\nm_config.ini", "Blender", key
		z := SubStr(key, -1)
		try MainGui["BlenderData" z].Text := "(" BlenderAmount%z% ") [" ((BlenderIndex%z% = "Infinite") ? "∞" : BlenderIndex%z%) "]"
		nm_WebBroadcastSetting("Blender", key, value)
		return
	}

	; Manual planter cycles live in settings\manual_planters.ini (section "Slot N")
	if (SubStr(key, 1, 5) = "MSlot") {
		try %key% := value
		slot := SubStr(key, 6, 1)
		try IniWrite value, "settings\manual_planters.ini", "Slot " slot, key
		; Mirror the classic GUI's manual-planter grid (values + enabled state).
		try mp_UpdateControls()
		nm_WebBroadcastSetting("Plants", key, value)
		return
	}

	; Wind Shrine slots drive the classic Shrine card (item picture / Add-Clear / data).
	; Self-contained mirror: every dynamic read is individually guarded (a ShrineAmount/
	; ShrineIndex global may legitimately be unset), so a single missing value can never
	; abort the whole update or surface as an error to the web caller.
	if (SubStr(key, 1, 10) = "ShrineItem" || SubStr(key, 1, 12) = "ShrineAmount" || SubStr(key, 1, 11) = "ShrineIndex") {
		try %key% := value
		try IniWrite value, "settings\nm_config.ini", "Shrine", key
		z := SubStr(key, -1)
		try {
			si := "", sa := 0, sx := 0
			try si := ShrineItem%z%
			try sa := ShrineAmount%z%
			try sx := ShrineIndex%z%
			MainGui["ShrineItem" z "Picture"].Value := hBitmapsSB[si] ? ("HBITMAP:*" hBitmapsSB[si]) : ""
			MainGui["ShrineAdd" z].Text := ((si = "None" || si = "") ? "Add" : "Clear")
			MainGui["ShrineData" z].Text := "(" sa ") [" ((sx = "Infinite") ? "∞" : sx) "]"
		}
		try nm_UpdateGUIVar(key)
		nm_WebBroadcastSetting("Collect", key, value)
		return
	}

	; a couple of friendly value normalisations
	if (key = "ClaimMethod" && value = "To Slot")
		value := "ToSlot"

	; GuiTransparency arrives from the web as the displayed 0-70 value (steps of 5); the
	; classic UpDown holds 0-14 (value // 5). nm_guiTransparencySet() always re-reads the
	; UpDown control and writes GuiTransparency back (UpDown * 5), so set the control first.
	if (key = "GuiTransparency") {
		try MainGui["GuiTransparencyUpDown"].Value := (value = "") ? 0 : Round(value / 5)
		try nm_guiTransparencySet()
		nm_WebBroadcastSetting("Settings", key, value)
		return
	}

	; Nectar preset is stored in the lowercase `nPreset` global.
	if (key = "NectarPreset" || key = "nPreset") {
		nm_WebSetNectarPreset(value)
		nm_WebBroadcastSetting("Planters", "NectarPreset", value)
		return
	}
	; Harvest mode is a single radio in the web GUI mapping onto 3 classic flags.
	if (key = "HarvestMode") {
		HarvestFullGrown := (value = "Full") ? 1 : 0
		AutomaticHarvestInterval := (value = "Auto") ? 1 : 0
		try IniWrite HarvestFullGrown, "settings\nm_config.ini", "Planters", "HarvestFullGrown"
		try IniWrite AutomaticHarvestInterval, "settings\nm_config.ini", "Planters", "AutomaticHarvestInterval"
		try MainGui["HarvestFullGrown"].Value := HarvestFullGrown
		try MainGui["AutomaticHarvestInterval"].Value := AutomaticHarvestInterval
		nm_WebBroadcastSetting("Planters", "HarvestMode", value)
		return
	}

	try %key% := value
	try IniWrite value, "settings\nm_config.ini", section, key
	try nm_UpdateGUIVar(key)

	try {
		switch key, 0 {
			case "AlwaysOnTop": nm_AlwaysOnTop()
			; Mirror the classic GUI (nm_guiThemeSelect): choosing a theme restarts the
			; script so the new skin is re-applied to every window, including the WebView
			; GUI. Deferred with SetTimer so this returns before the host-object call tears
			; itself down via Reload.
			case "GuiTheme": SetTimer(() => Reload(), -250)
			case "GuiTransparency": nm_guiTransparencySet()
			case "HiveBees": nm_HiveBees(MainGui["HiveBees"])
			case "KeyDelay": nm_saveKeyDelay()
			case "PlanterMode": ba_PlanterSwitch()
			case "NectarPreset": nm_WebSetNectarPreset(value)
			case "HarvestInterval": ba_harvestInterval()
			case "ReconnectInterval": nm_setReconnectInterval(MainGui["ReconnectInterval"])
			case "ReconnectHour": nm_setReconnectHour(MainGui["ReconnectHour"])
			case "ReconnectMin": nm_setReconnectMin(MainGui["ReconnectMin"])
			case "MoveSpeedNum": nm_moveSpeed(MainGui["MoveSpeedNum"])
			case "StatusLogReverse": nm_StatusLogReverseCheck()
			case "n1priority", "n2priority", "n3priority", "n4priority", "n5priority":
				try nm_NectarPriority()
				nPreset := "Custom"
				try MainGui["nPreset"].Text := "Custom"
				try IniWrite "Custom", "settings\nm_config.ini", "Planters", "nPreset"
				nm_WebBroadcastSetting("Planters", "NectarPreset", "Custom")
			case "n1minPercent", "n2minPercent", "n3minPercent", "n4minPercent", "n5minPercent":
				try MainGui[key "UpDown"].Value := value // 10
				nPreset := "Custom"
				try MainGui["nPreset"].Text := "Custom"
				try IniWrite "Custom", "settings\nm_config.ini", "Planters", "nPreset"
				nm_WebBroadcastSetting("Planters", "NectarPreset", "Custom")
		}
	}

	nm_WebBroadcastSetting(section, key, value)
}

; Notify the Status submacro (and natro_macro itself) that a Discord setting
; changed, mirroring the classic Discord window's post-apply messages.
nm_WebNotifyDiscord(key) {
	global
	static intEnum := Map("DiscordMode", 1
		, "DiscordCheck", 2
		, "MainChannelCheck", 3
		, "ReportChannelCheck", 4
		, "ssCheck", 6
		, "CriticalSSCheck", 8
		, "AmuletSSCheck", 9
		, "MachineSSCheck", 10
		, "BalloonSSCheck", 11
		, "ViciousSSCheck", 12
		, "DeathSSCheck", 13
		, "PlanterSSCheck", 14
		, "HoneySSCheck", 15
		, "criticalCheck", 16
		, "CriticalErrorPingCheck", 17
		, "DisconnectPingCheck", 18
		, "GameFrozenPingCheck", 19
		, "PhantomPingCheck", 20
		, "UnexpectedDeathPingCheck", 21
		, "EmergencyBalloonPingCheck", 22
		, "HoneyUpdateSSCheck", 363)
	static strEnum := Map("Webhook", 1, "BotToken", 2, "MainChannelID", 3, "ReportChannelID", 4, "discordUID", 5, "discordUIDCommands", 80)
	local k := key, v

	if intEnum.Has(k) {
		v := %k%
		if WinExist("natro_macro.ahk ahk_class AutoHotkey")
			try PostMessage 0x5552, intEnum[k], v
		if WinExist("Status.ahk ahk_class AutoHotkey")
			try PostMessage 0x5552, intEnum[k], v
	} else if strEnum.Has(k) {
		if WinExist("natro_macro.ahk ahk_class AutoHotkey")
			try PostMessage 0x5553, strEnum[k], 7
		if WinExist("Status.ahk ahk_class AutoHotkey")
			try PostMessage 0x5553, strEnum[k], 7
	}
}

; Mirror a boosted-gather-field checkbox into the classic floating
; "Select Boosted Gather Fields" window, but only if it is currently open.
nm_WebMirrorBoostedFieldGui(key) {
	global
	if (SubStr(key, -12) != "BoosterCheck")
		return
	try BoostedFieldSelectGui[key].Value := (%key% = "") ? 0 : %key%
}

; Read the Natro Macro auto-start registry entry.
nm_WebReadAutoStart() {
	global
	local out := { enabled: 0, delay: 0 }, task := "", args := [], pos := 1, m := ""
	try task := RegRead("HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "NatroMacro")
	if (task = "")
		return out
	while (pos := RegExMatch(task, '"([^"]*)"', &m, pos)) {
		args.Push(m[1])
		pos := m.Pos + m.Len
	}
	if (args.Length >= 2 && args[2] = "1")
		out.enabled := 1
	if (args.Length >= 4 && IsNumber(args[4]))
		out.delay := Integer(args[4])
	return out
}

; Write (or clear) the Natro Macro auto-start registry entry.
nm_WebWriteAutoStart(enabled, delay) {
	global
	RegWrite '"' A_WorkingDir '\START.bat"'
		. ((enabled) ? ' "1"' : ' ""')
		. ' ""'
		. ((delay > 0) ? ' "' delay '"' : ' ""')
		, "REG_SZ", "HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "NatroMacro"
}

; Read a Roblox FPS cap ('Web' or 'UWP').
nm_WebReadFPSCount(kind) {
	global
	; Default to 60 (the Roblox default) when the settings file / cap can't be found,
	; so the web Misc tab never shows a misleading 0.
	local fps := 60, xmlpath := "", robloxtype := "", m := ""
	try {
		robloxtype := (kind = "UWP") ? RobloxTypes.UWP : RobloxTypes.Web
		xmlpath := nm_LocateRobloxSettingsXML(robloxtype)
		if (xmlpath && RegExMatch(FileRead(xmlpath), "<int name=`"FramerateCap`">(-?\d+)</int>", &m))
			fps := (Integer(m[1]) <= 0) ? 60 : Integer(m[1])
	}
	return { fps: fps }
}

; Apply a new Roblox FPS cap ('Web' or 'UWP').
nm_WebWriteFPSCount(kind, fps) {
	global
	local robloxtype, xmlpath, xml
	robloxtype := (kind = "UWP") ? RobloxTypes.UWP : RobloxTypes.Web
	xmlpath := nm_LocateRobloxSettingsXML(robloxtype)
	if !xmlpath
		return 0
	xml := FileRead(xmlpath)
	xml := RegExReplace(xml, "<int name=`"FramerateCap`">-?\d+</int>", "<int name=`"FramerateCap`">" ((fps = 60) ? "-1" : fps) "</int>")
	FileDelete xmlpath
	FileAppend xml, xmlpath
	return 1
}

; Apply a setting that originated in the web "Misc" tab. These keys are spread
; across the [Settings] and [Status] INI sections instead of the Misc message type.
nm_WebApplyMiscSetting(key, value) {
	global
	local section, fps

	; --- values that are not stored in nm_config.ini ---
	if (key = "AutoStartEnabled" || key = "AutoStartDelay") {
		if (key = "AutoStartEnabled") {
			try AutoStartEnabled := value ? 1 : 0
		} else {
			try AutoStartDelay := value + 0
		}
		try nm_WebWriteAutoStart(AutoStartEnabled, AutoStartDelay)
		nm_WebBroadcastSetting("misc", key, value)
		return
	}
	if (key = "WebFPSCount" || key = "UWPFPSCount") {
		fps := Max(15, Min(1000, Integer(value)))
		try %key% := fps
		try nm_WebWriteFPSCount((key = "WebFPSCount") ? "Web" : "UWP", fps)
		nm_WebBroadcastSetting("misc", key, fps)
		return
	}

	switch key, 0 {
		case "DebugLogEnabled", "NightAnnouncementCheck", "NightAnnouncementName"
			, "NightAnnouncementPingID", "NightAnnouncementWebhook":
			section := "Status"
		default:
			section := "Settings"
	}
	try %key% := value
	try IniWrite value, "settings\nm_config.ini", section, key
	try nm_UpdateGUIVar(key)
	; hotkeys are registered at startup, so re-register them when one changes
	if (SubStr(key, -6) = "Hotkey")
		nm_WebApplyHotkeys()
	nm_WebBroadcastSetting("misc", key, value)
}

; Re-register the macro hotkeys from the current globals.
nm_WebApplyHotkeys() {
	global
	try {
		Hotkey StartHotkey, start, "On"
		Hotkey PauseHotkey, nm_pause, "On"
		Hotkey StopHotkey, stop, "On"
		Hotkey AutoClickerHotkey, autoclicker, "On T2"
		Hotkey TimersHotkey, timers, "On"
		Hotkey DebugHotkey, nm_copyDebugLog, "On"
	}
}

; Restore the default hotkeys and push the new values back to the web GUI.
; (nm_ResetHotkeys() cannot be reused directly because it touches the classic
; "Hotkeys" popup which is not open when the web GUI asks for a reset.)
nm_WebResetHotkeys() {
	global
	local k, _
	try {
		Hotkey StartHotkey, start, "Off"
		Hotkey PauseHotkey, nm_pause, "Off"
		Hotkey StopHotkey, stop, "Off"
		Hotkey AutoClickerHotkey, autoclicker, "Off"
		Hotkey TimersHotkey, timers, "Off"
		Hotkey DebugHotkey, nm_copyDebugLog, "Off"
	}
	StartHotkey := "F1", PauseHotkey := "F2", StopHotkey := "F3"
	AutoClickerHotkey := "F4", TimersHotkey := "F5", DebugHotkey := "F6"
	for _, k in ["StartHotkey", "PauseHotkey", "StopHotkey", "AutoClickerHotkey", "TimersHotkey", "DebugHotkey"]
		try IniWrite %k%, "settings\nm_config.ini", "Settings", k
	nm_WebApplyHotkeys()
	for _, k in ["StartHotkey", "PauseHotkey", "StopHotkey", "AutoClickerHotkey", "TimersHotkey", "DebugHotkey"] {
		try nm_WebBroadcastSetting("misc", k, %k%)
	}
	try nm_UpdateWebButtonLabels()
}

; Refresh the web top-bar button labels after the hotkeys changed.
nm_UpdateWebButtonLabels() {
	global MyWindow, StartHotkey, PauseHotkey, StopHotkey, AutoClickerHotkey, TimersHotkey
	local js
	if !IsSet(MyWindow)
		return
	js := "var m={StartHotkey:'" StartHotkey "',PauseHotkey:'" PauseHotkey "',StopHotkey:'" StopHotkey
		. "',AutoClickerHotkey:'" AutoClickerHotkey "',TimersHotkey:'" TimersHotkey "'};"
		. "$('#Start-Button').text(' Start ('+m.StartHotkey+')');"
		. "$('#Pause-Button').text(' Pause ('+m.PauseHotkey+')');"
		. "$('#Stop-Button').text(' Stop ('+m.StopHotkey+')');"
		. "$('#AutoClick-Button').text(' AutoClick ('+m.AutoClickerHotkey+')');"
		. "$('#Status-Button').text(' Status ('+m.TimersHotkey+')');"
	try MyWindow.ExecuteScript(js)
}

; Apply a nectar preset (mirrors the classic nm_NectarPreset switch).
nm_WebSetNectarPreset(preset) {
	global
	if (preset = "Custom")
		return
	ba_nectarPresetByName(preset)
	; A preset rewrites the 5 priorities, the 5 min % values and all 17 allowed-field
	; checkboxes. Without this flush those only reach the web GUI on the next
	; nm_WebSyncTimer tick (up to 750 ms later), which is what made preset switches
	; feel like they took ~1 second to "fill out" the dropdowns. Run the diff/push
	; immediately so the whole Planters state lands in a single batch.
	try nm_WebSyncTimer()
}

ba_nectarPresetByName(preset) {
	global
	nPreset := preset
	try MainGui["NPreset"].Text := preset
	IniWrite nPreset, "settings\nm_config.ini", "Planters", "NPreset"

	switch preset, 0 {
		case "Blue":
		nm_NectarPrioritySet("Comforting", "Motivating", "Satisfying", "Refreshing", "Invigorating")
		nm_NectarMinSet(70, 80, 80, 80, 40)
		nm_NectarFieldChecks(Map("Dandelion",1, "Bamboo",0, "PineTree",1, "Mushroom",0, "Spider",1, "Rose",1, "Stump",0
			, "Sunflower",1, "Pineapple",1, "Pumpkin",0, "BlueFlower",1, "Strawberry",1, "Coconut",0
			, "Clover",1, "Cactus",1, "MountainTop",0, "Pepper",1))

		case "Red":
		nm_NectarPrioritySet("Invigorating", "Refreshing", "Motivating", "Satisfying", "Comforting")
		nm_NectarMinSet(70, 80, 80, 80, 40)
		nm_NectarFieldChecks(Map("Clover",0, "Cactus",1, "MountainTop",0, "Pepper",1, "BlueFlower",1, "Strawberry",1
			, "Coconut",0, "Mushroom",0, "Spider",1, "Rose",1, "Stump",0, "Sunflower",1, "Pineapple",1, "Pumpkin",1
			, "Dandelion",1, "Bamboo",1, "PineTree",1))

		case "White":
		nm_NectarPrioritySet("Satisfying", "Motivating", "Refreshing", "Comforting", "Invigorating")
		nm_NectarMinSet(70, 80, 80, 80, 40)
		nm_NectarFieldChecks(Map("Sunflower",1, "Pineapple",1, "Pumpkin",0, "Mushroom",0, "Spider",1, "Rose",1
			, "Stump",0, "BlueFlower",1, "Strawberry",1, "Coconut",0, "Dandelion",1, "Bamboo",1, "PineTree",1
			, "Clover",1, "Cactus",1, "MountainTop",0, "Pepper",1))
	}
	nm_NectarPersistPreset()
}

nm_NectarPrioritySet(a, b, c, d, e) {
	global
	n1priority := a, n2priority := b, n3priority := c, n4priority := d, n5priority := e
	try MainGui["n1Priority"].Text := a
	try MainGui["n2Priority"].Text := b
	try MainGui["n3Priority"].Text := c
	try MainGui["n4Priority"].Text := d
	try MainGui["n5Priority"].Text := e
	; The classic nm_NectarPreset() calls nm_NectarPriority() right after setting the
	; priorities. With no control argument it does not mark the preset "Custom"; it
	; re-normalises the list and re-enables the classic GUI's priority arrows and
	; min % UpDowns (which nm_NectarPriority() disables after a "None" entry). Mirror
	; that so both GUIs end up in the same state.
	try nm_NectarPriority()
}

nm_NectarMinSet(a, b, c, d, e) {
	global
	n1minPercent := a, n2minPercent := b, n3minPercent := c, n4minPercent := d, n5minPercent := e
	try MainGui["n1minPercent"].Text := a
	try MainGui["n2minPercent"].Text := b
	try MainGui["n3minPercent"].Text := c
	try MainGui["n4minPercent"].Text := d
	try MainGui["n5minPercent"].Text := e
	; The classic sets the UpDown as well as the label (the UpDown holds value//10).
	; Keep it in step so the classic GUI does not show a stale minimum after a preset
	; is applied from the web GUI.
	try MainGui["n1minPercentUpDown"].Value := a // 10
	try MainGui["n2minPercentUpDown"].Value := b // 10
	try MainGui["n3minPercentUpDown"].Value := c // 10
	try MainGui["n4minPercentUpDown"].Value := d // 10
	try MainGui["n5minPercentUpDown"].Value := e // 10
}

nm_NectarFieldChecks(map) {
	global
	local name, val, k
	; Only update the globals/controls here; persistence is handled by the single
	; batched write in nm_NectarPersistPreset() at the end of ba_nectarPresetByName().
	; Writing each key with its own IniWrite() added ~180 ms of lag per preset switch.
	for name, val in map {
		k := name "FieldCheck"
		try %k% := val
		try MainGui[k].Value := val
	}
}

; Persist the [Planters] keys a nectar preset changes with a SINGLE read + write.
;
; The classic code calls ba_saveConfig_() here, which issues ~50 sequential IniWrite()
; calls. IniWrite() re-reads and rewrites the whole file every time (~10 ms on an
; ~11.7 KB nm_config.ini), so that call alone cost ~500 ms - the main source of the
; "presets take half a second to fill out the dropdowns" lag. Only the keys a preset
; actually touches are written here; every other [Planters] value is unchanged and
; keeps its existing INI entry. This intentionally does NOT touch natro_macro.ahk, so
; the upstream ba_saveConfig_() (used by the classic GUI and planter placement) is
; left completely alone.
nm_NectarPersistPreset() {
	global
	nmPresetKv := Map(
		"nPreset", nPreset
		, "n1priority", n1priority
		, "n2priority", n2priority
		, "n3priority", n3priority
		, "n4priority", n4priority
		, "n5priority", n5priority
		, "n1minPercent", n1minPercent
		, "n2minPercent", n2minPercent
		, "n3minPercent", n3minPercent
		, "n4minPercent", n4minPercent
		, "n5minPercent", n5minPercent
		, "BambooFieldCheck", BambooFieldCheck
		, "BlueFlowerFieldCheck", BlueFlowerFieldCheck
		, "CactusFieldCheck", CactusFieldCheck
		, "CloverFieldCheck", CloverFieldCheck
		, "CoconutFieldCheck", CoconutFieldCheck
		, "DandelionFieldCheck", DandelionFieldCheck
		, "MountainTopFieldCheck", MountainTopFieldCheck
		, "MushroomFieldCheck", MushroomFieldCheck
		, "PepperFieldCheck", PepperFieldCheck
		, "PineTreeFieldCheck", PineTreeFieldCheck
		, "PineappleFieldCheck", PineappleFieldCheck
		, "PumpkinFieldCheck", PumpkinFieldCheck
		, "RoseFieldCheck", RoseFieldCheck
		, "SpiderFieldCheck", SpiderFieldCheck
		, "StrawberryFieldCheck", StrawberryFieldCheck
		, "StumpFieldCheck", StumpFieldCheck
		, "SunflowerFieldCheck", SunflowerFieldCheck
	)
	try nm_IniWriteSection("settings\nm_config.ini", "Planters", nmPresetKv)
}

nm_WebBlenderItemFromWeb(v) {
	; NOTE: do NOT name this variable `map` — identifiers are case-insensitive, so
	; `map` shadows the built-in Map() and `Map(...)` would try to call the variable
	; (which is what silently broke Blender/Wind Shrine item changes).
	static itemMap := Map("antpass","AntPass","cloudvial","CloudVial","blueberry","Blueberry","blueextract","BlueExtract"
		,"causticwax","CausticWax","enzymes","Enzymes","fielddice","FieldDice","glitter","Glitter","glue","Glue"
		,"gumdrops","Gumdrops","hardwax","HardWax","loadeddice","LoadedDice","mooncharms","MoonCharms","oil","Oil"
		,"pineapple","Pineapple","purplepotion","PurplePotion","redextract","RedExtract","smoothdice","SmoothDice"
		,"softwax","SoftWax","starjelly","StarJelly","strawberry","Strawberry","sunflower","Sunflower"
		,"supersmoothie","SuperSmoothie","swirledwax","SwirledWax","tropicaldrink","TropicalDrink","turpentine","Turpentine")
	lower := StrLower(v)
	if (lower = "none" || lower = "")
		return "None"
	return itemMap.Has(lower) ? itemMap[lower] : v
}

nm_WebBlenderItemToWeb(v) {
	if (v = "None" || v = "")
		return "none"
	return StrLower(v)
}
