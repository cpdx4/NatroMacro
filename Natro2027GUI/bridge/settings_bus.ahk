/*
================================================================================
 Natro2027GUI - bridge\settings_bus.ahk
--------------------------------------------------------------------------------
 The 0x5552 (int) / 0x5553 (str) settings bus. This is the ONLY way the new GUI
 mutates upstream state, and it uses the exact protocol upstream's own
 sub-macros already use, so no upstream code changes are needed.

 Protocol (verified against submacros\*.ahk):
   * Integer setting:
       IniWrite value, settings\nm_config.ini, <section>, <key>   (bridge MUST do
       this - nm_setGlobalInt does NOT write the INI)
       PostMessage 0x5552, <EnumInt index>, <value>
   * String setting:
       IniWrite value, settings\nm_config.ini, <section>, <key>   (write FIRST)
       PostMessage 0x5553, <EnumStr index>, <section index>

 Section indices are 1-based: Boost=1 Collect=2 Gather=3 Planters=4 Quests=5
 Settings=6 Status=7 Blender=8 Shrine=9.

 Indices come from the GENERATED enum_map.ahk (never hand-maintained). A missing
 name throws loudly - a silent miss would produce a control that does nothing,
 the worst bug class for this project.
================================================================================
*/

#Requires AutoHotkey v2.0
#Include "enum_map.ahk"

class SettingsBus {

    static targetHwnd := 0

    ; -------------------------------------------------------------------------
    ; Index lookups (loud on miss)
    ; -------------------------------------------------------------------------

    static StrIndex(name) {
        for i, n in EnumMap.Str
            if (n = name)
                return i
        throw Error("SettingsBus: string setting '" name
            . "' not found in EnumStr.ahk map - regenerate tools\gen_enum_map.ahk")
    }

    static IntIndex(name) {
        for i, n in EnumMap.Int
            if (n = name)
                return i
        throw Error("SettingsBus: integer setting '" name
            . "' not found in EnumInt.ahk map - regenerate tools\gen_enum_map.ahk")
    }

    static SectionIndex(section) {
        for i, s in EnumMap.Sections
            if (s = section)
                return i
        throw Error("SettingsBus: section '" section "' is not one of the 9 known sections")
    }

    /* HWND the messages are posted to. MainGui.Hwnd once available, else the
       script's own message window. Both belong to this script, so OnMessage
       (0x5552/0x5553) fires either way. */
    static Target() {
        if (SettingsBus.targetHwnd)
            return SettingsBus.targetHwnd
        return A_ScriptHwnd
    }

    /* Set once the upstream MainGui exists (from the entry point timer). */
    static SetTarget(hwnd) {
        SettingsBus.targetHwnd := hwnd
    }

    ; -------------------------------------------------------------------------
    ; Setters
    ; -------------------------------------------------------------------------

    /* Path of the upstream config INI, relative to A_WorkingDir (repo root).
       Overridable so the harness can point at a temp file. */
    static iniPath := "settings\nm_config.ini"

    /* IniWrite needs its parent directory to already exist; ensure it does. */
    static EnsureIniDir() {
        SplitPath SettingsBus.iniPath, , &d
        if (d != "")
            DirCreate d
    }

    /* Integer setting (counts, times, flags). */
    static SetInt(key, value, section) {
        idx := SettingsBus.IntIndex(key)
        SettingsBus.EnsureIniDir()
        IniWrite value, SettingsBus.iniPath, section, key
        PostMessage 0x5552, idx, value, , SettingsBus.Target()
    }

    /* String setting (fields, patterns, items, names). Write INI BEFORE posting,
       because nm_setGlobalStr re-reads the value FROM the INI. */
    static SetStr(key, value, section) {
        idx := SettingsBus.StrIndex(key)
        secIdx := SettingsBus.SectionIndex(section)
        SettingsBus.EnsureIniDir()
        IniWrite value, SettingsBus.iniPath, section, key
        PostMessage 0x5553, idx, secIdx, , SettingsBus.Target()
    }

    /* Convenience: value already read from a control; pick SetInt vs SetStr by
       whether the key is known as an int. Used by the generic JS bridge. */
    static Set(key, value, section) {
        ; Try int first (most settings); fall back to string.
        if SettingsBus.KnownInt(key)
            SettingsBus.SetInt(key, value, section)
        else
            SettingsBus.SetStr(key, value, section)
    }

    static KnownInt(key) {
        for _, n in EnumMap.Int
            if (n = key)
                return true
        return false
    }
}
