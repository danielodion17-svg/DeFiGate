// scripts/setUserAdmin.js
import { User } from '../models/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function setUserAdmin(email, role = 'admin') {
  try {
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    const validRoles = ['user', 'admin', 'support'];
    if (!validRoles.includes(role)) {
      console.error(`❌ Invalid role. Must be one of: ${validRoles.join(', ')}`);
      process.exit(1);
    }

    await user.update({ role });
    console.log(`✅ User ${email} role updated to: ${role}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
const role = process.argv[3] || 'admin';

if (!email) {
  console.log('Usage: node scripts/setUserAdmin.js <email> [role]');
  console.log('Example: node scripts/setUserAdmin.js admin@example.com admin');
  process.exit(1);
}

setUserAdmin(email, role);