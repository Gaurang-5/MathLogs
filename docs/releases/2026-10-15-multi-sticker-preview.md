# Multiple stickers in one photo — preview

Production v435 / commit 19c10a8 contains the verified single-sticker scanner. This follow-up adds an opt-in Multiple stickers (up to 10) mode to the same Scan Marks screen. It does not change sticker printing, PDF dimensions, or placement.

Capture once or use the phone camera. Every QR and writing box must be visible. The original JPEG/PNG/WebP is sent once, without cropping or re-encoding; local QR decoding independently examines image copies. Gemini reports handwritten scores and QR-center coordinates; only locally decoded QR IDs identify students. Conservative spatial matching leaves uncertain associations blank. Separate copies of a student's QR are blocked, and more than ten decoded stickers require a smaller photo.

The review screen numbers the QRs on the original photo. Each score must be confirmed before saving. Existing marks require overwrite consent, and writes carry the reviewed previous score. Successful rows remain saved when another row fails, so retry sends only unsaved confirmed rows. No scores are saved automatically. Keep the page open until saving finishes; this mode does not persist unsaved photos across a reload.

Validation:
- 161 client tests; 18 focused server tests, including authenticated multipart route and teacher-owned test checks.
- Client typecheck/build and server build.
- Ten-sticker generated fixture: actual Gemini response correctly read all ten scores, including zero/decimals, in approximately 2.2 seconds; rotated 90-degree fixture approximately 3.2 seconds.
- Built-app Chrome phone/tablet/desktop checks matched actual provider readings to all ten real decoded QRs, preserved upload bytes, required confirmations and saved each expected student/score pair. API writes were mocked.
- Built-app WebKit phone check matched ten QR/score pairs; duplicate QR and eleven-sticker rejection tested in Chrome.
- Existing single-sticker browser regression passed.

These generated fixtures are not an accuracy benchmark for handheld classroom photos. Test printed stickers on an iPhone in ordinary lighting before promoting this preview. Small/blurred/occluded QRs may be omitted; the screen warns teachers to compare the decoded count with their photo and retake missing stickers.
