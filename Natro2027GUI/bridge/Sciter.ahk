/*
================================================================================
 Natro2027GUI - bridge\Sciter.ahk
--------------------------------------------------------------------------------
 Thin AHK v2 wrapper over the published sciter.dll (Sciter.JS, x86 / 32-bit).

 Scope: exactly the slice of the ISciterAPI function table the GUI needs.
 Nothing outside Natro2027GUI\ is required at runtime except sciter.dll itself.

 Engine facts, verified locally by parsing the PE file:
   sciter.dll x86 = 6,372,352 bytes
   PE machine     = 0x014C (x86), optional header magic 0x010B (PE32)
   imports        = 19 DLLs, ALL Windows system DLLs
                     (ADVAPI32 COMCTL32 COMDLG32 GDI32 gdiplus IMM32 KERNEL32
                      ole32 OLEACC OLEAUT32 SHELL32 SHLWAPI USER32 USERENV USP10
                      WININET WINMM WINSPOOL.DRV WS2_32)
   no MSVC/CRT runtime import, no delay-load imports.
   SHA-256 08EA16FB3F0889A42A7D6654E8BB1332F248C115A82195BFA5E27EED7EC26687
 => genuine single-DLL drop-in; the process stays in-process with no child
    process and no mandatory profile directory.

 Function-table offsets are derived from the official header
 sciter-sdk/include/sciter-x-api.h (struct _ISciterAPI). On x86 the struct is
 4-byte aligned with `UINT version` first:

     version            @ 0    (UINT, current value = 9)
     SciterClassName    @ 4    (pointer index 0)
     ...
     SciterCreateWindow @ 128  (pointer index 31)
     offset(k)          = 4 + k * 4

 Sciter.Init() refuses to run unless the DLL reports API version 9, so a future
 engine whose table grew or moved cannot silently corrupt these calls.
 tools\probe_sciter2.ahk re-asserts 7 offsets, resolves the class name and
 evaluates 1+1 in QuickJS.

 Callbacks: the header declares every Sciter callback as SC_CALLBACK, which is
 __stdcall on Windows. CallbackCreate's DEFAULT convention is already __stdcall,
 and it returns a plain integer machine-code address. The "Fast" option only
 toggles threading mode (fast vs. slow), not the calling convention; it is left
 OFF here because Sciter fires callbacks from message handling where the calling
 thread can vary.

 DllCall: with a dynamic function pointer (an integer address) AHK cannot look
 up the return type, and the return type goes at the END of the argument list
 (a trailing type with no matching value). Placing it at the front makes AHK
 mis-parse the pairs -> "Parameter list too large, or call requires CDecl" or
 "Invalid return type". Every call below is written return-type-LAST.
================================================================================
*/

#Requires AutoHotkey v2.0

; No #Include here on purpose. This file is always compiled from a parent that
; already pulled in the upstream lib\ directory (Natro2027GUI.ahk is #Included by
; natro_macro.ahk, whose own #Include "%A_ScriptDir%\..\lib" comes first), so the
; JSON class is available. AHK resolves "%A_LineFile%\..\.." literally as
; "<file path>\..\.." which cannot work, and lib\JSON.ahk has no relative
; includes of its own, so re-including it from here would only duplicate it.

class Sciter {

    static API_VERSION_EXPECTED := 9

    ; Offsets inside ISciterAPI (x86). Derived by walking the WINDOWS branch of
    ; struct _ISciterAPI in sciter-x-api.h member by member (UINT version @ 0,
    ; then one 4-byte pointer per member). offset(k) = 4 + k*4:
    ;   1 ClassName, 2 Version, 3 DataReady, 4 DataReadyAsync, 5 Proc,
    ;   6 ProcND, 7 LoadFile, 8 LoadHtml, 9 SetCallback, 10 SetMasterCSS,
    ;   11 AppendMasterCSS, 12 SetCSS, 13 SetMediaType, 14 SetMediaVars,
    ;   15 GetMinWidth, 16 GetMinHeight, 17 Call, 18 Eval, 19 UpdateWindow,
    ;   20 TranslateMessage, 21 SetOption, 22 GetPPI, 23 GetViewExpando,
    ;   24 RenderD2D, 25 D2DFactory, 26 DWFactory, 27 GraphicsCaps,
    ;   28 SetHomeURL, 29 CreateNSView(NULL), 30 CreateWidget(NULL),
    ;   31 CreateWindow, 32 SetupDebugOutput.
    static API_OFFSETS := Map(
        "ClassName",        4,     ; 1
        "Version",          8,     ; 2
        "DataReady",       12,     ; 3
        "DataReadyAsync",  16,     ; 4
        "Proc",            20,     ; 5
        "ProcND",          24,     ; 6
        "LoadFile",        28,     ; 7
        "LoadHtml",        32,     ; 8
        "SetCallback",     36,     ; 9
        "SetMasterCSS",    40,     ; 10
        "AppendMasterCSS", 44,     ; 11
        "SetCSS",          48,     ; 12
        "SetMediaType",    52,     ; 13
        "SetMediaVars",    56,     ; 14
        "GetMinWidth",     60,     ; 15
        "GetMinHeight",    64,     ; 16
        "Call",            68,     ; 17
        "Eval",            72,     ; 18
        "UpdateWindow",    76,     ; 19
        "TranslateMessage",80,     ; 20
        "SetOption",       84,     ; 21
        "GetPPI",          88,     ; 22
        "GetViewExpando",  92,     ; 23
        "RenderD2D",       96,     ; 24
        "D2DFactory",     100,     ; 25
        "DWFactory",      104,     ; 26
        "GraphicsCaps",   108,     ; 27
        "SetHomeURL",     112,     ; 28
        "CreateNSView",   116,     ; 29 - NULL slot on Windows
        "CreateWidget",   120,     ; 30 - NULL slot on Windows
        "CreateWindow",   124,     ; 31
        "SetupDebugOutput",128,    ; 32
        ; --- Value API (after the 78-member DOM Element API and the 18-member
        ;     DOM Node API). Member numbers follow `offset = member * 4`. ---
        "ValueClear",     520,     ; 130
        "ValueType",      536,     ; 134
        "ValueStringData",540,     ; 135
        "ValueIntData",   548      ; 137
    )

    ; SCITER_CREATE_WINDOW_FLAGS (sciter-x-def.h)
    static SW_CHILD        := 0x0001
    static SW_TITLEBAR     := 0x0002
    static SW_RESIZEABLE   := 0x0004
    static SW_TOOL         := 0x0008
    static SW_CONTROLS     := 0x0010
    static SW_GLASSY       := 0x0020
    static SW_ALPHA        := 0x0040
    static SW_MAIN         := 0x0080
    static SW_POPUP        := 0x0100
    static SW_ENABLE_DEBUG := 0x0200
    static SW_OWNS_VM      := 0x0400

    ; Host-callback notification codes (sciter-x-def.h)
    static SC_LOAD_DATA           := 0x01
    static SC_DATA_LOADED         := 0x02
    static SC_ATTACH_BEHAVIOR     := 0x04
    static SC_ENGINE_DESTROYED    := 0x05
    static SC_POSTED_NOTIFICATION := 0x06

    ; SC_LOAD_DATA return codes
    static LOAD_OK      := 0
    static LOAD_DISCARD := 1
    static LOAD_DELAYED := 2
    static LOAD_MYSELF  := 3

    ; SCITER_RT_OPTIONS
    static SCITER_SET_SCRIPT_RUNTIME_FEATURES := 8
    static SCITER_SET_DEBUG_MODE              := 10
    static SCITER_SET_UX_THEMING              := 11
    static SCITER_SET_INIT_SCRIPT             := 13
    static SCITER_SET_MAIN_WINDOW             := 14

    ; SCRIPT_RUNTIME_FEATURES
    static ALLOW_FILE_IO   := 0x0001
    static ALLOW_SOCKET_IO := 0x0002
    static ALLOW_EVAL      := 0x0004
    static ALLOW_SYSINFO   := 0x0008

    ; VALUE_TYPE
    static VT_UNDEFINED := 0
    static VT_NULL      := 1
    static VT_BOOL      := 2
    static VT_INT       := 3
    static VT_FLOAT     := 4
    static VT_STRING    := 5

    static _lib := 0
    static _api := 0
    static _dllPath := ""
    static callbacks := []     ; keeps CallbackCreate handles alive

    ; =========================================================================
    ; Init
    ; =========================================================================

    /*
     Load sciter.dll and resolve the ISciterAPI function table.
     dllPath defaults to <this file's folder>\..\engine\sciter.dll.
     Returns the ISciterAPI pointer. Throws with an explicit reason on failure.
    */
    static Init(dllPath := "") {
        if (Sciter._api)
            return Sciter._api

        if (dllPath = "") {
            ; SplitPath needs its 2nd output parameter; with only one output
            ; variable the 1st keeps the full path including the file name.
            SplitPath A_LineFile, , &here
            dllPath := here "\..\engine\sciter.dll"
        }
        if !FileExist(dllPath)
            throw Error("sciter.dll not found: " dllPath)

        hLib := DllCall("LoadLibraryW", "Str", dllPath, "Ptr")
        if !hLib
            throw Error("LoadLibraryW failed (error " A_LastError ") for " dllPath)

        pSciterApi := DllCall("GetProcAddress", "Ptr", hLib, "AStr", "SciterAPI", "Ptr")
        if !pSciterApi {
            DllCall("FreeLibrary", "Ptr", hLib)
            throw Error("sciter.dll exports no SciterAPI - wrong or corrupt DLL")
        }

        api := DllCall(pSciterApi, "Ptr")
        if !api {
            DllCall("FreeLibrary", "Ptr", hLib)
            throw Error("SciterAPI() returned NULL - engine failed to initialise")
        }

        version := NumGet(api, 0, "UInt")
        if (version != Sciter.API_VERSION_EXPECTED) {
            DllCall("FreeLibrary", "Ptr", hLib)
            throw Error("sciter.dll reports API version " version
                . " but this wrapper is compiled for "
                . Sciter.API_VERSION_EXPECTED
                . " - refusing to call a possibly moved function table")
        }

        Sciter._lib := hLib
        Sciter._api := api
        Sciter._dllPath := dllPath
        return api
    }

    static Shutdown() {
        if (Sciter._lib) {
            DllCall("FreeLibrary", "Ptr", Sciter._lib)
            Sciter._lib := 0
            Sciter._api := 0
        }
    }

    static GetDllPath() {
        Sciter.Init()
        return Sciter._dllPath
    }

    /* Engine API version read from the function table header. */
    static EngineApiVersion() {
        Sciter.Init()
        return NumGet(Sciter._api, 0, "UInt")
    }

    /* Address of a function-table entry, by friendly name. */
    static Fn(name) {
        if !Sciter._api
            Sciter.Init()
        if !Sciter.API_OFFSETS.Has(name)
            throw Error("Sciter.Fn: unknown API entry '" name "'")
        return NumGet(Sciter._api, Sciter.API_OFFSETS[name], "Ptr")
    }

    /* Raw offset, for the probe's assertions. */
    static Offset(name) => Sciter.API_OFFSETS[name]

    ; =========================================================================
    ; Window / document
    ; =========================================================================

    /*
     Create a Sciter window. For SW_CHILD, x/y are parent-client coordinates.
     Returns the HWINDOW, or 0 on failure.
    */
    static CreateWindow(flags, x, y, w, h, parent := 0, delegate := 0, delegateParam := 0) {
        rect := Buffer(16, 0)
        NumPut("Int", x, "Int", y, "Int", x + w, "Int", y + h, rect)
        return DllCall(Sciter.Fn("CreateWindow")
            , "UInt", flags, "Ptr", rect, "Ptr", delegate, "Ptr", delegateParam
            , "Ptr", parent, "Ptr")
    }

    static LoadFile(hwnd, path) {
        if !FileExist(path)
            throw Error("Sciter.LoadFile: file not found: " path)
        return DllCall(Sciter.Fn("LoadFile"), "Ptr", hwnd, "Str", path, "Int")
    }

    /*
     Load HTML held in memory. `html` is an AHK string (UTF-16LE); Sciter sniffs
     the encoding, so a UTF-8 BOM is prepended. baseUrl resolves relative <script>
     and <link> references, e.g. "file:///C:/path/to/ui/".
    */
    static LoadHtml(hwnd, html, baseUrl := "") {
        buf := Buffer(3 + StrPut(html, "UTF-8"), 0)
        NumPut("UChar", 0xEF, "UChar", 0xBB, "UChar", 0xBF, buf)
        StrPut(html, buf.Ptr + 3, "UTF-8")
        return DllCall(Sciter.Fn("LoadHtml")
            , "Ptr", hwnd, "Ptr", buf, "UInt", buf.Size
            , "Ptr", baseUrl = "" ? 0 : StrPtr(baseUrl), "Int")
    }

    /*
     Evaluate a script string in the view.
     Returns a Buffer holding the SCITER_VALUE result; pass it to ValueClear when
     done, otherwise the engine-side value leaks.
    */
    static Eval(hwnd, script) {
        retval := Buffer(32, 0)
        ok := DllCall(Sciter.Fn("Eval")
            , "Ptr", hwnd, "Str", script, "UInt", StrLen(script), "Ptr", retval, "Int")
        if !ok
            throw Error("Sciter.Eval failed for script: " SubStr(script, 1, 120))
        return retval
    }

    /* Call a JS global function: SciterCall(hwnd, name, argc, argv, retval). */
    static Call(hwnd, fnName, argv := 0, argc := 0) {
        retval := Buffer(32, 0)
        ok := DllCall(Sciter.Fn("Call")
            , "Ptr", hwnd, "AStr", fnName, "UInt", argc, "Ptr", argv, "Ptr", retval, "Int")
        if !ok
            throw Error("Sciter.Call failed for function: " fnName)
        return retval
    }

    static UpdateWindow(hwnd) => DllCall(Sciter.Fn("UpdateWindow"), "Ptr", hwnd)

    static SetOption(hwnd, option, value) {
        return DllCall(Sciter.Fn("SetOption")
            , "Ptr", hwnd, "UInt", option, "UPtr", value, "Int")
    }

    /*
     Register the host-notification callback.
     cbFn takes (notificationPtr, callbackParam) and returns an Integer.
     CallbackCreate's default convention is __stdcall (SC_CALLBACK). No "Fast"
     option: the callback fires from Sciter's message handling, so the thread can
     vary and slow mode (a fresh thread per call) is the safe choice.
    */
    static SetCallback(hwnd, cbFn, cbParam := 0) {
        cb := CallbackCreate(cbFn, , 2)
        Sciter.callbacks.Push(cb)      ; keep alive for the process lifetime
        DllCall(Sciter.Fn("SetCallback"), "Ptr", hwnd, "Ptr", cb, "Ptr", cbParam)
        return cb
    }

    /* Notification accessors - valid inside a host callback. */
    static NotifyCode(pnm) => NumGet(pnm, 0, "UInt")
    static NotifyHwnd(pnm) => NumGet(pnm, A_PtrSize, "Ptr")

    /* SCN_LOAD_DATA member 3 (after code, hwnd) is the uri. */
    static LoadDataUri(pnm) => StrGet(NumGet(pnm, A_PtrSize * 2, "Ptr"), "UTF-16")

    ; =========================================================================
    ; SCITER_VALUE accessors
    ; =========================================================================

    static ValueType(pv) {
        t := Buffer(4, 0)
        DllCall(Sciter.Fn("ValueType"), "Ptr", pv, "Ptr", t, "Ptr", 0, "UInt")
        return NumGet(t, 0, "UInt")
    }

    static ValueInt(pv) {
        out := Buffer(4, 0)
        DllCall(Sciter.Fn("ValueIntData"), "Ptr", pv, "Ptr", out, "UInt")
        return NumGet(out, 0, "Int")
    }

    static ValueString(pv) {
        pChars := Buffer(A_PtrSize, 0), nChars := Buffer(4, 0)
        DllCall(Sciter.Fn("ValueStringData"), "Ptr", pv, "Ptr", pChars, "Ptr", nChars, "UInt")
        ptr := NumGet(pChars, 0, "Ptr")
        len := NumGet(nChars, 0, "UInt")
        return ptr ? StrGet(ptr, len, "UTF-16") : ""
    }

    static ValueClear(pv) => DllCall(Sciter.Fn("ValueClear"), "Ptr", pv, "UInt")
}
