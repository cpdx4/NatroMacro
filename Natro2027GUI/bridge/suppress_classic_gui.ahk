/*
================================================================================
 Natro2027GUI - bridge\suppress_classic_gui.ahk
--------------------------------------------------------------------------------
 Hides the upstream classic MainGui while keeping it ALIVE so upstream's
 MainGui[...] control lookups and nm_UpdateGUIVar() state-mirroring keep working.

 Option A (wrap Gui.Prototype.__New / .Show) is IMPOSSIBLE here: in AHK 2.0.12
 those prototype members are read-only ("Property is read-only."), verified
 empirically by tools\proto_probe.ahk. So this is Option B from the plan:

   let upstream build and show MainGui normally, then hide it from a startup
   timer (SetTimer fires the instant the auto-execute section ends and the
   message loop begins).

 Downside vs Option A: the loading window may be visible for the ~1 s it takes
 to finish auto-execute. It is then hidden and stays hidden. Zero risk to the
 many sub-GUIs (AutoClickerGui, nm_WebhookGUI, ...) because we only touch MainGui.
================================================================================
*/

#Requires AutoHotkey v2.0

class SuppressClassicGui {
    static hidden := false

    /*
     Hide the upstream MainGui. Safe to call at any time; no-op until MainGui
     exists. Returns true once it has actually been hidden.
    */
    static Hide() {
        global MainGui
        try {
            if IsSet(MainGui) && IsObject(MainGui) && MainGui.Hwnd
                && DllCall("IsWindow", "Ptr", MainGui.Hwnd) {
                if DllCall("IsWindowVisible", "Ptr", MainGui.Hwnd)
                    DllCall("ShowWindow", "Ptr", MainGui.Hwnd, "Int", 0)  ; SW_HIDE
                SuppressClassicGui.hidden := true
                return true
            }
        }
        return false
    }

    /*
     Re-assert the hidden state. Used on a periodic timer so that if upstream
     re-shows the window (e.g. a hotkey) it is hidden again on the next tick.
    */
    static EnsureHidden() => SuppressClassicGui.Hide()
}
