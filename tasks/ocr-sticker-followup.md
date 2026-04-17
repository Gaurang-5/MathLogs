## OCR Sticker Follow-up

Current scanner improvements are tuned to work with the already-printed sticker stock.

After the immediate test cycle, update the sticker design to improve OCR reliability:

- replace the current custom corner glyphs with stronger fiducials or marker-based anchors
- enlarge the marks boxes and increase spacing between them
- move printed text farther away from the digit row
- remove the vertical `OCR` text near the last box
- keep the digit writing area as clean as possible, with lighter borders and no competing marks

Recommended scanner follow-up after sticker redesign:

- switch from heuristic crop selection to marker-driven perspective alignment
- keep per-box extraction and per-box OCR as the default pipeline
- add confidence-based rescan/manual-confirm fallback for low-quality captures
