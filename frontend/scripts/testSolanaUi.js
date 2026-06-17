import fs from 'fs';
import path from 'path';
import assert from 'assert';

const root = process.cwd();

const testCases = [
  {
    file: 'src/pages/SignupPage.jsx',
    contains: [
      'Solana wallet',
      'Please wait a moment while we create your Solana wallet.',
      'Creating account and wallet...'
    ],
    notContains: ['Ethereum', 'ethereum', 'Polygon', 'polygon']
  },
  {
    file: 'src/components/Wallet.jsx',
    contains: ['Solana', 'Solana wallet'],
    notContains: ['Ethereum', 'ethereum', 'Polygon', 'polygon']
  },
  {
    file: 'src/components/TransferModal.jsx',
    contains: ['Solana'],
    notContains: ['Ethereum', 'ethereum', 'Polygon', 'polygon', 'Sepolia', 'Mainnet']
  },
  {
    file: 'src/pages/TransferPage.js',
    contains: ['Solana'],
    notContains: ['Ethereum', 'ethereum', 'Polygon', 'polygon', 'Sepolia', 'Mainnet']
  },
  {
    file: 'src/pages/WalletPage.js',
    contains: ['Solana'],
    notContains: ['Ethereum Sepolia', 'Ethereum', 'ethereum', 'Polygon', 'polygon']
  },
  {
    file: '../backend/controllers/userController.js',
    contains: ['createPrivyWalletForUser', 'preferredChain = "solana"'],
    notContains: []
  }
];

for (const { file, contains, notContains } of testCases) {
  const filePath = path.resolve(root, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing test file: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  for (const expected of contains) {
    assert(
      content.includes(expected),
      `Expected file ${file} to contain: ${expected}`
    );
  }

  for (const forbidden of notContains) {
    assert(
      !content.includes(forbidden),
      `Expected file ${file} to not contain: ${forbidden}`
    );
  }
}

console.log('All Solana UI and signup tests passed.');
