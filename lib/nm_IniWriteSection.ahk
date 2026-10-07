/*
  nm_IniWriteSection()
  ---------------------------------------------------------------------------
  Batch update of a single INI section using ONE read + ONE write.

  AHK's IniWrite() re-reads and rewrites the entire file on every single call.
  Measured on a typical nm_config.ini (~11.7 KB) that is ~10 ms per call, so the
  ~50 sequential IniWrite() calls in ba_saveConfig_() cost ~500-600 ms. That
  pause was the visible lag when switching Planter nectar presets (and it slowed
  every other caller of ba_saveConfig_() too).

  This helper performs the same updates with a single read and a single write:

    * existing keys are rewritten in place and keep their original casing,
      position and surrounding whitespace;
    * keys missing from the section are appended to the end of the section
      (matching IniWrite semantics);
    * the file's original encoding (UTF-16 / UTF-8 with BOM / UTF-8 without BOM)
      and line endings (CRLF vs LF) are preserved.

  Parameters:
    path    - full path to the INI file
    section - section name without the surrounding brackets
    kv      - Map of Key -> Value for that section

  Returns true on success, false if the file could not be written.
*/

nm_IniWriteSection(path, section, kv) {
	if !FileExist(path)
		return false

	enc := nm_IniDetectEncoding(path)
	text := nm_IniReadFile(path, enc)
	nl := InStr(text, "`r`n") ? "`r`n" : "`n"
	lines := StrSplit(text, "`n", "`r")

	; --- locate the [section] header and the line range it spans ---
	header := "[" section "]"
	start := 0
	stop := lines.Length
	for i, ln in lines {
		t := Trim(ln)
		if (start = 0) {
			if (t != "" && StrCompare(t, header, "Locale") = 0)
				start := i
		} else if (t != "" && SubStr(t, 1, 1) = "[") {
			stop := i - 1
			break
		}
	}

	; --- section not present: create it at the end of the file ---
	if (start = 0) {
		out := text
		if (out != "" && SubStr(out, -StrLen(nl) + 1) != nl)
			out .= nl
		out .= header nl
		for k, v in kv
			out .= k "=" v nl
		return nm_IniWriteFile(path, out, enc)
	}

	; --- index existing keys in the section (case-insensitive) ---
	keyLine := Map()
	Loop stop - start {
		i := start + A_Index
		if (p := InStr(lines[i], "=")) {
			k := Trim(SubStr(lines[i], 1, p - 1))
			if (k != "")
				keyLine[StrLower(k)] := i
		}
	}

	; --- update existing keys in place, collect brand-new ones ---
	appendLines := []
	for k, v in kv {
		lk := StrLower(k)
		if keyLine.Has(lk) {
			i := keyLine[lk]
			p := InStr(lines[i], "=")
			origKey := Trim(SubStr(lines[i], 1, p - 1))
			lines[i] := origKey "=" v
		} else {
			appendLines.Push(k "=" v)
		}
	}

	; --- append new keys after the last content line of the section ---
	insertAt := stop
	while (insertAt > start && Trim(lines[insertAt]) = "")
		insertAt--

	out := ""
	for i, ln in lines {
		if (i = insertAt + 1) {
			for _, al in appendLines
				out .= al nl
		}
		out .= ln
		if (i < lines.Length)
			out .= nl
	}
	return nm_IniWriteFile(path, out, enc)
}

; Detect the file's BOM and return an AHK FileOpen encoding string. The encoding
; is preserved on write so callers never silently change a file's text format.
nm_IniDetectEncoding(path) {
	enc := "UTF-8-RAW"
	try {
		f := FileOpen(path, "r", "UTF-8-RAW")
		b1 := f.ReadUChar(), b2 := f.ReadUChar(), b3 := f.ReadUChar()
		f.Close()
		if (b1 = 0xFF && b2 = 0xFE)
			enc := "UTF-16"
		else if (b1 = 0xEF && b2 = 0xBB && b3 = 0xBF)
			enc := "UTF-8"
	} catch {
		enc := "UTF-8-RAW"
	}
	return enc
}

nm_IniReadFile(path, enc) {
	f := FileOpen(path, "r", enc)
	txt := f.Read()
	f.Close()
	return txt
}

nm_IniWriteFile(path, text, enc) {
	try {
		f := FileOpen(path, "w", enc)
		f.Write(text)
		f.Close()
	} catch {
		return false
	}
	return true
}
