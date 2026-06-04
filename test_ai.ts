import { generateTestWithVariants } from './server/src/utils/ai/test-generator';
import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

async function run() {
    try {
        console.log("Generating...");
        const res = await generateTestWithVariants("Algebra", "10th", "Medium", 20, undefined, "Testing");
        console.log("Success! Questions:", res.questions.length);
    } catch (e) {
        console.error("Failed:", e);
    }
}
run();
