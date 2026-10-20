# Sticker OCR research dataset

This collector is for consented, real-world evaluation of the MathLogs sticker workflow. It is disabled unless `STICKER_RESEARCH_COLLECTION_ENABLED=true`.

## What one scan records

### Original capture

- the original JPEG, PNG, or WebP before OCR resizing or cropping
- a SHA-256 digest, MIME type, byte size, image dimensions, QR count, capture source, client platform, and timestamp
- institute, teacher, test, maximum marks, consent reference, retention deadline, and scan outcome

### OCR attempts

- the exact OCR input digest, MIME type, and byte size
- single- or multi-sticker mode and normalized QR target positions
- raw structured OCR output, read/failure status, failure reason, elapsed time, cache use, and timestamp

### Teacher-reviewed sticker result

- sticker position in the photo
- student database ID, printed ID, student name, batch ID/name, and whether the QR matched the selected student
- identity source (QR or manual picker) and normalized QR location
- original OCR score, teacher-confirmed final score, whether it was corrected, whether it replaced an existing mark, and review duration

Names are intentionally retained in this consent-backed raw dataset. Analysis datasets should replace names and database IDs with stable pseudonymous study IDs unless an identified analysis is specifically required by the approved protocol.

## Collection flow

1. The browser generates a random capture ID and uploads the untouched photo to private object storage.
2. QR reading and OCR run through the normal marks workflow. Every OCR attempt is linked to the capture ID.
3. The teacher reviews and confirms the mark. Only server-confirmed saves become final research items.
4. Retakes are labelled separately. Research-storage failures never block operational mark saving.
5. Expired records and their private images are deleted according to `STICKER_RESEARCH_RETENTION_DAYS`.

## Data still collected outside the app

For a defensible applied-research paper, also collect:

- manual-entry baseline time and errors on a comparable sample
- an independently double-checked ground-truth score for an audit subset
- capture-condition labels such as lighting, blur, camera angle, handwriting style, ink colour, sticker damage, and number of stickers
- brief teacher usability/workload feedback using the same questions at fixed intervals
- dataset split/version, deployed app commit, OCR model/prompt version, and API cost or token use

Do not add unrelated parent contact details, fees, addresses, passwords, messages, or other CRM records to this dataset.

## Minimum operational configuration

```text
STICKER_RESEARCH_COLLECTION_ENABLED=true
STICKER_RESEARCH_BUCKET=<private R2 bucket>
STICKER_RESEARCH_CONSENT_REFERENCE=<approved protocol or consent-bundle reference>
STICKER_RESEARCH_RETENTION_DAYS=365
```

Access to original images and identified rows should be restricted to the approved research team. Published tables and released datasets should use de-identified records and aggregated results.
