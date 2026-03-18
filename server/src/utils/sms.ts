import axios from 'axios';

/**
 * Sends an OTP SMS using MSG91 Flow/OTP API.
 * Uses the MSG91_AUTH_KEY from environment variables.
 * 
 * @param mobileNumber The mobile number (e.g., "91xxxxxxxxxx")
 * @param otp The 6-digit OTP code to send
 */
export const sendOtpSMS = async (mobileNumber: string, otp: string) => {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_OTP_TEMPLATE_ID;

    if (!authKey || !templateId) {
        console.warn('⚠️ Missing MSG91_AUTH_KEY or MSG91_OTP_TEMPLATE_ID in .env. Falling back to mock.');
        console.log(`[REAL_SMS_MOCK] To: ${mobileNumber}, Code: ${otp}`);
        return false;
    }

    try {
        // Standardise mobile number (ensure 91 prefix for India if not present)
        let formattedMobile = mobileNumber.replace(/\D/g, ''); 
        if (formattedMobile.length === 10) {
            formattedMobile = `91${formattedMobile}`;
        }

        // MSG91 OTP API (GET request is common for quick OTPs)
        // Or Flow API (POST request)
        // We'll use the Flow API payload structure since it's already used in the project's archived scripts
        const payload = {
            template_id: templateId,
            recipients: [
                {
                    mobiles: formattedMobile,
                    otp: otp
                }
            ]
        };

        const response = await axios.post('https://control.msg91.com/api/v5/flow/', payload, {
            headers: {
                'authkey': authKey,
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ OTP SMS successfully sent to ${formattedMobile} via MSG91`);
        return true;
    } catch (error: any) {
        console.error('❌ MSG91 OTP Sending Failed:', error.response?.data || error.message);
        return false;
    }
};
