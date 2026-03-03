
async function main() {
    try {
        console.log('Attempting login to http://localhost:3001/api/auth/login...');
        const response = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin' })
        });

        const data = await response.json();
        console.log('Login Status:', response.status);
        console.log('Login Response:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Login Error:', e);
    }
}

main();
