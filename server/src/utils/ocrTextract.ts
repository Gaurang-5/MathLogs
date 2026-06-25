import {
    TextractClient,
    DetectDocumentTextCommand,
    Block,
} from "@aws-sdk/client-textract";

const region = process.env.AWS_REGION || "ap-south-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let textractClient: TextractClient | null = null;

function getClient(): TextractClient {
    if (textractClient) return textractClient;

    if (!accessKeyId || !secretAccessKey) {
        throw new Error("AWS credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)");
    }

    textractClient = new TextractClient({
        region,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    return textractClient;
}

/**
 * Extracts the score from Textract blocks using spatial filtering.
 *
 * Since the client now sends a tightly cropped image of JUST the 3 digit boxes,
 * we still apply spatial guards to reject:
 *   - Text near edges (border artifacts, "OCR" watermark residue)
 *   - Non-numeric labels that survived cropping
 *   - Tiny stray detections (noise)
 */
function extractScoreFromBlocks(blocks: Block[], maxMarks?: number): { score: string; confidence: number; rawTexts: string[] } {
    const textBlocks: Array<{
        text: string;
        normalizedText: string;
        confidence: number;
        top: number;
        left: number;
        width: number;
        height: number;
        centerX: number;
    }> = [];

    // 1. Process and normalize text
    for (const block of blocks) {
        if (block.BlockType === "WORD" && block.Text && block.Geometry?.BoundingBox) {
            let t = block.Text.trim();
            
            // Skip known text labels that survived cropping
            if (/^(marks|ocr|name|total|max|:|\.)$/i.test(t)) continue;

            // OCR Normalization for handwritten digits
            // Often "1" is read as I, l, |, !, i
            t = t.replace(/[Il|!i]/g, "1");
            // "0" as O, o, Q, D
            t = t.replace(/[OoQD]/g, "0");
            // "5" as S, s
            t = t.replace(/[Ss]/g, "5");
            // "2" as Z, z
            t = t.replace(/[Zz]/g, "2");
            // "8" as B
            t = t.replace(/[B]/g, "8");

            // Strip out any non-digits after normalization
            t = t.replace(/[^0-9]/g, "");

            if (t.length > 0) {
                const geom = block.Geometry.BoundingBox;
                textBlocks.push({
                    text: block.Text,
                    normalizedText: t,
                    confidence: block.Confidence || 0,
                    top: geom.Top || 0,
                    left: geom.Left || 0,
                    width: geom.Width || 0,
                    height: geom.Height || 0,
                    centerX: (geom.Left || 0) + ((geom.Width || 0) / 2)
                });
            }
        }
    }

    const rawTexts = textBlocks.map((b) => `"${b.text}"->"${b.normalizedText}" (conf: ${b.confidence.toFixed(1)}%, box: L${b.left.toFixed(2)} W${b.width.toFixed(2)} CX${b.centerX.toFixed(2)})`);

    // 2. Filter noise
    const validDigits = textBlocks.filter(b => {
        // Reject edge noise
        if (b.left < 0.02 || (b.left + b.width) > 0.98) return false;
        // Reject tiny artifacts (dots/underlines)
        if (b.height < 0.08) return false;
        // Confidence filter (lower threshold because handwriting in small boxes can be faint)
        if (b.confidence < 20) return false;
        return true;
    });

    if (validDigits.length === 0) {
        return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
    }

    // 3. Dynamic Assignment of Digits
    // Sort all characters across all blocks by their CenterX
    const allChars: Array<{ char: string, centerX: number, confidence: number }> = [];

    for (const b of validDigits) {
        // If a block contains multiple digits (e.g. "99"), it spans across boxes.
        const charWidth = b.width / b.normalizedText.length;
        
        for (let i = 0; i < b.normalizedText.length; i++) {
            const char = b.normalizedText[i];
            const charCenterX = b.left + (i * charWidth) + (charWidth / 2);
            allChars.push({ char, centerX: charCenterX, confidence: b.confidence });
        }
    }

    // Sort left to right
    allChars.sort((a, b) => a.centerX - b.centerX);

    let finalScore = "";
    let totalConf = 0;
    const numBoxes = allChars.length;

    // Determine max digits allowed based on maxMarks
    // e.g. maxMarks=20 → max 2 digits, maxMarks=9 → max 1 digit
    const maxDigits = maxMarks ? Math.max(1, String(maxMarks).length) : 3;

    // Trim characters to maxDigits (take rightmost/last N chars since they're most likely the actual score)
    const effectiveChars = allChars.length > maxDigits ? allChars.slice(-maxDigits) : allChars;
    const effectiveCount = effectiveChars.length;

    if (effectiveCount === 3) {
        // 3 blocks: Hundreds, Tens, Ones
        finalScore = effectiveChars.map(c => c.char).join("");
        totalConf = effectiveChars.reduce((sum, c) => sum + c.confidence, 0);
    } else if (effectiveCount === 2) {
        // 2 blocks: Could be Tens+Ones (85), Hundreds+Tens (10), or Hundreds+Ones (105)
        const [left, right] = effectiveChars;
        
        // Define rough centers for the three boxes to gauge spacing
        // Box 1 ~ 0.16, Box 2 ~ 0.50, Box 3 ~ 0.83
        const getBoxIndex = (cx: number) => {
            const dist0 = Math.abs(cx - 0.16);
            const dist1 = Math.abs(cx - 0.50);
            const dist2 = Math.abs(cx - 0.83);
            if (dist0 <= dist1 && dist0 <= dist2) return 0;
            if (dist1 <= dist0 && dist1 <= dist2) return 1;
            return 2;
        };

        const leftBox = getBoxIndex(left.centerX);
        const rightBox = getBoxIndex(right.centerX);

        if (leftBox === 0 && rightBox === 2) {
            // Gap in the middle! It must be Hundreds and Ones (e.g., 1_5 -> 105)
            finalScore = left.char + "0" + right.char;
        } else {
            // Consecutive boxes or adjacent: just join them (Tens+Ones or Hundreds+Tens)
            finalScore = left.char + right.char;
        }
        totalConf = left.confidence + right.confidence;
    } else if (effectiveCount === 1) {
        // 1 block: Safely assume it is the Ones place (a single digit score)
        finalScore = effectiveChars[0].char;
        totalConf = effectiveChars[0].confidence;
    } else if (effectiveCount > 3) {
        // Fallback for >3 decoded digits
        finalScore = effectiveChars.map(c => c.char).join("").substring(0, 3);
        totalConf = effectiveChars.slice(0, 3).reduce((sum, c) => sum + c.confidence, 0);
    }

    if (!finalScore) {
        return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
    }

    // Range validation: if we know maxMarks, reject scores that exceed it
    if (maxMarks && parseInt(finalScore, 10) > maxMarks) {
        // Try progressively shorter substrings (e.g., "85" → "8" if maxMarks=20)
        // This handles cases where noise added an extra digit
        for (let len = finalScore.length - 1; len >= 1; len--) {
            const shorter = finalScore.substring(finalScore.length - len);
            if (parseInt(shorter, 10) <= maxMarks) {
                finalScore = shorter;
                break;
            }
        }
        // If still exceeds after trimming, flag as uncertain
        if (parseInt(finalScore, 10) > maxMarks) {
            return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
        }
    }

    return {
        score: finalScore,
        confidence: effectiveCount > 0 ? (totalConf / Math.min(effectiveCount, 3)) / 100 : 0,
        rawTexts
    };
}

/**
 * Processes an image through Amazon Textract DetectDocumentText.
 * Uses the simpler/faster text detection API ($1.50/1K pages vs $50/1K for FORMS).
 * Sufficient for reading handwritten digits from the tightly-cropped digit box image.
 */
export async function processOCRTextract(
    input: Buffer | string,
    maxMarks?: number
): Promise<{ score: string; confidence: number; raw: string; rawTexts: string[] }> {
    const client = getClient();

    // Convert to raw bytes
    let imageBytes: Uint8Array;
    if (Buffer.isBuffer(input)) {
        imageBytes = input;
    } else {
        const cleanBase64 = input.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
        imageBytes = Buffer.from(cleanBase64, "base64");
    }

    const command = new DetectDocumentTextCommand({
        Document: {
            Bytes: imageBytes,
        },
    });

    const response = await client.send(command);

    if (!response.Blocks || response.Blocks.length === 0) {
        return {
            score: "ERROR_UNCERTAIN",
            confidence: 0,
            raw: "No blocks detected",
            rawTexts: [],
        };
    }

    const { score, confidence, rawTexts } = extractScoreFromBlocks(response.Blocks, maxMarks);

    return {
        score,
        confidence,
        raw: `Textract detected ${response.Blocks.length} blocks`,
        rawTexts,
    };
}
