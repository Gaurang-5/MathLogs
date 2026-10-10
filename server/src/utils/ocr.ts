import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { secureLogger } from './secureLogger';


const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!geminiKey) {
    secureLogger.warn("⚠️ GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(geminiKey || "");

/**
 * Standardizes the AI output by extracting the first valid number or fraction.
 */
export function cleanExtractedScore(text: unknown, maxMarks?: number): string {
    if (typeof text !== 'string') return '';
    const value = text.trim();
    const match = /^(\d+(?:\.\d{1,2})?)(?:\s*\/\s*(\d+(?:\.\d{1,2})?))?$/.exec(value);
    if (!match) return '';
    const score = Number(match[1]);
    if (!Number.isFinite(score) || (maxMarks !== undefined && score > maxMarks)) return '';
    if (match[2] && (maxMarks === undefined || Number(match[2]) !== maxMarks || score > Number(match[2]))) return '';
    return String(score);
}

export async function processOCR(input: Buffer | string, maxMarks?: number, mimeType = 'image/jpeg'): Promise<{ score: string; confidence: number; raw: string }> {
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

    // Primary: 2.5 Flash (best price/performance). Fallback: 2.5 Flash Lite.
    const models = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ];

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            score: {
                                type: SchemaType.STRING,
                                description: "The extracted numerical marks. Strictly numbers only (e.g. '70', '5') or a fraction (e.g. '45/50'). Limit to numbers only. If unreadable, return 'ERROR_UNCERTAIN'."
                            }
                        },
                        required: ["score"]
                    }
                }
            });

            const prompt = `${maxMarks === undefined ? '' : `The selected test has a maximum score of ${maxMarks}. Never infer a missing digit from this maximum.`}
You are an AI reading handwritten exam marks from a student sticker.
The image shows the MARKS section: a label "MARKS:" and below it, 3 small boxes in a row.
Each box may contain ONE handwritten digit.
The boxes have a horizontal underline at the bottom for writing guidance — ignore these underlines, they are not digits.

Task: Read the handwriting in the boxes from left to right to form a single score number.

Rules:
1. Combine all digit boxes that have a number. Example: box1="7", box2="0" → return "70".
2. If only one box is filled, return just that digit. Example: box1="5" → return "5".
3. Empty boxes = ignore.
4. If you clearly see a score format like "45/50", return "45/50".

LIMIT TO NUMBERS ONLY. Assign the exact numerical score to the "score" field in the JSON response.
If marks are crossed out, ambiguous, multiple alternative totals appear, the image is unreadable, or no numbers appear, return "ERROR_UNCERTAIN".`.trim();

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: cleanBase64, mimeType } }
            ]);

            // Safely get text, handling cases where it was blocked or returned empty
            let responseText = "";
            const response = result.response;

            if (response.promptFeedback && response.promptFeedback.blockReason) {
                secureLogger.warn(`⚠️ Gemini prompt blocked: ${response.promptFeedback.blockReason}`);
                continue;
            }

            try {
                responseText = response.text();
            } catch (e: any) {
                secureLogger.warn(`⚠️ Gemini could not read text from ${modelName}:`, e.message);
                continue;
            }

            let extractedScore = responseText;
            try {
                const parsed = JSON.parse(responseText);
                if (parsed.score) {
                    extractedScore = parsed.score;
                }
            } catch (e) {
                // fall back to raw responseText if JSON parse fails
            }

            const cleanScore = cleanExtractedScore(extractedScore, maxMarks);

            if (cleanScore && cleanScore !== "ERROR_UNCERTAIN") {
                return { score: cleanScore, confidence: 0, raw: responseText };
            }
        } catch (error: any) {
            console.error(`❌ ${modelName} Failed:`, error.message || error);
            continue;
        }
    }

    return { score: "ERROR_UNCERTAIN", confidence: 0, raw: "All models failed" };
}
