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
        // Confidence filter (lower threshold because handwriting can be sketchy)
        if (b.confidence < 30) return false;
        return true;
    });

    if (validDigits.length === 0) {
        return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
    }

    // 3. Slot into 3 virtual boxes based on Center X
    // The image consists of 3 square boxes side-by-side. 
    // Roughly, Box 1: 0.0 - 0.33, Box 2: 0.33 - 0.66, Box 3: 0.66 - 1.0
    
    let box1: string = ""; let conf1 = 0;
    let box2: string = ""; let conf2 = 0;
    let box3: string = ""; let conf3 = 0;

    for (const b of validDigits) {
        // If a block contains multiple digits (e.g. "99"), it spans across boxes.
        // We will process character by character based on estimated char X.
        const charWidth = b.width / b.normalizedText.length;
        
        for (let i = 0; i < b.normalizedText.length; i++) {
            const char = b.normalizedText[i];
            const charCenterX = b.left + (i * charWidth) + (charWidth / 2);

            let targetBox = 0;
            // Boundaries roughly at 1/3 and 2/3, padded slightly inwards
            if (charCenterX < 0.36) targetBox = 1;
            else if (charCenterX < 0.64) targetBox = 2;
            else targetBox = 3;

            // Update the box if this char has higher confidence OR if the box is currently empty
            if (targetBox === 1 && (box1 === "" || b.confidence > conf1)) { box1 = char; conf1 = b.confidence; }
            if (targetBox === 2 && (box2 === "" || b.confidence > conf2)) { box2 = char; conf2 = b.confidence; }
            if (targetBox === 3 && (box3 === "" || b.confidence > conf3)) { box3 = char; conf3 = b.confidence; }
        }
    }

    // Combine them, skipping empty boxes
    const finalScore = [box1, box2, box3].filter(x => x !== "").join("");

    if (!finalScore) {
        return { score: "ERROR_UNCERTAIN", confidence: 0, rawTexts };
    }

    // Calculate average confidence for the boxes we used
    let totalConf = 0;
    let numBoxes = 0;
    if (box1) { totalConf += conf1; numBoxes++; }
    if (box2) { totalConf += conf2; numBoxes++; }
    if (box3) { totalConf += conf3; numBoxes++; }
    
    return {
        score: finalScore,
        confidence: (totalConf / numBoxes) / 100, // Normalized to 0-1
        rawTexts
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
