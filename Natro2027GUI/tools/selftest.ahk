/*
================================================================================
 Natro2027GUI - tools\selftest.ahk
--------------------------------------------------------------------------------
 One-shot regression suite for the whole folder. Run it after any change to the
 bridge, the entry point, or an upstream version bump.

     submacros\AutoHotkey32.exe Natro2027GUI\tools\selftest.ahk

 Must be 32-bit: the entry point refuses to build the GUI otherwise.
 Writes a transcript to Natro2027GUI\runtime\selftest.log and exits 0 on pass.

 Two notes:
  * It redirects SettingsBus.iniPath to a scratch INI, so it never touches the
    real settings\nm_config.ini.
  * The first two sections run synchronously, BEFORE the entry point's -10 ms
    timer can fire, so the suppression assertions cannot race the timers.
================================================================================
*/

#Requires AutoHotkey v2.0

#Include "%A_LineFile%\..\..\Natro2027GUI.ahk"

global _PASS := 0, _FAIL := 0, _LOGPATH := "", _BUSINI := ""

Say(t) {
    global _LOGPATH
    try FileAppend(t "`r`n", _LOGPATH, "UTF-8")
}
Chk(cond, name) {
    global _PASS, _FAIL
    if cond
        _PASS++
    else
        _FAIL++
    Say (cond ? "  PASS  " : "  FAIL  ") name
}

SplitPath A_LineFile, , &d
DirCreate d "\..\runtime"
_LOGPATH := d "\..\runtime\selftest.log"
_BUSINI  := d "\..\selftest.ini"
try FileDelete _LOGPATH
try FileDelete _BUSINI

Say "==== Natro2027GUI selftest  " FormatTime(A_Now, "yyyy-MM-dd HH:mm:ss") " ===="
Say "ptrsize=" A_PtrSize "  ahk=" A_AhkVersion
if (A_PtrSize != 4) {
    Say "RESULT: FAIL - must be run with the 32-bit interpreter"
    ExitApp 1
}
SettingsBus.iniPath := _BUSINI   ; never write the real config during a test

; ---------------------------------------------------------------------------
; 1. Generated enum map - positional correctness (the highest-risk invariant)
;    Synchronous: safe to run before the entry point's timer fires.
; ---------------------------------------------------------------------------
Say "--- enum map ---"
Chk(EnumMap.Str[1] = "webhook", "Str[1] = webhook")
Chk(EnumMap.Str[81] = "ClaimMethod", "Str[81] = ClaimMethod")
Chk(EnumMap.Str.Length = 81, "Str has 81 entries")
Chk(EnumMap.Int[1] = "discordMode", "Int[1] = discordMode")
Chk(EnumMap.Int[62] = "" && EnumMap.Int[63] = "ConvertMins", "Int[62] empty placeholder preserved")
Chk(EnumMap.Int[224] = "" && EnumMap.Int[225] = "HoneystormCheck", "Int[224] empty placeholder preserved")
Chk(EnumMap.Int[368] = "CheckNight", "Int[368] = CheckNight")
Chk(EnumMap.Int.Length = 368, "Int has 368 entries")
Chk(SettingsBus.StrIndex("webhook") = 1, "StrIndex(webhook) = 1")
Chk(SettingsBus.IntIndex("CheckNight") = 368, "IntIndex(CheckNight) = 368")
Chk(SettingsBus.SectionIndex("Boost") = 1 && SettingsBus.SectionIndex("Shrine") = 9, "section indices 1..9")
threw := false
try SettingsBus.StrIndex("NoSuchSetting")
catch
    threw := true
Chk(threw, "StrIndex fails LOUDLY on an unknown name")

; ---------------------------------------------------------------------------
; 2. Classic-GUI suppression (Option B). Synchronous - no Sleep between the
;    Show() and the visibility reads, so no timer can interfere.
; ---------------------------------------------------------------------------
Say "--- classic GUI suppression ---"
MainGui := Gui("+Border", "Natro Macro")
MainGui.Add("Text", "vstate", "Startup: UI")
MainGui.Show("w490 h275")
Chk(DllCall("IsWindowVisible", "Ptr", MainGui.Hwnd) = 1, "a MainGui-like window is visible after Show()")
Chk(SuppressClassicGui.Hide() && DllCall("IsWindowVisible", "Ptr", MainGui.Hwnd) = 0,
    "SuppressClassicGui.Hide hides it")
sub := Gui(, "AutoClicker")
sub.Show()
Chk(DllCall("IsWindowVisible", "Ptr", sub.Hwnd) = 1, "an unrelated sub-Gui is untouched")
lookupOk := true
try ctl := MainGui["state"]
catch
    lookupOk := false
Chk(lookupOk, "the hidden MainGui still answers control lookups")

; ---------------------------------------------------------------------------
; 3. Live settings-bus round trip (0x5552 / 0x5553)
; ---------------------------------------------------------------------------
Say "--- settings bus ---"
global _RX := []
OnI(w, l, *) {
    global _RX
    _RX.Push(Map("m", 0x5552, "w", w, "l", l))
    return 0
}
OnS(w, l, *) {
    global _RX
    _RX.Push(Map("m", 0x5553, "w", w, "l", l))
    return 0
}
OnMessage(0x5552, OnI, 255)
OnMessage(0x5553, OnS, 255)
SettingsBus.SetInt("CheckNight", 1, "Settings")
SettingsBus.SetStr("webhook", "https://example.test", "Settings")
Sleep 300
Chk(_RX.Length = 2, "two bus messages received")
if (_RX.Length >= 2) {
    Chk(_RX[1]["m"] = 0x5552 && _RX[1]["w"] = 368 && _RX[1]["l"] = 1, "int msg = 0x5552 (368, 1)")
    Chk(_RX[2]["m"] = 0x5553 && _RX[2]["w"] = 1 && _RX[2]["l"] = 6, "str msg = 0x5553 (1, 6 = Settings)")
}
Chk(IniRead(_BUSINI, "Settings", "CheckNight", "?") = 1, "bridge wrote the INI before posting")

; ---------------------------------------------------------------------------
; 4. Entry point boots (its -10 ms timer creates the Sciter window)
; ---------------------------------------------------------------------------
Say "--- entry point ---"
Sleep 600
Chk(Natro2027GUI.started, "Natro2027GUI.Start ran")
Chk(Natro2027GUI.hwnd != 0 && DllCall("IsWindow", "Ptr", Natro2027GUI.hwnd), "Sciter window created")
Sleep 1300   ; allow the post-load FitWindow to re-assert the geometry
Chk(Natro2027GUI.WinSize(Natro2027GUI.hwnd) = "1000x700", "window is 1000x700")

; ---------------------------------------------------------------------------
; 5. JS -> AHK bridge (the poller drains the page queue)
; ---------------------------------------------------------------------------
Say "--- js -> ahk bridge ---"
try FileDelete _BUSINI
Natro2027GUI.EvalJs("window.__n2027Queue = [{key:'CheckNight',value:1,section:'Settings'}];")
Sleep 1500
Chk(IniRead(_BUSINI, "Settings", "CheckNight", "?") = 1, "queued command reached the INI")

; ---------------------------------------------------------------------------
Say "----"
Say (_FAIL = 0 ? "RESULT: PASS (" _PASS " checks)" : "RESULT: FAIL (" _FAIL " of " (_PASS + _FAIL) " failed)")
try FileDelete _BUSINI
ExitApp (_FAIL = 0) ? 0 : 1
