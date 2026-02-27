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

    // Prioritize 1.5-flash for stability
    const models = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash"];

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 50,
                }
            });


            const prompt = `You are reading handwritten exam marks from a student sticker.
The image shows the MARKS section of the sticker: a label "MARKS:" and below it, 3 small boxes arranged in a row.
Each box may contain ONE handwritten digit written by a teacher.
The boxes have a horizontal underline at the bottom for writing guidance — do NOT read underlines as digits.

Task: Read the handwritten digits in the boxes left to right and combine them into a single score number.

Rules:
1. Combine all digit boxes that have a handwritten number. Example: box1="7", box2="0" → return "70".
2. If only one box is filled, return just that digit. Example: box1="5" → return "5".
3. Completely empty boxes (only underline, no digit) = ignore.
4. If boxes clearly show a score out of total like "45" with "/50" visible → return "45/50".
5. If you cannot confidently read any digit, return "ERROR_UNCERTAIN".

Return ONLY the score. No explanation. Examples: "70", "5", "100", "45/50", "ERROR_UNCERTAIN".`.trim();

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
            ]);


            const responseText = result.response.text();
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
