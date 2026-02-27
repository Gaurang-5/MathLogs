import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!geminiKey) {
    console.warn("⚠️ GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(geminiKey || "");

/**
 * Standardizes the AI output by extracting the first valid number or fraction.
 */
function cleanExtractedScore(text: string): string {
    if (!text) return "";

    // Normalize text
    let clean = text.replace(/```(?:json|text)?/g, '').replace(/```/g, '').trim();

    // Aggressive merge of spaced digits: "7 0" -> "70", "0 5" -> "05"
    const fractionMatch = clean.match(/(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
        return `${fractionMatch[1]}/${fractionMatch[2]}`;
    }

    const digitOnly = clean.replace(/[^0-9.]/g, ' ').trim();
    const parts = digitOnly.split(/\s+/);

    if (parts.length > 1) {
        return parts.join('');
    }

    const scorePattern = /(\d+(?:\.\d+)?)/;
    const match = clean.match(scorePattern);

    return match ? match[0] : "";
}


export async function processOCR(input: Buffer | string): Promise<{ score: string; confidence: number; raw: string }> {
    if (!geminiKey) {
        throw new Error("Server missing Gemini API Key");
    }

    // Convert Buffer to Base64 logic if needed, or pass directly
    let cleanBase64 = "";
    if (Buffer.isBuffer(input)) {
        cleanBase64 = input.toString('base64');
    } else {
        cleanBase64 = input.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
    }

    // Prioritize 1.5-flash. If rate limited (429), fall back to exact correct model versions for v1beta tier.
    const models = [
        "gemini-1.5-flash",
        "gemini-1.5-pro-latest",
        "gemini-2.0-flash-exp"
    ];

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                }
            });

            const prompt = `You are an AI reading handwritten exam marks from a student sticker.
The image shows the MARKS section: a label "MARKS:" and below it, 3 small boxes in a row.
Each box may contain ONE handwritten digit.
The boxes have a horizontal underline at the bottom for writing guidance — ignore these underlines, they are not digits.

Task: Read the handwriting in the boxes from left to right to form a single score number.

Rules:
1. Combine all digit boxes that have a number. Example: box1="7", box2="0" → return "70".
2. If only one box is filled, return just that digit. Example: box1="5" → return "5".
3. Empty boxes = ignore.
4. If you clearly see a score format like "45/50", return "45/50".

Return ONLY the final string. No explanation. Examples: "70", "5", "100", "45/50".
If the image is completely unreadable or has no numbers, return "ERROR_UNCERTAIN".`.trim();

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
            ]);

            // Safely get text, handling cases where it was blocked or returned empty
            let responseText = "";
            const response = result.response;

            if (response.promptFeedback && response.promptFeedback.blockReason) {
                console.warn(`⚠️ Gemini prompt blocked: ${response.promptFeedback.blockReason}`);
                continue;
            }

            try {
                responseText = response.text();
            } catch (e: any) {
                console.warn(`⚠️ Gemini could not read text from ${modelName}:`, e.message);
                continue;
            }

            const cleanScore = cleanExtractedScore(responseText);

            if (cleanScore && cleanScore !== "ERROR_UNCERTAIN") {
                return { score: cleanScore, confidence: 0.95, raw: responseText };
            }
        } catch (error: any) {
            console.error(`❌ ${modelName} Failed:`, error.message || error);
            continue;
        }
    }

    return { score: "ERROR_UNCERTAIN", confidence: 0, raw: "All models failed" };
}
