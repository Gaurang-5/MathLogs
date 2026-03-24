const axios = require('axios');

async function testWa() {
    const payload = {
    "integrated_number": "918439245302",
    "content_type": "template",
    "payload": {
        "messaging_product": "whatsapp",
        "type": "template",
        "template": {
            "name": "onboarding_invite",
            "language": {
                "code": "en",
                "policy": "deterministic"
            },
            "namespace": "34035c7f_e78d_4feb_bbdb_85b059b214f6",
            "to_and_components": [
                {
                    "to": [
                        "918439245302"
                    ],
                    "components": {
                        "body_tuition_name": {
                            "type": "text",
                            "value": "Test Coaching",
                            "parameter_name": "tuition_name"
                        },
                        "body_setup_link": {
                            "type": "text",
                            "value": "https://mathlogs.app/test",
                            "parameter_name": "setup_link"
                        },
                        "body_owner_name": {
                            "type": "text",
                            "value": "Gaurang",
                            "parameter_name": "owner_name"
                        }
                    }
                }
            ]
        }
    }
    };

    try {
        const response = await axios.post('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', payload, {
            headers: {
                'authkey': '496953AkhKvTM5J69a1e3acP1',
                'Content-Type': 'application/json'
            }
        });
        console.log("Success:", response.data);
    } catch (e) {
        console.log("Error:", e.response?.data || e.message);
    }
}
testWa();
