
import bcrypt from 'bcryptjs';

async function main() {
    const hash = '$2b$10$k1uCva//glE/qVGoCPvLyOYvPo7zUEdeXRcjhUWNEUW/Uxj8aqg4q';
    const isMatch = await bcrypt.compare('admin', hash);
    console.log('Password "admin" matches hash:', isMatch);
}

main();
