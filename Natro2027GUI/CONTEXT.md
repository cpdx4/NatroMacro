# CONTEXT.md — Natro2027GUI

Persistent project memory. **Read this first** before touching anything here.

Last updated: 2026-10-03 · Upstream base: NatroMacro **v1.1.2** (`094f9c7`)

---

## 1. What this is

A modern GUI for NatroMacro, rendered **in-process by Sciter.JS**, bolted onto the
vanilla upstream clone as **one folder plus a single `#Include` line**.

It works: launching `submacros\natro_macro.ahk` opens the Sciter window at
1000x700, hides the classic AHK GUI, and drives upstream settings through the
`0x5552`/`0x5553` window-message bus — no upstream behaviour is modified.

### The entire upstream diff (keep it that way)

```diff
 submacros/natro_macro.ahk   | 1 line
+#Include "%A_ScriptDir%\..\Natro2027GUI\Natro2027GUI.ahk"

 .gitignore                  | 1 line
+/Natro2027GUI/runtime/

 + Natro2027GUI/             | everything else
```

`AutoHotkey64.exe /ErrorStdOut /validate submacros\natro_macro.ahk` must exit 0.
The file's **UTF-8 BOM is load-bearing** (upstream commit `1caebba`) — the `edit`
tool strips it, so re-apply that one line with a byte-preserving method and
re-check `git diff` afterwards.

---

## 2. Layout

```
Natro2027GUI\
├─ Natro2027GUI.ahk            entry point named by the #Include line
├─ CONTEXT.md                  this file
├─ engine\sciter.dll           x86, 6.08 MiB (committed)
├─ bridge\
│  ├─ Sciter.ahk               AHK v2 wrapper over sciter.dll (DllCall)
│  ├─ enum_map.ahk             GENERATED - never edit by hand
│  ├─ settings_bus.ahk         0x5552 / 0x5553 protocol
│  └─ suppress_classic_gui.ahk hides the classic MainGui (Option B)
├─ ui\
│  ├─ index.html · css\styles.css · js\app.js
└─ tools\
   ├─ gen_enum_map.mjs         regenerates bridge\enum_map.ahk
   └─ selftest.ahk             the whole regression suite (24 checks)
```

Runtime state goes in `Natro2027GUI\runtime\` (gitignored): `startup.log`,
`selftest.log`, screenshots.

---

## 3. How it works

```
UI control change
  → js\app.js pushes {key,value,section} onto window.__n2027Queue
  → entry point's 200 ms poller (Sciter.Eval) drains the queue
  → SettingsBus: IniWrite settings\nm_config.ini, then PostMessage
       0x5552 (int)  wParam = EnumInt index, lParam = the value
       0x5553 (str)  wParam = EnumStr index, lParam = section index (1..9)
  → upstream's nm_setGlobalInt / nm_setGlobalStr sets the global

AHK → UI
  → Sciter.Eval("window.__n2027Init({...})") pushes values into the page
```

- **Strings:** write the INI **first** — `nm_setGlobalStr` re-reads the value
  *from the INI*, not from the message.
- **Integers:** `nm_setGlobalInt` does **not** touch the INI — the bridge writes it
  and posts the message.
- Sections are 1-based: Boost=1 Collect=2 Gather=3 Planters=4 Quests=5
  Settings=6 Status=7 Blender=8 Shrine=9.
- In-process, posting to `A_ScriptHwnd` is enough — `OnMessage` catches it.

---

## 4. Engine facts (measured, not estimated)

`engine\sciter.dll` from [c-smile/sciter-js-sdk](https://github.com/c-smile/sciter-js-sdk):

- 6,372,352 bytes · PE `0x014C` (x86) / PE32 · SHA-256
  `08EA16FB3F0889A42A7D6654E8BB1332F248C115A82195BFA5E27EED7EC26687`
- **19 imports, all Windows system DLLs** (no MSVC/CRT, no delay-load) → genuine
  single-DLL drop-in, no child process, no profile directory.
- API version `9`, window class `H-SMILE-CHILD` / `H-SMILE-FRAME`, QuickJS.
- QuickJS **does** support `?.`, `??`, bigint, template literals, `fetch`.

**`ISciterAPI` offsets** (x86, `offset = 4 + member*4`, from
`sciter-sdk/include/sciter-x-api.h`): `LoadFile=28`, `LoadHtml=32`,
`SetCallback=36`, `Call=68`, `Eval=72`, `SetOption=84`, **`CreateWindow=124**`,
`SetupDebugOutput=128`, `ValueClear=520`, `ValueType=536`,
`ValueStringData=540`, `ValueIntData=548`. `Sciter.Init()` refuses to run unless
the DLL reports API version 9.

**Why Sciter, not WebView2:** the 7z is extracted by a process that can stamp the
tree **Low Mandatory Integrity Level**, and Low-IL blocks writes to
`%APPDATA%`/`%LOCALAPPDATA%`. WebView2 structurally needs a separate
`msedgewebview2.exe` + a profile dir; Sciter needs neither. Confirmed locally:
the tree is Low-IL and `%LOCALAPPDATA%` writes are refused for the bundled exe.

Licence: free tier = ship the published `sciter.dll` as-is.

---

## 5. Build & verify

```cmd
:: syntax-check the whole macro (must exit 0, no execution)
submacros\AutoHotkey64.exe /ErrorStdOut /validate submacros\natro_macro.ahk

:: regenerate the positional enum map (after ANY upstream version bump)
node Natro2027GUI\tools\gen_enum_map.mjs

:: the full regression suite - 24 checks, must print "RESULT: PASS"
submacros\AutoHotkey32.exe Natro2027GUI\tools\selftest.ahk

:: run the real thing
submacros\AutoHotkey32.exe submacros\natro_macro.ahk
```

`selftest.ahk` covers: enum-map positional correctness (incl. the empty
placeholders), loud failure on unknown names, the live `0x5552`/`0x5553`
round-trip, classic-GUI suppression + sub-GUI isolation, the entry point booting
and sizing its window, and the JS→AHK queue reaching the INI.
It redirects `SettingsBus.iniPath` to a scratch file, so it never touches the
real config.

---

## 6. Status

**Done and verified**

- 1-line hook; GUI opens in the real macro at 1000x700, classic GUI hidden.
- Enum map generated and positionally exact; unknown names throw loudly.
- Settings bus both directions (UI→AHK verified end to end; AHK→UI pushes
  version + a live value).
- `selftest.ahk` green (24/24).

**Not done yet**

- **Only a demo UI.** `ui\index.html` has one probe card and one working control.
  The nine real tabs are unported.
- **JS→AHK is an MVP poller** (`Sciter.Eval` + a queue). The intended upgrade is a
  native functor (`SciterSetVariable` + `ValueNativeFunctorSet`) for lower latency
  and no polling.
- **No INI watcher** for upstream→GUI live state (plan §4.3), and therefore no
  write-loop guard yet. The classic GUI is intentionally kept **alive but hidden**
  so upstream's `MainGui[...]` lookups and `nm_UpdateGUIVar()` mirroring keep
  working — read runtime values from it with `MainGui["statuslog"].Text` etc.
- Sciter CSS-subset coverage per control (tab strip, switches, selects, sliders,
  scrollable log pane) is unverified.

---

## 7. Gotchas — every one of these has already cost time

**AutoHotkey 2.0.12**

1. **`SetTimer` rejects a static-method reference** — `SetTimer Natro2027GUI.Start, -10`
   throws `Invalid callback function`; a bound ref registers but fails at fire
   time (`Missing a required parameter: this`); a name string is rejected
   (`requires an Object`). **This silently killed the entire hook once.** All
   timers go through plain global wrappers (`_N2027_Start`, `_N2027_PollBridge`,
   `_N2027_PushInit`, `_N2027_EnsureHidden`, `_N2027_FitWindow`).
2. **Never name a local `json`** (or anything shadowing a built-in). Identifiers
   are case-insensitive, so `json` shadows the `JSON` class and `JSON.parse`
   throws *"String has no method named parse"*. The poller uses `payload`.
3. **`??` does not exist in AHK 2.0.12** (it does in QuickJS — different language,
   don't conflate). Use `cmd.Has("k") ? cmd["k"] : default`.
4. **`#Warn` is positional and warnings are MODAL DIALOGS.** This folder is
   `#Include`d at `natro_macro.ahk:34`, one line *before* upstream's
   `#Warn VarUnset, Off` at line 35. Standalone, that shows a dialog that looks
   exactly like a hang. The entry point sets `#Warn VarUnset, Off` itself and
   `#Include`s `lib\JSON.ahk` (AHK skips an already-included file), so the folder
   is self-sufficient.
5. **`A_LineFile` is a *file* path.** `%A_LineFile%\..\..\x` works (the OS resolves
   `..` textually), but `SplitPath A_LineFile,, &dir` yields the **directory**, so
   the depth is one less. This caused three separate path bugs — always derive
   directories with `SplitPath ... , , &dir` and count from there.
6. **`FileDelete` on a missing file throws/hangs.** Don't pre-delete a scratch
   file; let `IniWrite`/`FileAppend` create or overwrite it.
7. **`Gui.Prototype.__New` / `.Show` / `.Opt` are read-only** — Option A (wrapping
   the prototype to suppress the classic GUI) is impossible. Option B (hide from a
   startup timer) is what shipped; the classic window may flash for ~1 s during
   load.
8. **Logging must flush.** A persistent `FileOpen` handle buffers and silently
   lost a whole startup log on exit; `FileAppend` per line is what made the
   `SetTimer` failure visible at all.
9. **`GuiX`/`GuiY` are empty until the user moves the window once**, so upstream's
   `MainGui.Show("x" GuiX " y" GuiY ...)` would throw on a fresh install — a
   reason never to route suppression through `Show`.
10. **DllCall:** with a dynamic function pointer the **return type goes at the END**
    of the argument list. Putting it first yields
    `Parameter list too large, or call requires CDecl` / `Invalid return type`.
    Sciter callbacks are `__stdcall`, which is `CallbackCreate`'s **default** —
    pass no option (`"Fast"` is a *threading* option, not a calling convention).

**Sciter**

11. **Sciter shrinks a freshly-shown window to content height once**, a few hundred
    ms after first layout — the window is fine at 1000x700 and then silently
    becomes 1000x39 (title bar only). It **never reproduced in any standalone
    probe**, only inside the real macro. `Natro2027GUI.FitWindow()` re-asserts the
    geometry once at +700 ms; after that it holds, so the user can still resize.
12. **Loading is asynchronous.** `Eval` immediately after `LoadHtml` used to block;
    the poller runs on a timer so the message loop stays free.

**Upstream / project**

13. **Enum counts are 81 / 368** (not the plan's "~80 / ~368"), and `EnumInt.ahk`
    has **two empty placeholder entries** (`""` at 1-based indices **62 and 224**).
    They must be preserved in the generated map or every later index shifts —
    the worst possible bug class here (a control that silently does nothing).
14. The macro is `#SingleInstance Force` and closes other AutoHotkey scripts on
    startup, so kill leftovers before launching.

---

## 8. Suggested next steps

1. Build the real tab UI against `window.__n2027Queue` / `window.__n2027Init`,
   replacing the demo `ui\`.
2. Replace the polling bridge with `SciterSetVariable` + `ValueNativeFunctorSet`.
3. Add the INI watcher (with an explicit write-loop guard) and read runtime/status
   values off the hidden classic `MainGui`.
4. Port one tab end to end first and measure; then the rest.
5. Re-run `gen_enum_map.mjs` and `selftest.ahk` after every upstream bump.
