import { processWhatsappQueue } from './src/utils/whatsappWorker';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const runWorker = async () => {
    try {
        const count = await processWhatsappQueue();
        console.log(`Processed ${count} jobs from queue.`);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
};

runWorker();
