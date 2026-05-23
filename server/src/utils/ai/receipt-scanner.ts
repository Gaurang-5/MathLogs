import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiKey || "");

export interface ReceiptData {
    amountPaid: number;
    date: string;
    senderName: string;
    upiId: string;
    confidence: number;
}

export async function processReceiptScreenshot(input: Buffer | string): Promise<ReceiptData> {
    if (!geminiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    let cleanBase64 = "";
    if (Buffer.isBuffer(input)) {
        cleanBase64 = input.toString('base64');
    } else {
        cleanBase64 = input.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    amountPaid: {
                        type: SchemaType.NUMBER,
                        description: "The payment amount extracted from the screenshot. Numeric only."
                    },
                    date: {
                        type: SchemaType.STRING,
                        description: "The payment date in YYYY-MM-DD format. E.g., 2024-05-12."
                    },
                    senderName: {
                        type: SchemaType.STRING,
                        description: "The name of the person who sent the money, if visible. E.g., John Doe."
                    },
                    upiId: {
                        type: SchemaType.STRING,
                        description: "The UPI ID of the sender or receiver, or Transaction ID if UPI is not present."
                    }
                },
                required: ["amountPaid", "date", "senderName", "upiId"]
            }
        }
    });

    const prompt = `You are a financial assistant reading a UPI payment screenshot (e.g., GPay, PhonePe, Paytm) or a bank transfer receipt.
Extract the following information from the image:
1. The amount paid (numbers only).
2. The date of the transaction.
3. The sender's name (the person who sent the money).
4. The transaction ID or UPI ID.

Respond strictly in JSON format.
If you are unable to read a particular field, return an empty string for text fields, or 0 for amount.`;

    try {
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
        ]);

        const text = result.response.text();
        const parsed = JSON.parse(text);

        return {
            amountPaid: parsed.amountPaid || 0,
            date: parsed.date || new Date().toISOString().split("T")[0],
            senderName: parsed.senderName || "",
            upiId: parsed.upiId || "",
            confidence: parsed.amountPaid ? 0.95 : 0.2
        };
    } catch (e) {
        console.error("Receipt Scanning Failed:", e);
        return {
            amountPaid: 0,
            date: new Date().toISOString().split("T")[0],
            senderName: "",
            upiId: "",
            confidence: 0
        };
    }
}
