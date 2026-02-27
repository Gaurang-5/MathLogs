import axios from 'axios';


// Interface for the Welcome SMS variables
export interface WelcomeSMSData {
    studentName: string;
    batchName: string;
    whatsappLink: string;
    instituteName: string;
}

/**
 * Sends an SMS using the MSG91 Flow API.
 * 
 * @param mobileNumber The parent's mobile number (with country code, e.g., "919xxxxxxxxx")
 * @param templateId The Template ID approved in your MSG91 dashboard
 * @param variables The dynamic variables to replace in the MSG91 template
 */
export const sendMsg91SMS = async (mobileNumber: string, templateId: string, variables: Record<string, string>) => {
    const authKey = process.env.MSG91_AUTH_KEY;

    if (!authKey || !templateId) {
        console.error('MSG91_AUTH_KEY or Template ID is missing.');
        console.log('--- SMS Mock (API keys missing) ---');
        console.log(`To: ${mobileNumber}`);
        console.log(`Payload:`, variables);
        return false;
    }

    try {
        // Standardise mobile number (assuming India '91' prefix if 10 digits)
        let formattedMobile = mobileNumber.replace(/\D/g, ''); // Remove non-numeric
        if (formattedMobile.length === 10) {
            formattedMobile = `91${formattedMobile}`;
        }

        const payload = {
            template_id: templateId,
            short_url: "0", // Set to "1" if you want MSG91 to shorten URLs automatically for analytics
            recipients: [
                {
                    mobiles: formattedMobile,
                    ...variables // e.g., var1: "John", var2: "Math Batch"
                }
            ]
        };

        const response = await axios.post('https://control.msg91.com/api/v5/flow/', payload, {
            headers: {
                'authkey': authKey,
                'Content-Type': 'application/json'
            }
        });

        console.log(`SMS successfully sent to ${formattedMobile}`);
        return response.data;
    } catch (error: any) {
        console.error(error.response?.data || error.message);
        return false;
    }
};

/**
 * Specifically sends the Welcome Welcome/Approval SMS
 */
export const sendWelcomeSMS = async (mobileNumber: string, data: WelcomeSMSData) => {
    // You will need to put your actual MSG91 Welcome Template ID here after creating it in the dashboard
    const WELCOME_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID_WELCOME;

    if (!WELCOME_TEMPLATE_ID) {
        console.warn('⚠️ Missing MSG91_TEMPLATE_ID_WELCOME in .env. Skipping welcome SMS.');
        return false;
    }

    return await sendMsg91SMS(mobileNumber, WELCOME_TEMPLATE_ID, {
        name: data.studentName,
        batch: data.batchName,
        link: data.whatsappLink || "Contact admin for group link",
        institute: data.instituteName
    });
};
