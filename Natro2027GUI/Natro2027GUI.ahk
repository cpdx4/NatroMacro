/*
================================================================================
 Natro2027GUI - Natro2027GUI.ahk                         (THE ENTRY POINT)
--------------------------------------------------------------------------------
 This is the single file named by the one #Include line added to
 submacros\natro_macro.ahk. Everything the new GUI needs lives under this folder;
 upstream stays vanilla apart from that one line.

 Load order (critical):
   * natro_macro.ahk's own #Include "%A_ScriptDir%\..\lib" runs FIRST (line 25),
     so the JSON class is available here.
   * This file is #Included in the include block (lines 25-33), so its top-level
     code runs BEFORE upstream's SetWorkingDir (line 37), RunWith32 (line 55) and
     the MainGui construction (line 2560).
   * Therefore this file's top-level does only TIMER REGISTRATION (no working-dir
     dependent work). The real startup runs in a timer, which AHK fires only after
     the entire auto-execute section has finished - i.e. after SetWorkingDir has
     run, after the 64-bit process has reloaded itself as 32-bit, and after
     MainGui exists.

 The timer target Natro2027GUI_Start():
   1. bails out if not 32-bit (defensive; upstream RunWith32 already handles it),
   2. hides the classic MainGui (Option B - see bridge\suppress_classic_gui.ahk),
   3. points the settings bus at MainGui's HWND,
   4. loads sciter.dll, creates the window, loads ui\index.html,
   5. starts the JS->AHK bridge poller.

 Bridge (MVP): AHK->JS uses Sciter.Eval (call a JS global). JS->AHK uses a
 pending-command queue in the page that AHK drains on a timer. Both directions use
 only the PROVEN Sciter.Eval call; a native-functor bridge (SciterSetVariable +
 ValueNativeFunctorSet) is the intended follow-up for lower latency.
================================================================================
*/

#Requires AutoHotkey v2.0

; Upstream sets "#Warn VarUnset, Off" at natro_macro.ahk line 35, i.e. just AFTER
; this file is #Included at line 34. #Warn is positional, so without this line the
; code below would be checked with VarUnset warnings ON. That is harmless in the
; real macro (lib\JSON.ahk is already loaded by line 28), but when this file is
; validated or run STANDALONE the JSON class is undefined and AHK pops a MODAL
; "local JSON appears to never be assigned" dialog - which looks exactly like a
; hang. Declaring it here makes the folder self-sufficient and matches upstream.
#Warn VarUnset, Off

; Read-only upstream dependency. natro_macro.ahk already #Includes lib\JSON.ahk at
; line 28 (before this file at line 34), and AHK's #Include skips a file that was
; already included - so in the real macro this line is a no-op. It is here so the
; Natro2027GUI folder is self-sufficient: validated or run standalone, JSON.parse
; in PollBridge still resolves instead of throwing.
#Include "%A_LineFile%\..\..\lib\JSON.ahk"

; Bridge files, resolved relative to this file's folder (Natro2027GUI\).
#Include "%A_LineFile%\..\bridge\Sciter.ahk"
#Include "%A_LineFile%\..\bridge\enum_map.ahk"
#Include "%A_LineFile%\..\bridge\settings_bus.ahk"
#Include "%A_LineFile%\..\bridge\suppress_classic_gui.ahk"

; ---------------------------------------------------------------------------
; Logging (best effort; runtime state lives in Natro2027GUI\runtime, gitignored)
; ---------------------------------------------------------------------------
class Natro2027GUI {
    static logPath := ""
    static hwnd := 0
    static started := false
    static uiUrl := ""

    ; Intended window geometry (used at creation and re-asserted once after load).
    static winX := 60
    static winY := 60
    static winW := 1000
    static winH := 700

    /*
     Append one line. FileAppend opens/writes/closes each time, so the line is on
     disk immediately - important because a crashed or force-closed startup must
     still leave a readable trail. (A persistent FileOpen handle buffers and was
     silently losing the whole log on exit.)
    */
    static Log(text) {
        if (Natro2027GUI.logPath = "")
            Natro2027GUI.InitLog()
        try FileAppend(FormatTime(A_Now, "HH:mm:ss") "  " text "`r`n"
            , Natro2027GUI.logPath, "UTF-8")
    }

    /* Outer size of a window, for diagnostics in the startup log. */
    static WinSize(h) {
        r := Buffer(16, 0)
        DllCall("GetWindowRect", "Ptr", h, "Ptr", r)
        return (NumGet(r,8,"Int")-NumGet(r,0,"Int")) "x" (NumGet(r,12,"Int")-NumGet(r,4,"Int"))
    }

    /*
     Sciter shrinks a freshly-shown window down to its content height ONCE, a few
     hundred ms after the first document layout (observed only in the real macro -
     never in the standalone probes). Re-assert the intended geometry afterwards.
     Done only once, on a timer, so the user can still resize the window freely.
    */
    static FitWindow() {
        if !Natro2027GUI.hwnd
            return
        DllCall("SetWindowPos", "Ptr", Natro2027GUI.hwnd, "Ptr", 0
            , "Int", Natro2027GUI.winX, "Int", Natro2027GUI.winY
            , "Int", Natro2027GUI.winW, "Int", Natro2027GUI.winH
            , "UInt", 0x0004)   ; SWP_NOZORDER
    }

    static InitLog() {
        SplitPath A_LineFile, , &d
        DirCreate d "\runtime"
        Natro2027GUI.logPath := d "\runtime\startup.log"
        try FileAppend("`r`n==== " FormatTime(A_Now, "yyyy-MM-dd HH:mm:ss")
            . "  pid=" DllCall("GetCurrentProcessId")
            . "  ptrsize=" A_PtrSize " ====`r`n", Natro2027GUI.logPath, "UTF-8")
    }

    ; -------------------------------------------------------------------------
    ; Startup (runs on a timer, after auto-execute, in the 32-bit process)
    ; -------------------------------------------------------------------------
    static Start() {
        if (Natro2027GUI.started)
            return
        Natro2027GUI.started := true

        Natro2027GUI.InitLog()
        Natro2027GUI.Log "Natro2027GUI.Start: pid=" DllCall("GetCurrentProcessId")
            . " ptrsize=" A_PtrSize

        if (A_PtrSize != 4) {
            Natro2027GUI.Log "not 32-bit; deferring to upstream RunWith32"
            return
        }

        ; 1. Hide the classic MainGui (keep it alive for state mirroring).
        if SuppressClassicGui.Hide() {
            global MainGui
            SettingsBus.SetTarget(MainGui.Hwnd)
            Natro2027GUI.Log "classic MainGui hidden, bus target=0x"
                . Format("{:X}", MainGui.Hwnd)
        } else {
            Natro2027GUI.Log "MainGui not found yet - will retry"
        }
        ; Keep re-hiding in case upstream re-shows it.
        SetTimer _N2027_EnsureHidden, 1000

        ; 2. Load the engine and build the window.
        try {
            Sciter.Init()
            Natro2027GUI.Log "sciter.dll " Sciter.GetDllPath()
        } catch as e {
            Natro2027GUI.Log "FAIL: " e.Message
            MsgBox "Natro2027GUI could not load sciter.dll:`n" e.Message, "Natro2027GUI", 0x10
            return
        }

        SplitPath A_LineFile, , &d
        uiFile := d "\ui\index.html"
        if !FileExist(uiFile) {
            Natro2027GUI.Log "FAIL: ui not found: " uiFile
            return
        }
        Natro2027GUI.uiUrl := "file:///" StrReplace(uiFile, "\", "/")

        hwnd := Sciter.CreateWindow(
              Sciter.SW_TITLEBAR | Sciter.SW_RESIZEABLE | Sciter.SW_CONTROLS | Sciter.SW_MAIN
            , Natro2027GUI.winX, Natro2027GUI.winY, Natro2027GUI.winW, Natro2027GUI.winH)
        if !hwnd {
            Natro2027GUI.Log "FAIL: SciterCreateWindow returned 0"
            return
        }
        Natro2027GUI.hwnd := hwnd

        Sciter.SetCallback(hwnd, _N2027_HostNotify, 0)
        DllCall("ShowWindow", "Ptr", hwnd, "Int", 5)   ; SW_SHOW
        ok := Sciter.LoadFile(hwnd, uiFile)
        Natro2027GUI.Log "Sciter window 0x" Format("{:X}", hwnd)
            . " LoadFile=" ok " size=" Natro2027GUI.WinSize(hwnd)

        ; 3. Start the JS->AHK bridge poller.
        SetTimer _N2027_PollBridge, 200

        ; 4. Push the app version + a live sample value into the UI (AHK->JS).
        SetTimer _N2027_PushInit, -800

        ; 5. Re-assert the intended window size once the first layout has settled
        ;    (Sciter shrinks the window to content height shortly after load).
        SetTimer _N2027_FitWindow, -700
    }

    ; -------------------------------------------------------------------------
    ; Host notification callback (stdcall). Exit the app when the GUI is closed.
    ; -------------------------------------------------------------------------
    static HostNotify(pnm, cbParam) {
        code := Sciter.NotifyCode(pnm)
        switch code {
            case Sciter.SC_ENGINE_DESTROYED:
                ExitApp
            default:
                return Sciter.LOAD_OK
        }
        return Sciter.LOAD_OK
    }

    ; -------------------------------------------------------------------------
    ; AHK -> JS: call a JS global function (proven via Sciter.Eval).
    ; -------------------------------------------------------------------------
    static EvalJs(script) {
        if !Natro2027GUI.hwnd
            return
        rv := Sciter.Eval(Natro2027GUI.hwnd, script)
        Sciter.ValueClear(rv)
    }

    static PushInit() {
        ; Read one live setting to prove the read path (INI -> UI).
        v := IniRead("settings\nm_config.ini", "Settings", "CheckNight", 0)
        js := "window.__n2027Init && window.__n2027Init({version:'"
            . "1.1.2', checkNight:" v "});"
        Natro2027GUI.EvalJs(js)
    }

    ; -------------------------------------------------------------------------
    ; JS -> AHK: drain a pending-command queue the page maintains.
    ;   JS pushes {key, value, section} objects into window.__n2027Queue;
    ;   this timer reads and clears the queue, applying each via SettingsBus.
    ; -------------------------------------------------------------------------
    static PollBridge() {
        if !Natro2027GUI.hwnd
            return
        ; NOTE: the local holding the payload must NOT be called `json` - AHK
        ; identifiers are case-insensitive, so it would shadow the JSON class and
        ; JSON.parse below would throw ("String has no method named parse").
        ; (Plan section 6 gotcha; caught by startup.log on the first real run.)
        script := "JSON.stringify(window.__n2027Queue || [])"
        try {
            rv := Sciter.Eval(Natro2027GUI.hwnd, script)
            payload := Sciter.ValueString(rv)
            Sciter.ValueClear(rv)
        } catch
            return
        if (payload = "" || payload = "[]")
            return
        Natro2027GUI.EvalJs("window.__n2027Queue = [];")
        try {
            queue := JSON.parse(payload)  ; lib\JSON.ahk (already #Included upstream)
            for _, cmd in queue {
                key := cmd["key"], value := cmd["value"]
                section := cmd.Has("section") ? cmd["section"] : "Settings"
                if (key = "")
                    continue
                try SettingsBus.Set(key, value, section)
                catch as e
                    Natro2027GUI.Log "bridge apply failed for '" key "': " e.Message
            }
        } catch as e {
            Natro2027GUI.Log "bridge parse failed: " e.Message
        }
    }
}

; The host callback must be a plain function (not a bound method) for
; CallbackCreate, so forward to the class.
_N2027_HostNotify(pnm, cbParam) {
    return Natro2027GUI.HostNotify(pnm, cbParam)
}

; -----------------------------------------------------------------------------
; Timer targets.
;
; IMPORTANT (AHK 2.0.12): SetTimer will NOT accept a static-method reference
; such as Natro2027GUI.Start - it throws "Invalid callback function" - and it
; also rejects a plain name string ("Parameter #1 of SetTimer requires an
; Object, but received a String"). A bound method reference is accepted at
; registration but then fails at fire time with "Missing a required parameter:
; this". The reliable form is a plain global function object, so every timer
; below goes through one of these thin wrappers.
; Verified by tools\t_timer.ahk.
; -----------------------------------------------------------------------------
_N2027_Start()        => Natro2027GUI.Start()
_N2027_PollBridge()   => Natro2027GUI.PollBridge()
_N2027_PushInit()     => Natro2027GUI.PushInit()
_N2027_EnsureHidden() => SuppressClassicGui.EnsureHidden()
_N2027_FitWindow()    => Natro2027GUI.FitWindow()

; -----------------------------------------------------------------------------
; Top-level: fire startup as soon as the message loop begins (after the whole
; auto-execute section, so MainGui / SetWorkingDir / 32-bit are all settled).
; -----------------------------------------------------------------------------
SetTimer _N2027_Start, -10
