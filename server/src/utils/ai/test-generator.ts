import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiKey || "");

export interface GeneratedQuestion {
    questionText: string;
    options?: string[];
    correctAnswer?: string;
    marks: number;
    // Only present when generated as a paired variant set
    variantGroup?: string;
}

export interface GeneratedTest {
    title: string;
    description: string;
    questions: GeneratedQuestion[];
    totalMarks: number;
    hasVariants?: boolean; // true when 2N questions generated in N pairs
}

// Shared model factory to avoid repetition
function makeModel(temperature = 0.7) {
    return genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature,
            responseMimeType: "application/json"
        }
    });
}

function buildFileContents(files?: Array<{ buffer: Buffer; mimetype: string }>): any[] {
    if (!files || files.length === 0) return [];
    return files.map(file => ({
        inlineData: {
            data: file.buffer.toString("base64"),
            mimeType: file.mimetype
        }
    }));
}

// ────────────────────────────────────────────────────────────────────────────
// Standard test generation (N questions, no pairing)
// ────────────────────────────────────────────────────────────────────────────
export async function generateTest(
    topic: string,
    grade: string,
    difficulty: string,
    questionCount: number,
    files?: Array<{ buffer: Buffer; mimetype: string }>,
    comments?: string
): Promise<GeneratedTest> {
    if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    title: { type: SchemaType.STRING, description: "An engaging title for the test based on the topic." },
                    description: { type: SchemaType.STRING, description: "A short description or instructions for the students." },
                    totalMarks: { type: SchemaType.NUMBER, description: "Total marks for the test (sum of all question marks)." },
                    questions: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                questionText: { type: SchemaType.STRING, description: "The text of the question." },
                                options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "List of 4 multiple-choice options. (Leave empty if subjective)." },
                                correctAnswer: { type: SchemaType.STRING, description: "The correct option or a short answer key." },
                                marks: { type: SchemaType.NUMBER, description: "Marks awarded for this question." }
                            },
                            required: ["questionText", "marks", "correctAnswer"]
                        }
                    }
                },
                required: ["title", "description", "totalMarks", "questions"]
            }
        }
    });

    let prompt = `You are an expert teacher. Generate a test on the topic "${topic}" for ${grade} grade students.
The difficulty level should be ${difficulty}.
Please generate exactly ${questionCount} questions.
Make sure the questions are clear, accurate, and age-appropriate. Include multiple-choice questions.`;

    if (comments?.trim()) {
        prompt += `\n\nTeacher's Custom Instructions/Guidelines for the test:\n${comments.trim()}`;
    }

    const contents: any[] = [...buildFileContents(files)];
    if (files && files.length > 0) {
        prompt += `\n\nCRITICAL: You must generate the test questions and topic content based on the attached document/image file contents.`;
    }
    contents.push(prompt);

    try {
        const result = await model.generateContent(contents);
        return JSON.parse(result.response.text()) as GeneratedTest;
    } catch (e: any) {
        console.error("Test Generation Failed:", e);
        throw new Error("Failed to generate test: " + e.message);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 2N variant generation: N concept groups, 2 sibling questions per group
// Each pair shares the same conceptual idea but differs in scenario/numbers
// ────────────────────────────────────────────────────────────────────────────
export async function generateTestWithVariants(
    topic: string,
    grade: string,
    difficulty: string,
    questionCount: number, // N — the teacher's desired question count; we generate 2N
    files?: Array<{ buffer: Buffer; mimetype: string }>,
    comments?: string
): Promise<GeneratedTest> {
    if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.8,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    title: { type: SchemaType.STRING },
                    description: { type: SchemaType.STRING },
                    totalMarks: { type: SchemaType.NUMBER },
                    // pairs: N groups, each with 2 sibling questions
                    pairs: {
                        type: SchemaType.ARRAY,
                        description: `Exactly ${questionCount} concept groups. Each group has 2 variant questions testing the same concept differently.`,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                groupLabel: {
                                    type: SchemaType.STRING,
                                    description: "Short label for the concept being tested (e.g. 'Speed-Distance-Time', 'Area of Triangle')"
                                },
                                variantA: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        questionText: { type: SchemaType.STRING },
                                        options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                                        correctAnswer: { type: SchemaType.STRING },
                                        marks: { type: SchemaType.NUMBER }
                                    },
                                    required: ["questionText", "marks", "correctAnswer"]
                                },
                                variantB: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        questionText: { type: SchemaType.STRING },
                                        options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                                        correctAnswer: { type: SchemaType.STRING },
                                        marks: { type: SchemaType.NUMBER }
                                    },
                                    required: ["questionText", "marks", "correctAnswer"]
                                }
                            },
                            required: ["groupLabel", "variantA", "variantB"]
                        }
                    }
                },
                required: ["title", "description", "totalMarks", "pairs"]
            }
        }
    });

    let prompt = `You are an expert teacher creating an anti-cheating quiz.

Topic: "${topic}"
Grade: ${grade}
Difficulty: ${difficulty}
Concept Groups Required: ${questionCount}

TASK: Generate exactly ${questionCount} CONCEPT GROUPS. Each group contains exactly 2 VARIANT questions that:
1. Test the SAME concept/skill
2. Are DIFFERENT in wording, scenario, or numbers (not just surface rewording)
3. Have the SAME marks value and difficulty level
4. Are MCQs with 4 options each

Example of a valid pair for the concept "Simple Interest":
- Variant A: "What is the simple interest on ₹5000 at 8% per annum for 3 years?"
- Variant B: "Ramesh borrows ₹12000 at 6% per annum. What is the interest he pays after 2 years?"

RULE: The two variants in each group must NOT be usable together in the same quiz — they are alternatives.
Make sure Variant B is substantially different from Variant A (different numbers, different real-world context).`;

    if (comments?.trim()) {
        prompt += `\n\nTeacher's Instructions: ${comments.trim()}`;
    }

    const contents: any[] = [...buildFileContents(files)];
    if (files && files.length > 0) {
        prompt += `\n\nBase questions on the attached reference materials.`;
    }
    contents.push(prompt);

    try {
        const result = await model.generateContent(contents);
        const raw = JSON.parse(result.response.text()) as {
            title: string;
            description: string;
            totalMarks: number;
            pairs: Array<{
                groupLabel: string;
                variantA: { questionText: string; options?: string[]; correctAnswer: string; marks: number };
                variantB: { questionText: string; options?: string[]; correctAnswer: string; marks: number };
            }>;
        };

        // Flatten pairs into a flat list, tagging each with a variantGroup UUID
        const questions: GeneratedQuestion[] = [];
        for (let i = 0; i < raw.pairs.length; i++) {
            const pair = raw.pairs[i];
            // Use a stable group ID based on index — controller will replace with real UUID on save
            const groupId = `group-${i}`;
            questions.push({
                questionText: pair.variantA.questionText,
                options: pair.variantA.options,
                correctAnswer: pair.variantA.correctAnswer,
                marks: pair.variantA.marks,
                variantGroup: groupId
            });
            questions.push({
                questionText: pair.variantB.questionText,
                options: pair.variantB.options,
                correctAnswer: pair.variantB.correctAnswer,
                marks: pair.variantB.marks,
                variantGroup: groupId
            });
        }

        // Recalculate total marks as sum of one variant per group (A side)
        const totalMarks = raw.pairs.reduce((sum, pair) => sum + pair.variantA.marks, 0);

        return {
            title: raw.title,
            description: raw.description,
            questions,
            totalMarks,
            hasVariants: true
        };
    } catch (e: any) {
        console.error("Variant Test Generation Failed:", e);
        throw new Error("Failed to generate variant test: " + e.message);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Single question regeneration (unkept slot replacement)
// ────────────────────────────────────────────────────────────────────────────
export async function generateSingleQuestion(
    topic: string,
    grade: string,
    difficulty: string,
    excludeQuestions: string[],
    files?: Array<{ buffer: Buffer; mimetype: string }>,
    comments?: string
): Promise<GeneratedQuestion> {
    if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    questionText: { type: SchemaType.STRING, description: "The text of the question." },
                    options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "List of 4 multiple-choice options." },
                    correctAnswer: { type: SchemaType.STRING, description: "The correct option or a short answer key." },
                    marks: { type: SchemaType.NUMBER, description: "Marks awarded for this question." }
                },
                required: ["questionText", "marks", "correctAnswer"]
            }
        }
    });

    let prompt = `You are an expert teacher. Generate exactly ONE question on the topic "${topic}" for ${grade} grade students.
The difficulty level should be ${difficulty}.
Make sure the question is clear, accurate, and age-appropriate.
It should be a multiple-choice question.`;

    if (excludeQuestions?.length > 0) {
        prompt += `\n\nCRITICAL: Do NOT generate any of the following questions as they already exist in the test:\n${excludeQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    }

    if (comments?.trim()) {
        prompt += `\n\nTeacher's Custom Instructions/Guidelines for the question:\n${comments.trim()}`;
    }

    const contents: any[] = [...buildFileContents(files)];
    if (files && files.length > 0) {
        prompt += `\n\nCRITICAL: You must generate the question based on the attached document/image file contents.`;
    }
    contents.push(prompt);

    try {
        const result = await model.generateContent(contents);
        return JSON.parse(result.response.text()) as GeneratedQuestion;
    } catch (e: any) {
        console.error("Single Question Generation Failed:", e);
        throw new Error("Failed to generate question: " + e.message);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Generate a variant sibling for a single existing question
// ────────────────────────────────────────────────────────────────────────────
export async function generateVariantQuestion(
    originalQuestion: string,
    topic: string,
    grade: string,
    difficulty: string,
    comments?: string
): Promise<GeneratedQuestion> {
    if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.8,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    questionText: { type: SchemaType.STRING },
                    options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    correctAnswer: { type: SchemaType.STRING },
                    marks: { type: SchemaType.NUMBER }
                },
                required: ["questionText", "marks", "correctAnswer"]
            }
        }
    });

    let prompt = `You are an expert teacher. Create a VARIANT of the following question that tests the SAME concept but uses different numbers, a different scenario, or a different real-world context.

ORIGINAL QUESTION:
"${originalQuestion}"

RULES:
1. The variant must test the EXACT SAME skill/concept
2. Use different numbers or a different scenario — not just surface rewording
3. Keep the same difficulty level (${difficulty}) and grade (${grade})
4. Provide 4 MCQ options
5. The two questions should NEVER appear in the same quiz — they are alternatives

Topic: "${topic}"`;

    if (comments?.trim()) {
        prompt += `\n\nAdditional guidelines: ${comments.trim()}`;
    }

    const contents: any[] = [prompt];

    try {
        const result = await model.generateContent(contents);
        return JSON.parse(result.response.text()) as GeneratedQuestion;
    } catch (e: any) {
        console.error("Variant Question Generation Failed:", e);
        throw new Error("Failed to generate variant question: " + e.message);
    }
}
