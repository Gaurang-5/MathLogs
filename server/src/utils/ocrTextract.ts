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
function extractScoreFromBlocks(blocks: Block[]): { score: string; confidence: number; rawTexts: string[] } {
    // Collect WORD blocks with geometry
    const textBlocks: Array<{
        text: string;
        confidence: number;
        top: number;
        left: number;
        width: number;
        height: number;
        blockType: string;
    }> = [];

    for (const block of blocks) {
        if (
            block.BlockType === "WORD" &&
            block.Text &&
            block.Geometry?.BoundingBox
        ) {
            textBlocks.push({
                text: block.Text.trim(),
                confidence: block.Confidence || 0,
                top: block.Geometry.BoundingBox.Top || 0,
                left: block.Geometry.BoundingBox.Left || 0,
                width: block.Geometry.BoundingBox.Width || 0,
                height: block.Geometry.BoundingBox.Height || 0,
                blockType: block.BlockType as string,
            });
        }
    }

    const rawTexts = textBlocks.map((b) => `"${b.text}" (conf: ${b.confidence.toFixed(1)}%, box: L${b.left.toFixed(2)} T${b.top.toFixed(2)} W${b.width.toFixed(2)} H${b.height.toFixed(2)})`);

    // Filter to valid digit candidates
    const digitWords = textBlocks.filter((b) => {
        const t = b.text;

        // 1. Must contain at least one digit
        if (!/\d/.test(t)) return false;

        // 2. Skip known labels (MARKS, OCR, etc.)
        if (/^(marks|ocr|name|total|max)$/i.test(t)) return false;
        if (t === ":" || t === ".") return false;

        // 3. SPATIAL FILTER: reject text too close to edges (noise/artifacts)
        //    The cropped image should have digits roughly centered
        //    Reject if left edge is < 3% or right edge > 97% (edge noise)
        const rightEdge = b.left + b.width;
        if (b.left < 0.03 || rightEdge > 0.97) return false;

        // 4. SIZE FILTER: reject tiny detections (noise, underline artifacts)
        //    Real handwritten digits should have meaningful size
        if (b.height < 0.08) return false;  // Too small vertically = noise

        // 5. Confidence filter: reject low-confidence detections
        if (b.confidence < 50) return false;

        return true;
    });

    if (digitWords.length === 0) {
        return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
    }

    // Sort by horizontal position (left to right) to read boxes in order
    digitWords.sort((a, b) => a.left - b.left);

    // Check for fraction pattern (e.g., "45/50")
    const allText = digitWords.map((d) => d.text).join(" ");
    const fractionMatch = allText.match(/(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
        const avgConf = digitWords.reduce((sum, d) => sum + d.confidence, 0) / digitWords.length;
        return {
            score: `${fractionMatch[1]}/${fractionMatch[2]}`,
            confidence: avgConf / 100,
            rawTexts,
        };
    }

    // Combine all digit characters from left-to-right
    let combined = digitWords
        .map((d) => d.text.replace(/[^0-9]/g, ""))
        .filter(Boolean)
        .join("");

    // Safety: sticker has max 3 digit boxes, so cap at 3 digits
    // If we got more, it means noise crept in — take only the first 3
    if (combined.length > 3) {
        console.warn(`⚠️ Textract extracted ${combined.length} digits ("${combined}"), capping to 3`);
        combined = combined.substring(0, 3);
    }

    if (!combined) {
        return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
    }

    const avgConfidence = digitWords.reduce((sum, d) => sum + d.confidence, 0) / digitWords.length;

    return {
        score: combined,
        confidence: avgConfidence / 100,
        rawTexts,
    };
}

/**
 * Processes an image through Amazon Textract DetectDocumentText.
 * Uses the simpler/faster text detection API ($1.50/1K pages vs $50/1K for FORMS).
 * Sufficient for reading handwritten digits from the tightly-cropped digit box image.
 */
export async function processOCRTextract(
    input: Buffer | string
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

    const { score, confidence, rawTexts } = extractScoreFromBlocks(response.Blocks);

    return {
        score,
        confidence,
        raw: `Textract detected ${response.Blocks.length} blocks`,
        rawTexts,
    };
}
