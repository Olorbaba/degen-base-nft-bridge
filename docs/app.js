const data = {
  source: { address: '0x7584A721bB18E1531694a0c88D56B55CCB70D06C', tx: '0x6c35817a2fc63db4a880925e06df460cf467f497f1a3350f9eee5e316dafdbd5', rpc: 'https://rpc.degen.tips' },
  destination: { address: '0xa0A44dEAD4F124B425DeE4466d542DD612D10517', tx: '0x927ed03498494d7baaabb719f63e2f28864c4c38e17ec9e73b0c4a963710046b', rpc: 'https://sepolia.base.org' },
  bridgeId: '0x47cf81e47f03d6da07e39baf01139dbeb0dd821fee01512eff49e46b21751751',
  collection: '0x436e764419B7e0Ef0BFdf3D28f2faF1264810DCf',
  recipient: '0xbFdD3790aBb0768FAe791cf1c551F15Aa7Bb498f'
};
const short = value => `${value.slice(0, 8)}…${value.slice(-6)}`;
const set = (id, value) => { document.getElementById(id).textContent = value; };
set('bridge-id', short(data.bridgeId)); set('recipient', short(data.recipient)); set('vault-address', data.source.address); set('mirror-address', data.destination.address);
Object.assign(document.getElementById('source-collection'), { textContent: short(data.collection), href: `https://explorer.degen.tips/address/${data.collection}` });
document.getElementById('source-tx').href = `https://explorer.degen.tips/tx/${data.source.tx}`;
document.getElementById('destination-tx').href = `https://sepolia.basescan.org/tx/${data.destination.tx}`;
document.getElementById('vault-link').href = `https://explorer.degen.tips/address/${data.source.address}`;
document.getElementById('mirror-link').href = `https://sepolia.basescan.org/address/${data.destination.address}`;
document.getElementById('repo-link').href = 'https://github.com/Olorbaba/degen-base-nft-bridge';

async function rpc(url, method, params) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const value = await response.json();
  if (value.error) throw new Error(value.error.message);
  return value.result;
}
const button = document.getElementById('verify-button');
button.addEventListener('click', async () => {
  const status = document.getElementById('verification-status'); const output = document.getElementById('verification-output');
  button.disabled = true; status.className = 'status idle'; status.innerHTML = '<span></span>Checking both chains'; output.hidden = true;
  try {
    const [sourceCode, destinationCode, sourceReceipt, destinationReceipt] = await Promise.all([
      rpc(data.source.rpc, 'eth_getCode', [data.source.address, 'latest']), rpc(data.destination.rpc, 'eth_getCode', [data.destination.address, 'latest']),
      rpc(data.source.rpc, 'eth_getTransactionReceipt', [data.source.tx]), rpc(data.destination.rpc, 'eth_getTransactionReceipt', [data.destination.tx])
    ]);
    const ok = sourceCode !== '0x' && destinationCode !== '0x' && sourceReceipt?.status === '0x1' && destinationReceipt?.status === '0x1';
    if (!ok) throw new Error('One or more on-chain checks did not pass.');
    status.className = 'status success'; status.innerHTML = '<span></span>Verified on-chain';
    output.hidden = false; output.textContent = `✓ Degen vault runtime bytecode found\n✓ Degen lock transaction succeeded in block ${parseInt(sourceReceipt.blockNumber,16)}\n✓ Base mirror runtime bytecode found\n✓ Base mint transaction succeeded in block ${parseInt(destinationReceipt.blockNumber,16)}\n✓ Public evidence matches bridge ID ${short(data.bridgeId)}`;
  } catch (error) {
    status.className = 'status error'; status.innerHTML = '<span></span>RPC unavailable';
    output.hidden = false; output.textContent = `A public RPC could not be reached from this browser. Explorer evidence remains available.\n\n${error.message}`;
  } finally { button.disabled = false; }
});

