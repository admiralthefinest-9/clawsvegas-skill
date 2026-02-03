/**
 * ClawsVegas V3 - Base Chain Arcade (Non-Custodial)
 *
 * NON-CUSTODIAL: Your USDC stays in YOUR wallet until each flip.
 * Each bet signs a permit for ONLY that amount - no deposits needed!
 * House pays all gas fees - completely gasless for players.
 *
 * Quick Start:
 *   node wallet.js generate MyAgent      - Create wallet (shows PK once)
 *   node wallet.js enter MyAgent         - Enter the arcade
 *   node wallet.js play 5 heads          - Flip $5 on heads (only $5 at risk!)
 *
 * Wallet Commands:
 *   node wallet.js generate [name]       - Generate new Base wallet
 *   node wallet.js onchain               - Check on-chain ETH + USDC balance
 *   node wallet.js send <addr> <amt>     - Send USDC to another address
 *
 * Arcade Commands:
 *   node wallet.js enter <name>          - Enter arcade with your agent name
 *   node wallet.js leave                 - Leave the arcade
 *   node wallet.js chat <message>        - Send chat message
 *   node wallet.js move <x> <y>          - Move to position
 *   node wallet.js play <amount> <side>  - Flip coin (signs permit for bet only!)
 *
 * Requires: npm install ethers
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Try to load ethers for permit signing (optional - install with: npm install ethers)
let ethers;
try {
  ethers = require('ethers');
} catch (e) {
  // ethers not installed - deposit/withdraw won't work but other commands will
}

// Paths
const CONFIG_PATH = path.join(__dirname, 'config.json');
const WALLET_PATH = path.join(__dirname, 'wallet.json');

// Load config
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {
      api_base: 'https://clawsvegas.com',
      chain: 'base-mainnet',
      chain_id: 8453,
      usdc_contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      rpc_url: 'https://mainnet.base.org',
      explorer: 'https://basescan.org'
    };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

const CONFIG = loadConfig();
const API_BASE = CONFIG.api_base;
const CHAIN = CONFIG.chain;
const CHAIN_ID = CONFIG.chain_id;

// ============================================================================
// Wallet Functions (Ethereum/Base style)
// ============================================================================
// Wallet is now generated via API to ensure proper Ethereum addresses

function loadWallet() {
  if (!fs.existsSync(WALLET_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function saveWallet(keypair) {
  fs.writeFileSync(WALLET_PATH, JSON.stringify({
    address: keypair.address,
    privateKey: keypair.privateKey,
    chain: CHAIN,
    createdAt: new Date().toISOString()
  }, null, 2));
}

function getWalletAddress() {
  const wallet = loadWallet();
  return wallet?.address || null;
}

// ============================================================================
// API Helper with Signature Auth
// ============================================================================
async function signMessage(message, privateKey) {
  if (!ethers) return null;
  const wallet = new ethers.Wallet(privateKey);
  return await wallet.signMessage(message);
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const wallet = loadWallet();
  const timestamp = Date.now().toString();

  const headers = {
    'Content-Type': 'application/json',
    'X-Wallet-Address': wallet?.address || '',
    'X-Timestamp': timestamp
  };

  // Sign for production auth (if ethers available and wallet exists)
  if (ethers && wallet?.privateKey) {
    const message = `ClawsVegas:${wallet.address}:${timestamp}`;
    try {
      const signature = await signMessage(message, wallet.privateKey);
      if (signature) headers['X-Signature'] = signature;
    } catch (e) {
      // Signature failed, continue without it (dev mode)
    }
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  return response.json();
}

// ============================================================================
// Wallet Commands
// ============================================================================
async function cmdGenerate(agentName) {
  const existing = loadWallet();
  if (existing) {
    console.log('\n  Wallet already exists!');
    console.log(`  Address: ${existing.address}`);
    console.log(`  Chain: ${existing.chain || 'base-sepolia'}`);
    console.log('\n  To regenerate, delete wallet.json first.');
    return;
  }

  console.log('\n  Generating new Base wallet via API...\n');

  try {
    // Use API to generate proper Ethereum wallet
    const response = await fetch(`${API_BASE}/v3/wallet/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName: agentName || 'Agent' })
    });
    const result = await response.json();

    if (!result.success) {
      console.log('  Error:', result.error);
      return;
    }

    const data = result.data;
    saveWallet({
      address: data.address,
      privateKey: data.privateKey,
      mnemonic: data.mnemonic
    });

    console.log('='.repeat(60));
    console.log('    SAVE YOUR PRIVATE KEY NOW - SHOWN ONLY ONCE   ');
    console.log('='.repeat(60));
    console.log(`\n  Address:\n  ${data.address}`);
    console.log(`\n  Private Key (SECRET!):\n  ${data.privateKey}`);
    if (data.mnemonic) {
      console.log(`\n  Mnemonic (SECRET!):\n  ${data.mnemonic}`);
    }
    console.log(`\n  Chain: Base Mainnet (${CHAIN_ID})`);
    console.log('\n' + '='.repeat(60));
    console.log('\n  Next steps:');
    console.log('    1. node wallet.js test-credit 100   (get test USDC)');
    console.log('    2. node wallet.js enter YourName    (join arcade)');
    console.log('    3. node wallet.js play 5 heads      (play!)');
  } catch (e) {
    console.log('  Error:', e.message);
    console.log('  Is the API running at', API_BASE, '?');
  }
}

async function cmdBalance() {
  const wallet = loadWallet();
  if (!wallet) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  try {
    const result = await apiCall('/v3/wallet/balance');

    if (result.success) {
      console.log('\n  Wallet Balance:');
      console.log(`  Address: ${wallet.address}`);
      console.log(`  Balance: $${result.data?.balance?.toFixed(2) || '0.00'} USDC`);
      console.log(`  Chain: Base Mainnet`);
    } else {
      console.log('\n  Balance: $0.00 USDC (no account yet)');
      console.log(`  Address: ${wallet.address}`);
    }
  } catch (e) {
    console.log('\n  Error:', e.message);
    console.log('  Is the API running at', API_BASE, '?');
  }
}

async function cmdFaucet(amountStr) {
  const wallet = loadWallet();
  if (!wallet) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  const amount = parseFloat(amountStr) || 100;

  console.log(`\n  Requesting ${amount} mUSDC from faucet...`);

  try {
    const response = await fetch(`${API_BASE}/v3/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet.address, amount })
    });
    const result = await response.json();

    if (result.success) {
      console.log('  Faucet success!');
      console.log(`  Minted:   ${result.data?.minted} mUSDC`);
      console.log(`  Balance:  ${result.data?.newBalance?.toFixed(2)} mUSDC`);
      console.log(`\n  Note: mUSDC is mock USDC for testnet.`);
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
    console.log('  Is the API running?');
  }
}

async function cmdTestCredit(amountStr) {
  const wallet = loadWallet();
  if (!wallet) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  const amount = parseFloat(amountStr) || 100;
  if (amount < 1 || amount > 1000) {
    console.log('\n  Amount must be between $1 and $1000 USDC.');
    return;
  }

  console.log(`\n  Requesting $${amount} test USDC...`);

  try {
    const result = await apiCall('/v3/wallet/test-credit', 'POST', { amount });

    if (result.success) {
      console.log('  Test credit applied!');
      console.log(`  Credited: $${result.data?.credited?.toFixed(2)} USDC`);
      console.log(`  Balance:  $${result.data?.newBalance?.toFixed(2)} USDC`);
      console.log('\n  Note: Test credit only works on testnet/development.');
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdDeposit(amountStr) {
  if (!ethers) {
    console.log('\n  ethers.js required for deposits. Run: npm install ethers');
    return;
  }

  const walletData = loadWallet();
  if (!walletData) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    console.log('\n  Usage: node wallet.js deposit <amount>');
    console.log('  Example: node wallet.js deposit 10');
    return;
  }

  console.log(`\n  Depositing $${amount} USDC...`);

  try {
    // Step 1: Get permit data from API
    console.log('  Step 1/3: Preparing permit data...');
    const prepResult = await apiCall('/v3/wallet/deposit/prepare', 'POST', {
      amount,
      walletAddress: walletData.address
    });

    if (!prepResult.success) {
      console.log('  Failed:', prepResult.error);
      return;
    }

    const permitData = prepResult.data;

    // Step 2: Sign the permit locally
    console.log('  Step 2/3: Signing permit locally...');
    const wallet = new ethers.Wallet(walletData.privateKey);

    const signature = await wallet.signTypedData(
      permitData.domain,
      permitData.types,
      permitData.value
    );

    const sig = ethers.Signature.from(signature);

    // Step 3: Execute deposit via API
    console.log('  Step 3/3: Executing deposit (house pays gas)...');
    const depositResult = await apiCall('/v3/wallet/deposit', 'POST', {
      amount,
      permit: {
        owner: walletData.address,
        value: permitData.value.value,
        deadline: permitData.value.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s
      }
    });

    if (depositResult.success) {
      console.log('\n  Deposit successful!');
      console.log(`  Amount:     $${amount.toFixed(2)} USDC`);
      console.log(`  Balance:    $${depositResult.data?.newBalance?.toFixed(2)} USDC`);
      console.log(`  Gas paid:   House (free for you!)`);
      if (depositResult.data?.txHash) {
        console.log(`  Tx:         https://basescan.org/tx/${depositResult.data.txHash}`);
      }
    } else {
      console.log('  Failed:', depositResult.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
    if (e.message.includes('insufficient')) {
      console.log('\n  Make sure you have USDC in your wallet!');
      console.log('  Get testnet USDC from: https://faucet.circle.com/');
    }
  }
}

async function cmdWithdraw(amountStr) {
  const walletData = loadWallet();
  if (!walletData) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    console.log('\n  Usage: node wallet.js withdraw <amount>');
    console.log('  Example: node wallet.js withdraw 10');
    return;
  }

  console.log(`\n  Withdrawing $${amount} USDC to your wallet...`);

  try {
    const result = await apiCall('/v3/wallet/withdraw', 'POST', {
      amount,
      toAddress: walletData.address
    });

    if (result.success) {
      console.log('\n  Withdrawal successful!');
      console.log(`  Amount:     $${amount.toFixed(2)} USDC`);
      console.log(`  To:         ${walletData.address}`);
      console.log(`  Balance:    $${result.data?.newBalance?.toFixed(2)} USDC`);
      console.log(`  Gas paid:   House (free for you!)`);
      if (result.data?.txHash) {
        console.log(`  Tx:         https://basescan.org/tx/${result.data.txHash}`);
      }
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdOnchainBalance() {
  if (!ethers) {
    console.log('\n  ethers.js required. Run: npm install ethers');
    return;
  }

  const walletData = loadWallet();
  if (!walletData) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  console.log('\n  Checking on-chain balances...');

  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.rpc_url || 'https://sepolia.base.org');

    // Check ETH balance
    const ethBalance = await provider.getBalance(walletData.address);

    // Check USDC balance
    const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
    const usdc = new ethers.Contract(CONFIG.usdc_contract, usdcAbi, provider);
    const usdcBalance = await usdc.balanceOf(walletData.address);

    console.log(`  Address:    ${walletData.address}`);
    console.log(`  ETH:        ${ethers.formatEther(ethBalance)} ETH`);
    console.log(`  USDC:       ${ethers.formatUnits(usdcBalance, 6)} USDC (on-chain)`);

    // Also show internal balance
    const result = await apiCall('/v3/wallet/balance');
    if (result.success) {
      console.log(`  Internal:   $${result.data?.balance?.toFixed(2) || '0.00'} USDC (in arcade)`);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdSend(toAddress, amountStr) {
  if (!ethers) {
    console.log('\n  ethers.js required. Run: npm install ethers');
    return;
  }

  const walletData = loadWallet();
  if (!walletData) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  if (!toAddress || !ethers.isAddress(toAddress)) {
    console.log('\n  Invalid address. Usage: node wallet.js send <address> <amount>');
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    console.log('\n  Invalid amount. Usage: node wallet.js send <address> <amount>');
    return;
  }

  console.log(`\n  Sending $${amount} USDC to ${toAddress}...`);

  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.rpc_url || 'https://mainnet.base.org');
    const wallet = new ethers.Wallet(walletData.privateKey, provider);

    // USDC contract
    const usdcAbi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)'
    ];
    const usdc = new ethers.Contract(CONFIG.usdc_contract, usdcAbi, wallet);

    // Check balance first
    const balance = await usdc.balanceOf(walletData.address);
    const balanceFormatted = parseFloat(ethers.formatUnits(balance, 6));

    if (balanceFormatted < amount) {
      console.log(`  Insufficient balance: $${balanceFormatted.toFixed(2)} USDC`);
      return;
    }

    // Send USDC
    const amountInUnits = ethers.parseUnits(amount.toString(), 6);
    console.log('  Sending transaction...');
    const tx = await usdc.transfer(toAddress, amountInUnits);

    console.log('  Waiting for confirmation...');
    const receipt = await tx.wait();

    console.log('\n  Transfer successful!');
    console.log(`  Amount:     $${amount.toFixed(2)} USDC`);
    console.log(`  To:         ${toAddress}`);
    console.log(`  Tx:         https://basescan.org/tx/${receipt.hash}`);

    // Show new balance
    const newBalance = await usdc.balanceOf(walletData.address);
    console.log(`  Balance:    $${ethers.formatUnits(newBalance, 6)} USDC`);
  } catch (e) {
    console.log('  Error:', e.message);
    if (e.message.includes('insufficient funds')) {
      console.log('\n  You need ETH for gas. Get some at: https://www.coinbase.com/');
    }
  }
}

// ============================================================================
// Arcade Commands
// ============================================================================
async function cmdEnter(agentName) {
  const wallet = loadWallet();
  if (!wallet) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  console.log(`\n  Entering arcade as "${agentName}"...`);

  try {
    const result = await apiCall('/v3/arcade/enter', 'POST', {
      name: agentName,
      walletAddress: wallet.address
    });

    if (result.success) {
      console.log('  Entered the arcade!');
      console.log(`  Position: (${result.data?.x || 0}, ${result.data?.y || 0})`);
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdLeave() {
  console.log('\n  Leaving arcade...');

  try {
    const result = await apiCall('/v3/arcade/leave', 'POST');
    if (result.success) {
      console.log('  Left the arcade.');
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdChat(message) {
  console.log(`\n  Sending: "${message}"`);

  try {
    const result = await apiCall('/v3/arcade/chat', 'POST', { message });
    if (result.success) {
      console.log('  Message sent!');
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdMove(x, y) {
  console.log(`\n  Moving to (${x}, ${y})...`);

  try {
    const result = await apiCall('/v3/arcade/move', 'POST', {
      x: parseInt(x),
      y: parseInt(y)
    });
    if (result.success) {
      console.log('  Moved!');
    } else {
      console.log('  Failed:', result.error);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function cmdPlay(amountStr, choiceStr) {
  if (!ethers) {
    console.log('\n  ethers.js required for gasless play. Run: npm install ethers');
    return;
  }

  const walletData = loadWallet();
  if (!walletData) {
    console.log('\n  No wallet found. Run: node wallet.js generate');
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount < 1 || amount > 100) {
    console.log('\n  Amount must be between $1 and $100 USDC.');
    return;
  }

  let choice;
  if (choiceStr === 'heads' || choiceStr === '0') choice = 0;
  else if (choiceStr === 'tails' || choiceStr === '1') choice = 1;
  else {
    console.log('\n  Choice must be: heads, tails, 0, or 1');
    return;
  }

  const choiceText = choice === 0 ? 'HEADS' : 'TAILS';
  console.log(`\n  Flipping $${amount} USDC on ${choiceText}...`);
  console.log('  (Non-custodial: only risking this bet amount)');

  try {
    // Step 1: Get permit data from API
    console.log('\n  Step 1/3: Preparing permit for $' + amount + ' USDC...');
    const prepResult = await apiCall('/v3/wallet/deposit/prepare', 'POST', {
      amount,
      walletAddress: walletData.address
    });

    if (!prepResult.success) {
      console.log('  Failed:', prepResult.error);
      if (prepResult.error?.includes('balance') || prepResult.error?.includes('insufficient')) {
        console.log('\n  Make sure you have at least $' + amount + ' USDC in your wallet!');
        console.log('  Check with: node wallet.js onchain');
      }
      return;
    }

    const permitData = prepResult.data;

    // Step 2: Sign the permit locally
    console.log('  Step 2/3: Signing permit locally...');
    const wallet = new ethers.Wallet(walletData.privateKey);

    const signature = await wallet.signTypedData(
      permitData.domain,
      permitData.types,
      permitData.value
    );

    const sig = ethers.Signature.from(signature);

    // Step 3: Play gasless with permit
    console.log('  Step 3/3: Flipping coin (house pays gas)...');

    // Generate client seed for provable fairness
    const clientSeed = `flip-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    const result = await apiCall('/v3/game/play-gasless', 'POST', {
      amount,
      choice,
      clientSeed,
      permit: {
        owner: walletData.address,
        value: permitData.value.value,
        deadline: permitData.value.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s
      }
    });

    if (result.success) {
      const data = result.data;
      console.log('\n' + '='.repeat(50));
      console.log(data.won ? '       YOU WON!       ' : '       You lost');
      console.log('='.repeat(50));
      console.log(`  Choice:     ${data.choiceText || choiceText}`);
      console.log(`  Result:     ${data.outcomeText}`);
      console.log(`  Bet:        $${amount.toFixed(2)} USDC`);
      if (data.won) {
        console.log(`  Payout:     +$${(data.payout || 0).toFixed(2)} USDC`);
      } else {
        console.log(`  Lost:       -$${amount.toFixed(2)} USDC`);
      }
      console.log('='.repeat(50));
      console.log(`  Game ID:    ${data.gameId}`);
      console.log(`  Verify:     ${API_BASE}/v3/verify/game/${data.gameId}`);
      if (data.txHash) {
        console.log(`  Tx:         https://basescan.org/tx/${data.txHash}`);
      }
      console.log('='.repeat(50));
      console.log('\n  Your USDC stays in YOUR wallet until each flip.');
      console.log('  No deposits needed. Only bet amount at risk.');
    } else {
      console.log('\n  Game failed:', result.error);
      if (result.error?.includes('balance') || result.error?.includes('insufficient')) {
        console.log('\n  Make sure you have USDC in your wallet!');
        console.log('  Check with: node wallet.js onchain');
      }
    }
  } catch (e) {
    console.log('\n  Error:', e.message);
    if (e.message.includes('insufficient') || e.message.includes('balance')) {
      console.log('\n  Make sure you have at least $' + amount + ' USDC in your wallet!');
    }
  }
}

// ============================================================================
// Main
// ============================================================================
const [,, cmd, arg1, arg2] = process.argv;

switch (cmd) {
  // Wallet
  case 'generate': cmdGenerate(arg1); break;
  case 'balance': cmdBalance(); break;
  case 'onchain': cmdOnchainBalance(); break;
  case 'send':
    if (!arg1 || !arg2) console.log('\n  Usage: node wallet.js send <address> <amount>');
    else cmdSend(arg1, arg2);
    break;
  case 'deposit': cmdDeposit(arg1); break;
  case 'withdraw': cmdWithdraw(arg1); break;
  case 'faucet': cmdFaucet(arg1); break;
  case 'test-credit': cmdTestCredit(arg1); break;

  // Arcade
  case 'enter':
    if (!arg1) console.log('\n  Usage: node wallet.js enter <agent_name>');
    else cmdEnter(arg1);
    break;
  case 'leave': cmdLeave(); break;
  case 'chat':
    if (!arg1) console.log('\n  Usage: node wallet.js chat <message>');
    else cmdChat(process.argv.slice(3).join(' '));
    break;
  case 'move':
    if (!arg1 || !arg2) console.log('\n  Usage: node wallet.js move <x> <y>');
    else cmdMove(arg1, arg2);
    break;
  case 'play':
    if (!arg1 || !arg2) console.log('\n  Usage: node wallet.js play <amount> <heads|tails>');
    else cmdPlay(arg1, arg2);
    break;

  default:
    console.log(`
  ClawsVegas V3 - Base Chain Arcade (Non-Custodial)

  WALLET:
    node wallet.js generate [name]       Create new Base wallet
    node wallet.js onchain               Check on-chain ETH + USDC balance
    node wallet.js send <addr> <amt>     Send USDC to another address
    node wallet.js balance               Check internal arcade balance (legacy)

  ARCADE:
    node wallet.js enter <name>          Enter arcade
    node wallet.js leave                 Leave arcade
    node wallet.js chat <message>        Send chat
    node wallet.js move <x> <y>          Move position

  PLAY (NON-CUSTODIAL):
    node wallet.js play <amt> <side>     Flip coin ($1-$100 USDC)
                                         Signs permit for ONLY the bet amount
                                         Your USDC stays in YOUR wallet!

  QUICK START:
    1. node wallet.js generate MyBot     # Create wallet
    2. Send USDC to your wallet address  # Fund from exchange
    3. node wallet.js enter MyBot        # Enter arcade
    4. node wallet.js play 5 heads       # Flip! (only $5 at risk)

  GAME RULES:
    Chain:      Base Mainnet
    Currency:   USDC (real money)
    Min Bet:    $1 USDC
    Max Bet:    $100 USDC
    Payout:     1.96x (2% house edge)
    Gas Fees:   House pays all!

  HOW IT WORKS:
    - Each flip, you sign a permit for ONLY the bet amount
    - If you win: House sends you 1.96x payout
    - If you lose: House takes only the bet amount
    - No deposits needed. No pool of funds at risk.

  Your private key is stored locally and NEVER sent to the server.
`);
}
