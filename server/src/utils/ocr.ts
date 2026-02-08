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


            const prompt = `
            Analyze this sticker image.
            On the RIGHT side, there are 3 distinct boxes for marks.
            
            Task: Read the handwritten digits inside these boxes effectively as a single number.
            
            Rules:
            1. If you see "7" in the first box and "0" in the second, the score is "70".
            2. If you see "0" then "5", the score is "05" (or just 5).
            3. Ignore the empty boxes.
            4. If there is a fraction like "45" in boxes and "/50" printed or written, return "45/50".
            
            Output strictly: The final number only. 
            Examples: "70", "05", "100", "9".
            If you are unsure or see nothing, return "ERROR_UNCERTAIN".
            `.trim();

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
