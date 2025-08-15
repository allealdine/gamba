// sync.ts
import {
  GambaTransaction,
  PROGRAM_ID,
  parseTransactionEvents,
} from 'gamba-core-v2';
import { all, db, get, setupDb } from './db';
import { getPrices } from './price';
import { createBatches, getResultNumber } from './utils';
import { connection } from './web3';

interface SignatureObject {
  signature: string;
  block_time: number;
}

/**
 * Recursively fetch signatures until "earliest" is reached
 */
const getSignatures = async (
  before?: SignatureObject,
  until?: SignatureObject,
  batch: SignatureObject[] = []
): Promise<SignatureObject[]> => {
  console.log(
    'Searching signatures before %d until %d Batch: (%d)',
    before?.block_time,
    until?.block_time,
    batch.length
  );

  const signatures = await connection.getSignaturesForAddress(
    PROGRAM_ID,
    {
      limit: 1000,
      before: before?.signature,
      until: until?.signature,
    },
    'confirmed'
  );

  if (!signatures.length) {
    return batch;
  }

  const sigs = signatures.map(x => ({
    signature: x.signature,
    block_time: x.blockTime!,
  }));

  const nextBatch = [...batch, ...sigs].sort(
    (a, b) => a.block_time - b.block_time
  );
  const nextBefore = nextBatch[0];

  if (nextBefore === before) {
    return nextBatch;
  }

  await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay to avoid rate limits
  return getSignatures(nextBefore, until, nextBatch);
};

/**
 * Returns unprocessed signatures (not yet in settled_games or pool_changes)
 */
const getRemainingSignatures = async () => {
  const latestGame = await get(
    'SELECT block_time FROM settled_games ORDER BY block_time DESC LIMIT 1'
  );
  const latestPoolChange = await get(
    'SELECT block_time FROM pool_changes ORDER BY block_time DESC LIMIT 1'
  );

  const latest = Math.max(
    latestGame?.block_time || 0,
    latestPoolChange?.block_time || 0
  );

  console.log('Latest blocktime', latest);

  const result = await all('SELECT * FROM signatures WHERE block_time >= $1', [
    latest,
  ]);

  return result as SignatureObject[];
};

/**
 * Efficiently insert batch of events
 */
const storeEvents = async (
  events: (GambaTransaction<'GameSettled'> | GambaTransaction<'PoolChange'>)[]
) => {
  if (events.length === 0) return;

  const tokenMints = [...new Set(events.map(e => e.data.tokenMint.toString()))];
  const prices = await getPrices(tokenMints);

  const client = db; // pg Client

  // Batch insert for pool_changes
  const poolChangeValues = events
    .filter((e): e is GambaTransaction<'PoolChange'> => e.name === 'PoolChange')
    .map(e => {
      const tokenStr = e.data.tokenMint.toString();
      return [
        e.signature,
        Math.floor(e.time / 1000),
        e.data.action.Deposit ? 'deposit' : 'withdraw',
        tokenStr,
        e.data.pool.toString(),
        e.data.user.toString(),
        e.data.amount.toString(),
        e.data.lpSupply.toString(),
        e.data.postLiquidity.toString(),
        prices[tokenStr]?.usdPerUnit || null,
      ];
    });

  // Batch insert for settled_games
  const gameValues = await Promise.all(
    events
      .filter(
        (e): e is GambaTransaction<'GameSettled'> => e.name === 'GameSettled'
      )
      .map(async e => {
        const tokenStr = e.data.tokenMint.toString();
        return [
          e.signature,
          Math.floor(e.time / 1000),
          e.data.metadata,
          e.data.nonce.toString(),
          e.data.clientSeed,
          e.data.rngSeed,
          e.data.nextRngSeedHashed,
          JSON.stringify(e.data.bet),
          e.data.bet.length,
          await getResultNumber(
            e.data.rngSeed,
            e.data.clientSeed,
            e.data.nonce
          ),
          e.data.creator.toString(),
          e.data.user.toString(),
          tokenStr,
          e.data.pool.toString(),
          e.data.wager.toString(),
          e.data.payout.toString(),
          e.data.multiplierBps.toString(),
          e.data.creatorFee.toString(),
          e.data.poolFee.toString(),
          e.data.gambaFee.toString(),
          e.data.jackpotFee.toString(),
          e.data.jackpotPayoutToUser.toString(),
          e.data.poolLiquidity.toString(),
          prices[tokenStr]?.usdPerUnit || null,
        ];
      })
  );

  // Insert pool changes
  if (poolChangeValues.length > 0) {
    const placeholders = poolChangeValues
      .map((_, i) => {
        const offset = i * 10;
        return `($${1 + offset},$${2 + offset},$${3 + offset},$${4 + offset},$${
          5 + offset
        },$${6 + offset},$${7 + offset},$${8 + offset},$${9 + offset},$${
          10 + offset
        })`;
      })
      .join(',');

    const flatValues = poolChangeValues.flat();

    await client.query(
      `INSERT INTO pool_changes (signature, block_time, action, token, pool, "user", amount, lp_supply, post_liquidity, usd_per_unit)
       VALUES ${placeholders}
       ON CONFLICT (signature) DO NOTHING`,
      flatValues
    );
  }

  // Insert game events
  if (gameValues.length > 0) {
    const placeholders = gameValues
      .map((_, i) => {
        const offset = i * 23;
        return Array.from({ length: 23 }, (_, j) => `$${1 + offset + j}`).join(
          ','
        );
      })
      .join('),(');

    const flatValues = gameValues.flat();

    await client.query(
      `INSERT INTO settled_games (
         signature, block_time, metadata, nonce, client_seed, rng_seed,
         next_rng_seed_hashed, bet, bet_length, result_number,
         creator, "user", token, pool, wager, payout,
         multiplier_bps, creator_fee, pool_fee, gamba_fee,
         jackpot_fee, jackpot, pool_liquidity, usd_per_unit
       ) VALUES (${placeholders})
       ON CONFLICT (signature) DO NOTHING`,
      flatValues
    );
  }

  console.log(
    `Stored ${gameValues.length} games and ${poolChangeValues.length} pool changes`
  );
};

/**
 * Fetch and parse transactions in batches
 */
const fetchAndStoreEventsFromSignatures = async (signatures: string[]) => {
  const signatureBatches = createBatches(signatures, 100);

  for (const batch of signatureBatches) {
    const attempt = async (
      retries = 0
    ): Promise<
      (GambaTransaction<'GameSettled'> | GambaTransaction<'PoolChange'>)[]
    > => {
      try {
        const transactions = await connection.getParsedTransactions(batch, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });

        const events: (
          | GambaTransaction<'GameSettled'>
          | GambaTransaction<'PoolChange'>
        )[] = [];

        for (const tx of transactions) {
          if (!tx || !tx.meta?.logMessages) continue;

          const blockTime = tx.blockTime ?? Math.floor(Date.now() / 1000);
          const parsedEvents = parseTransactionEvents(tx.meta.logMessages);

          for (const ev of parsedEvents) {
            const signature = tx.transaction.signatures[0];
            const time = blockTime * 1000;

            if (ev.name === 'GameSettled') {
              events.push({
                signature,
                time,
                name: 'GameSettled',
                data: ev.data as any,
              });
            } else if (ev.name === 'PoolChange') {
              events.push({
                signature,
                time,
                name: 'PoolChange',
                data: ev.data as any,
              });
            }
          }
        }

        return events;
      } catch (err) {
        if (retries < 5) {
          console.log(`Retry ${retries + 1}/5 after error:`, err);
          // Exponential backoff with longer delays for rate limits
          const delay = err.message?.includes('429')
            ? 5000 * (retries + 1)
            : 1000 * (retries + 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          return attempt(retries + 1);
        }
        console.error('Failed to fetch batch after 5 retries', err);
        return [];
      }
    };

    const events = await attempt();
    if (events.length > 0) {
      console.log('Fetched %d events, storing...', events.length);
      await storeEvents(events); // ✅ Await this!
    }
  }
};

/**
 * Main sync loop
 */
const search = async () => {
  // Step 1: Sync any remaining unprocessed signatures
  const remainingSignatures = await getRemainingSignatures();
  console.log(
    'Remaining signatures to process: %d',
    remainingSignatures.length
  );

  if (remainingSignatures.length > 0) {
    const sigs = remainingSignatures.map(x => x.signature);
    await fetchAndStoreEventsFromSignatures(sigs);
  }

  // Step 2: Fetch latest stored signature
  const lastStoredSignature = await get(
    'SELECT * FROM signatures ORDER BY block_time DESC LIMIT 1'
  );

  // Step 3: Fetch new on-chain signatures since last one
  const newSignatures = await getSignatures(
    undefined,
    lastStoredSignature as any
  );
  console.log('Found %d new signatures', newSignatures.length);

  if (newSignatures.length > 0) {
    // Insert new signatures
    const insertQuery = `
      INSERT INTO signatures (signature, block_time)
      VALUES ($1, $2)
      ON CONFLICT (signature) DO NOTHING
    `;

    for (const sig of newSignatures) {
      await db.query(insertQuery, [sig.signature, sig.block_time]);
    }

    console.log('Stored %d new signatures', newSignatures.length);

    // Process the newly stored signatures
    await fetchAndStoreEventsFromSignatures(
      newSignatures.map(s => s.signature)
    );
  }

  // Step 4: Wait and repeat
  await new Promise(resolve => setTimeout(resolve, 60000)); // Increased delay to 1 minute
  await search();
};

export async function sync() {
  try {
    await setupDb();
    console.log('✅ Database ready');
    await search();
  } catch (err) {
    console.error('❌ Sync error', err);
    setTimeout(() => sync(), 5000);
  }
}
