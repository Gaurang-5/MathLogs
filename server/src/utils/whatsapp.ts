import axios from 'axios';

export interface WelcomeWAData {
    studentName: string;
    batchName: string;
    whatsappLink: string;
    instituteName: string;
}

/**
 * Sends a WhatsApp message using the MSG91 WhatsApp API.
 * 
 * @param mobileNumber The parent's mobile number (with country code, e.g., "919xxxxxxxxx")
 * @param templateName The Template Name approved in your MSG91 WhatsApp dashboard
 * @param components The dynamic variables to replace in the MSG91 template bodies
 */
export const sendMsg91WhatsApp = async (mobileNumber: string, templateName: string, components: Record<string, any>) => {
    const authKey = process.env.MSG91_AUTH_KEY;
    const integratedNumber = process.env.MSG91_WA_NUMBER; // Your registered WhatsApp number on MSG91

    if (!authKey || !integratedNumber || !templateName) {
        console.error('MSG91_AUTH_KEY, MSG91_WA_NUMBER, or Template Name is missing.');
        console.log('--- WhatsApp Mock (API keys missing) ---');
        console.log(`To: ${mobileNumber}`);
        console.log(`Template: ${templateName}`);
        console.log(`Components:`, components);
        return false;
    }

    try {
        // Standardise mobile number (assuming India '91' prefix if 10 digits)
        let formattedMobile = mobileNumber.replace(/\D/g, ''); // Remove non-numeric
        if (formattedMobile.length === 10) {
            formattedMobile = `91${formattedMobile}`;
        }

        const namespace = process.env.MSG91_WA_NAMESPACE;
        if (!namespace) {
            console.error('MSG91_WA_NAMESPACE is missing.');
            return false;
        }

        const payload = {
            integrated_number: integratedNumber,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: templateName,
                    language: {
                        code: "en",
                        policy: "deterministic"
                    },
                    namespace: namespace,
                    to_and_components: [
                        {
                            to: [formattedMobile],
                            components: components
                        }
                    ]
                }
            }
        };

        const response = await axios.post('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', payload, {
            headers: {
                'authkey': authKey,
                'Content-Type': 'application/json'
            }
        });

        console.log(`WhatsApp successfully sent to ${formattedMobile}`);
        return response.data;
    } catch (error: any) {
        console.error("WhatsApp Failed:", error.response?.data || error.message);
        return false;
    }
};

/**
 * Specifically sends the Welcome/Approval WhatsApp Message
 */
export const sendWelcomeWhatsApp = async (mobileNumber: string, data: WelcomeWAData) => {
    // The name of the template in MSG91 (e.g., "welcome_approval_1")
    const WELCOME_TEMPLATE_NAME = process.env.MSG91_WA_TEMPLATE_WELCOME;

    if (!WELCOME_TEMPLATE_NAME) {
        console.warn('⚠️ Missing MSG91_WA_TEMPLATE_WELCOME in .env. Skipping welcome WhatsApp.');
        return false;
    }

    // MSG91 WhatsApp API format based on cURL example
    const components = {
        body_var_1: {
            type: "text",
            value: data.studentName || "Student",
            parameter_name: "var_1"
        },
        body_var_2: {
            type: "text",
            value: data.batchName || "the batch",
            parameter_name: "var_2"
        },
        body_var_3: {
            type: "text",
            value: data.instituteName || "our institute",
            parameter_name: "var_3"
        },
        body_var_4: {
            type: "text",
            value: data.whatsappLink || "Contact admin for group link",
            parameter_name: "var_4"
        }
    };

    return await sendMsg91WhatsApp(mobileNumber, WELCOME_TEMPLATE_NAME, components);
};
