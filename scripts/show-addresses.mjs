import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';

function show(name) {
  const value = process.env[name];
  if (!value) {
    console.log(`${name}: not configured`);
    return;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    console.log(`${name}: invalid private-key format`);
    process.exitCode = 1;
    return;
  }
  console.log(`${name.replace('_PRIVATE_KEY', '_ADDRESS')}: ${privateKeyToAccount(value).address}`);
}

show('DEPLOYER_PRIVATE_KEY');
show('RELAYER_PRIVATE_KEY');

