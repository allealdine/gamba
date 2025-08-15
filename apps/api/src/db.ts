// db.ts
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://localhost:5432/gamba',
});

export const db = client;

export const setupDb = async () => {
  await client.connect();

  const query = `
    CREATE TABLE IF NOT EXISTS signatures (
      signature TEXT PRIMARY KEY,
      block_time BIGINT
    );

    CREATE TABLE IF NOT EXISTS pool_changes (
      signature TEXT PRIMARY KEY,
      block_time BIGINT,
      token TEXT,
      pool TEXT,
      "user" TEXT,
      amount BIGINT,
      lp_supply BIGINT,
      post_liquidity BIGINT,
      usd_per_unit DOUBLE PRECISION
    );

    CREATE TABLE IF NOT EXISTS settled_games (
      signature TEXT PRIMARY KEY,
      block_time BIGINT,
      metadata TEXT,
      nonce TEXT,
      client_seed TEXT,
      rng_seed TEXT,
      next_rng_seed_hashed TEXT,
      bet TEXT,
      bet_length INTEGER,
      result_number INTEGER,
      creator TEXT,
      "user" TEXT,
      token TEXT,
      pool TEXT,
      wager BIGINT,
      payout BIGINT,
      multiplier_bps INTEGER,
      creator_fee BIGINT,
      pool_fee BIGINT,
      gamba_fee BIGINT,
      jackpot_fee BIGINT,
      jackpot BIGINT,
      pool_liquidity BIGINT,
      usd_per_unit DOUBLE PRECISION
    );

    -- Indexes for faster queries
    CREATE INDEX IF NOT EXISTS idx_signatures_block_time ON signatures(block_time);
    CREATE INDEX IF NOT EXISTS idx_settled_games_block_time ON settled_games(block_time);
    CREATE INDEX IF NOT EXISTS idx_pool_changes_block_time ON pool_changes(block_time);
  `;

  await client.query(query);
};

export const all = async (query: string, params?: any[]): Promise<any[]> => {
  const result = await client.query(query, params);
  return result.rows;
};

export const get = async (query: string, params?: any[]): Promise<any> => {
  const result = await client.query(query, params);
  return result.rows[0] || null;
};
