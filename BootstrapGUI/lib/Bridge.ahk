;///////////////////////////////////////////////////////////////////////////////////////////
; Bridge protocol (Modern UI <-> AHK)
;///////////////////////////////////////////////////////////////////////////////////////////
; This is the AutoHotkey half of the contract documented in BootstrapGUI/README.md.
; The version MUST match PROTOCOL_VERSION in BootstrapGUI/assets/js/2/bridge.js.
;
; The check is deliberately tolerant: a missing `v` (older page) is accepted, and a
; newer `v` is logged once and then accepted so a newer page can still talk to an
; older script during a rollout.

nm_BridgeProtocolVersion() {
	return 1
}

; Returns true when <data> is compatible with this script. Logs (once per version)
; when the sender speaks a newer protocol than we understand.
nm_BridgeCheckVersion(data) {
	global nm_BridgeVersionsSeen
	if !data.Has("v")
		return true
	v := data["v"]
	if (v <= nm_BridgeProtocolVersion())
		return true
	if !IsSet(nm_BridgeVersionsSeen)
		nm_BridgeVersionsSeen := Map()
	if !nm_BridgeVersionsSeen.Has(v) {
		nm_BridgeVersionsSeen[v] := 1
		OutputDebug "[ahk] bridge protocol v" v " is newer than supported (v" nm_BridgeProtocolVersion() ")"
	}
	return true
}
