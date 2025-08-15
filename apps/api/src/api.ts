// api.ts
import apicache from 'apicache';
import express from 'express';
import { z } from 'zod';
import { all, get } from './db';
import { validate } from './utils';

const cache = apicache.middleware;
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const api = express.Router();

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Gamba API v2',
      version: '2.0.0',
      description: 'API for Gamba gaming platform with PostgreSQL backend',
    },
    servers: [
      {
        url: 'http://localhost:4949',
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/api.ts'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
api.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /:
 *   get:
 *     summary: API root
 *     description: Redirects to API documentation
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 docs:
 *                   type: string
 */
api.get('/', (req, res) => {
  res.json({
    message: 'Gamba API v3',
    docs: '/docs',
  });
});

// Remove slow() — just for testing
// const slow = () => (_, __, next) => setTimeout(next, 1000)

export const daysAgo = (daysAgo: number) => {
  const now = new Date();
  const then = new Date(now);
  then.setDate(now.getDate() - daysAgo);
  then.setHours(1, 0, 0, 0);
  return then.getTime();
};

/**
 * Schema validations
 */
const poolChangesSchema = z.object({
  query: z.object({
    pool: z.string().optional(),
  }),
});

const volumeSchema = z.object({
  query: z.object({
    pool: z.string(),
  }),
});

const ratioSchema = z.object({
  query: z.object({
    pool: z.string(),
  }),
});

const statsSchema = z.object({
  query: z.object({
    creator: z.string().optional(),
    startTime: z.string().optional(),
  }),
});

const settledGamesSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    onlyJackpots: z.string().optional(),
    creator: z.string().optional(),
    pool: z.string().optional(),
    token: z.string().optional(),
    user: z.string().optional(),
    orderBy: z.enum(['multiplier', 'usd_profit', 'time']).optional(),
    sorting: z.enum(['ASC', 'DESC']).optional(),
    itemsPerPage: z.string().optional(),
  }),
});

const playerSchema = z.object({
  query: z.object({
    user: z.string(),
    creator: z.string().optional(),
    token: z.string().optional(),
  }),
});

const topPlatformsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    days: z.string().optional(),
    sortBy: z.enum(['usd_volume', 'usd_revenue']).optional(),
  }),
});

const tokensSchema = z.object({
  query: z.object({
    creator: z.string().optional(),
  }),
});

const playersSchema = z.object({
  query: z.object({
    creator: z.string().optional(),
    token: z.string().optional(),
    pool: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
    sortBy: z
      .enum(['usd_volume', 'usd_profit', 'token_volume', 'token_profit'])
      .optional(),
    startTime: z.string().optional(),
  }),
});

const dailyUsdSchema = z.object({
  query: z.object({
    creator: z.string().optional(),
  }),
});

/**
 * Safe orderBy mapping to prevent SQL injection
 */
const ORDER_BY_MAPPING: Record<string, string> = {
  time: 'block_time',
  multiplier: 'multiplier_bps',
  usd_profit: '(payout - wager + jackpot) * usd_per_unit',
};

/**
 * @swagger
 * /events/poolChanges:
 *   get:
 *     summary: Get pool changes events
 *     description: Retrieve recent pool changes for a specific pool
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         required: true
 *         description: Pool address
 *     responses:
 *       200:
 *         description: Pool changes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       signature:
 *                         type: string
 *                       action:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       user:
 *                         type: string
 *                       token:
 *                         type: string
 *                       pool:
 *                         type: string
 *                       lp_supply:
 *                         type: number
 *                       post_liquidity:
 *                         type: number
 *                       time:
 *                         type: number
 *       400:
 *         description: Missing pool parameter
 *       500:
 *         description: Internal server error
 */
api.get(
  '/events/poolChanges',
  validate(poolChangesSchema),
  async (req, res) => {
    try {
      const { pool } = req.query;

      if (!pool) {
        return res.status(400).send({ error: 'Missing "pool" parameter' });
      }

      const results = await all(
        `
        SELECT
          signature,
          action,
          amount,
          "user",
          token,
          pool,
          lp_supply,
          post_liquidity,
          block_time * 1000 AS time
        FROM pool_changes
        WHERE pool = $1
        ORDER BY block_time DESC
        LIMIT 20;
      `,
        [pool]
      );

      res.json({ results });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /events/settledGames:
 *   get:
 *     summary: Get settled games
 *     description: Retrieve paginated list of settled games with filtering options
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *         description: Page number (default 0)
 *       - in: query
 *         name: itemsPerPage
 *         schema:
 *           type: string
 *         description: Items per page (1-200, default 10)
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [multiplier, usd_profit, time]
 *         description: Sort field (default time)
 *       - in: query
 *         name: sorting
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort direction (default DESC)
 *       - in: query
 *         name: onlyJackpots
 *         schema:
 *           type: string
 *         description: Filter for jackpot wins only
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         description: Filter by pool address
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Filter by token address
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *         description: Filter by user address
 *     responses:
 *       200:
 *         description: Settled games retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       signature:
 *                         type: string
 *                       wager:
 *                         type: number
 *                       payout:
 *                         type: number
 *                       usd_wager:
 *                         type: number
 *                       usd_profit:
 *                         type: number
 *                       profit:
 *                         type: number
 *                       user:
 *                         type: string
 *                       creator:
 *                         type: string
 *                       token:
 *                         type: string
 *                       jackpot:
 *                         type: number
 *                       multiplier:
 *                         type: number
 *                       time:
 *                         type: number
 *                 total:
 *                   type: number
 *       403:
 *         description: Invalid itemsPerPage value
 *       500:
 *         description: Internal server error
 */
api.get(
  '/events/settledGames',
  cache('5 minutes'),
  validate(settledGamesSchema),
  async (req, res) => {
    try {
      const {
        page = '0',
        itemsPerPage = '10',
        orderBy = 'time',
        sorting = 'DESC',
        onlyJackpots,
        creator,
        pool,
        token,
        user,
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limit = parseInt(itemsPerPage as string, 10);
      const offset = pageNum * limit;

      if (limit < 1 || limit > 200) {
        return res
          .status(403)
          .json({ error: 'itemsPerPage must be between 1 and 200' });
      }

      const orderByCol = ORDER_BY_MAPPING[orderBy as string] || 'block_time';
      const sortDir = sorting === 'ASC' ? 'ASC' : 'DESC';

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (user) {
        conditions.push(`"user" = $${paramIndex++}`);
        params.push(user);
      }
      if (creator) {
        conditions.push(`creator = $${paramIndex++}`);
        params.push(creator);
      }
      if (pool) {
        conditions.push(`pool = $${paramIndex++}`);
        params.push(pool);
      }
      if (token) {
        conditions.push(`token = $${paramIndex++}`);
        params.push(token);
      }
      if (onlyJackpots === 'true') {
        conditions.push(`jackpot > 0`);
      }

      // Exclude bot wallet
      conditions.push(`"user" != $${paramIndex}`);
      params.push('8RY8Ga5j34dJb1W3aXLemFLvxJ9cQSAYQVn6Qr8pmUYT');
      paramIndex++;

      const whereClause = conditions.length
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

      const countQuery = `SELECT COUNT(*) AS total FROM settled_games ${whereClause}`;
      const { total } = await get(countQuery, params);

      const resultsQuery = `
        SELECT
          signature,
          wager,
          payout,
          wager * usd_per_unit AS usd_wager,
          (payout - wager + jackpot) * usd_per_unit AS usd_profit,
          (payout - wager + jackpot) AS profit,
          "user",
          creator,
          token,
          jackpot,
          multiplier_bps * 0.0001 AS multiplier,
          block_time * 1000 AS time
        FROM settled_games
        ${whereClause}
        ORDER BY ${orderByCol} ${sortDir}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const results = await all(resultsQuery, params);

      res.json({ results, total });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /player:
 *   get:
 *     summary: Get player statistics
 *     description: Retrieve comprehensive statistics for a specific player
 *     tags: [Player]
 *     parameters:
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *         required: true
 *         description: Player wallet address
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Filter by token address
 *     responses:
 *       200:
 *         description: Player statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 games_played:
 *                   type: number
 *                 usd_profit:
 *                   type: number
 *                 usd_creator_fees_paid:
 *                   type: number
 *                 usd_pool_fees_paid:
 *                   type: number
 *                 usd_dao_fees_paid:
 *                   type: number
 *                 usd_volume:
 *                   type: number
 *                 games_won:
 *                   type: number
 *                 randomness_score:
 *                   type: number
 *                 first_bet_time:
 *                   type: number
 *       404:
 *         description: Player not found
 *       500:
 *         description: Internal server error
 */
api.get(
  '/player',
  cache('15 minutes'),
  validate(playerSchema),
  async (req, res) => {
    try {
      const { user, creator, token } = req.query;
      const params: any[] = [];
      let paramIndex = 1;

      const conditions: string[] = [`"user" = $${paramIndex++}`];
      params.push(user);

      if (creator) {
        conditions.push(`creator = $${paramIndex++}`);
        params.push(creator);
      }
      if (token) {
        conditions.push(`token = $${paramIndex++}`);
        params.push(token);
      }

      const whereClause = 'WHERE ' + conditions.join(' AND ');

      const firstBet = await get(
        `SELECT block_time * 1000 AS time FROM settled_games ${whereClause} ORDER BY block_time ASC LIMIT 1`,
        params
      );

      const result = await get(
        `
        SELECT
          "user",
          COUNT(*) AS games_played,
          SUM(result_number % 1000) AS total_result_mod_1000,
          SUM((payout - wager + jackpot) * usd_per_unit) AS usd_profit,
          SUM(creator_fee * usd_per_unit) AS usd_creator_fees_paid,
          SUM(pool_fee * usd_per_unit) AS usd_pool_fees_paid,
          SUM(gamba_fee * usd_per_unit) AS usd_dao_fees_paid,
          SUM(wager * usd_per_unit) AS usd_volume,
          COUNT(CASE WHEN payout >= wager THEN 1 END) AS games_won
        FROM settled_games
        ${whereClause}
      `,
        params
      );

      if (!result?.user) {
        return res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
      }

      const { user: _, total_result_mod_1000, ...rest } = result;
      const randomness_score =
        1 - Math.abs(0.5 - total_result_mod_1000 / rest.games_played / 1000);

      res.json({
        ...rest,
        randomness_score,
        first_bet_time: firstBet?.time ?? 0,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /ratio:
 *   get:
 *     summary: Get LP price ratio over time
 *     description: Retrieve LP price ratio data for a pool over the last 30 days
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         required: true
 *         description: Pool address
 *     responses:
 *       200:
 *         description: LP ratio data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   pool_liquidity:
 *                     type: number
 *                   lp_supply:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/ratio',
  cache('60 minutes'),
  validate(ratioSchema),
  async (req, res) => {
    try {
      const { pool } = req.query;
      const from = daysAgo(30);
      const until = Date.now();

      const rows = await all(
        `
        SELECT
          TO_CHAR(TO_TIMESTAMP(block_time), 'YYYY-MM-DD HH24:00') AS date,
          AVG(pool_liquidity) AS pool_liquidity,
          AVG(lp_supply) AS lp_supply
        FROM settled_games
        WHERE pool = $1
          AND block_time * 1000 BETWEEN $2 AND $3
        GROUP BY date
        ORDER BY date
      `,
        [pool, from, until]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /chart/plays:
 *   get:
 *     summary: Get daily play count chart
 *     description: Retrieve daily play count data for the last 300 days
 *     tags: [Charts]
 *     responses:
 *       200:
 *         description: Daily play count data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   total_volume:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get('/chart/plays', cache('60 minutes'), async (req, res) => {
  try {
    const rows = await all(
      `
      SELECT
        TO_CHAR(TO_TIMESTAMP(block_time), 'YYYY-MM-DD 00:00') AS date,
        COUNT(*) AS total_volume
      FROM settled_games
      WHERE block_time * 1000 BETWEEN $1 AND $2
      GROUP BY date
      ORDER BY date
    `,
      [daysAgo(300), Date.now()]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /daily:
 *   get:
 *     summary: Get daily volume in token units
 *     description: Retrieve daily volume data for a pool over the last 30 days
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         required: true
 *         description: Pool address
 *     responses:
 *       200:
 *         description: Daily volume data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   total_volume:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/daily',
  cache('60 minutes'),
  validate(volumeSchema),
  async (req, res) => {
    try {
      const { pool } = req.query;
      const rows = await all(
        `
        SELECT
          TO_CHAR(TO_TIMESTAMP(block_time), 'YYYY-MM-DD 00:00') AS date,
          SUM(wager) AS total_volume
        FROM settled_games
        WHERE pool = $1
          AND block_time * 1000 BETWEEN $2 AND $3
        GROUP BY date
        ORDER BY date
      `,
        [pool, daysAgo(30), Date.now()]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /total:
 *   get:
 *     summary: Get total volume for pool
 *     description: Retrieve total volume for a specific pool
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         required: true
 *         description: Pool address
 *     responses:
 *       200:
 *         description: Total volume retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 volume:
 *                   type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/total',
  cache('60 minutes'),
  validate(volumeSchema),
  async (req, res) => {
    try {
      const { pool } = req.query;
      const result = await get(
        `
        SELECT SUM(wager) AS volume
        FROM settled_games
        WHERE pool = $1
          AND block_time * 1000 BETWEEN $2 AND $3
      `,
        [pool, 0, Date.now()]
      );
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /platforms-by-pool:
 *   get:
 *     summary: Get platforms by pool
 *     description: Retrieve platforms (creators) that have used a specific pool
 *     tags: [Platforms]
 *     parameters:
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         required: true
 *         description: Pool address
 *     responses:
 *       200:
 *         description: Platforms by pool retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   creator:
 *                     type: string
 *                   volume:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/platforms-by-pool',
  cache('30 minutes'),
  validate(volumeSchema),
  async (req, res) => {
    try {
      const { pool } = req.query;
      const rows = await all(
        `
        SELECT creator, SUM(wager) AS volume
        FROM settled_games
        WHERE pool = $1
          AND block_time * 1000 BETWEEN $2 AND $3
        GROUP BY creator
        ORDER BY volume DESC
      `,
        [pool, 0, Date.now()]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /platforms:
 *   get:
 *     summary: Get top platforms by USD volume
 *     description: Retrieve top creators/platforms sorted by USD volume or revenue
 *     tags: [Platforms]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *         description: Number of results (1-100, default 10)
 *       - in: query
 *         name: days
 *         schema:
 *           type: string
 *         description: Number of days to look back (1-365, default 7)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [usd_volume, usd_revenue]
 *         description: Sort by volume or revenue (default usd_volume)
 *     responses:
 *       200:
 *         description: Top platforms retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   creator:
 *                     type: string
 *                   usd_volume:
 *                     type: number
 *                   usd_revenue:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/platforms',
  cache('60 minutes'),
  validate(topPlatformsSchema),
  async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days ?? 7), 1), 365);
      const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 100);
      const sortBy =
        req.query.sortBy === 'usd_revenue' ? 'usd_revenue' : 'usd_volume';

      const rows = await all(
        `
        SELECT
          creator,
          SUM(wager * usd_per_unit) AS usd_volume,
          SUM(creator_fee * usd_per_unit) AS usd_revenue
        FROM settled_games
        WHERE block_time * 1000 BETWEEN $1 AND $2
        GROUP BY creator
        ORDER BY ${sortBy} DESC
        LIMIT $3
      `,
        [daysAgo(days), Date.now(), limit]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /tokens:
 *   get:
 *     summary: Get top tokens by creator
 *     description: Retrieve top tokens used by a specific creator or globally
 *     tags: [Tokens]
 *     parameters:
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *     responses:
 *       200:
 *         description: Top tokens retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   token:
 *                     type: string
 *                   usd_volume:
 *                     type: number
 *                   volume:
 *                     type: number
 *                   num_plays:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/tokens',
  cache('30 minutes'),
  validate(tokensSchema),
  async (req, res) => {
    try {
      const { creator } = req.query;
      const params: any[] = [];
      let paramIndex = 1;

      let condition = '';
      if (creator) {
        condition = `AND creator = $${paramIndex++}`;
        params.push(creator);
      }

      const rows = await all(
        `
        SELECT
          token,
          SUM(wager * usd_per_unit) AS usd_volume,
          SUM(wager) AS volume,
          COUNT(*) AS num_plays
        FROM settled_games
        WHERE block_time * 1000 BETWEEN $${paramIndex} AND $${paramIndex + 1}
        ${condition}
        GROUP BY token
        ORDER BY usd_volume DESC
      `,
        [...params, daysAgo(30), Date.now()]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /players:
 *   get:
 *     summary: Get top players
 *     description: Retrieve top players with various filtering and sorting options
 *     tags: [Players]
 *     parameters:
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *       - in: query
 *         name: pool
 *         schema:
 *           type: string
 *         description: Filter by pool address
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Filter by token address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *         description: Number of results (1-5000, default 5)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: string
 *         description: Offset for pagination (default 0)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [usd_volume, usd_profit, token_volume, token_profit]
 *         description: Sort field (default usd_profit)
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *         description: Start time filter (timestamp)
 *     responses:
 *       200:
 *         description: Top players retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 players:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: string
 *                       creator_fees_usd:
 *                         type: number
 *                       usd_profit:
 *                         type: number
 *                       usd_volume:
 *                         type: number
 *                       token_volume:
 *                         type: number
 *                       token_profit:
 *                         type: number
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Internal server error
 */
api.get(
  '/players',
  cache('30 minutes'),
  validate(playersSchema),
  async (req, res) => {
    try {
      const {
        creator,
        pool,
        token,
        limit = '5',
        offset = '0',
        sortBy = 'usd_profit',
        startTime = '0',
      } = req.query;

      const limitNum = Math.min(
        Math.max(parseInt(limit as string, 10), 1),
        5000
      );
      const offsetNum = Math.max(parseInt(offset as string, 10), 0);
      const startTimeNum = parseInt(startTime as string, 10);

      if (
        ['token_volume', 'token_profit'].includes(sortBy as string) &&
        !token &&
        !pool
      ) {
        return res
          .status(400)
          .json({ error: `token or pool required to sort by ${sortBy}` });
      }

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (creator) {
        conditions.push(`creator = $${paramIndex++}`);
        params.push(creator);
      }
      if (pool) {
        conditions.push(`pool = $${paramIndex++}`);
        params.push(pool);
      }
      if (token) {
        conditions.push(`token = $${paramIndex++}`);
        params.push(token);
      }
      conditions.push(
        `block_time * 1000 BETWEEN $${paramIndex++} AND $${paramIndex++}`
      );
      params.push(startTimeNum, Date.now());

      const whereClause = conditions.length
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

      const selectTokenFields =
        token || pool
          ? 'SUM(wager) AS token_volume, SUM(payout - wager + jackpot) AS token_profit,'
          : '';

      const orderMap: Record<string, string> = {
        usd_profit: 'usd_profit',
        usd_volume: 'usd_volume',
        token_profit: 'token_profit',
        token_volume: 'token_volume',
      };
      const orderBy = orderMap[sortBy as string] || 'usd_profit';

      const query = `
        SELECT
          ${selectTokenFields}
          "user",
          SUM(creator_fee * usd_per_unit) AS creator_fees_usd,
          SUM((payout - wager + jackpot) * usd_per_unit) AS usd_profit,
          SUM(wager * usd_per_unit) AS usd_volume
        FROM settled_games
        ${whereClause}
        GROUP BY "user"
        ORDER BY ${orderBy} DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limitNum, offsetNum);

      const players = await all(query, params);

      res.json({ players });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Get API status
 *     description: Check if the API is syncing with the blockchain
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 syncing:
 *                   type: boolean
 *       500:
 *         description: Internal server error
 */
api.get('/status', async (req, res) => {
  try {
    const earliestSignature = await get(`
      SELECT signature FROM signatures ORDER BY block_time ASC LIMIT 1
    `);

    // Replace with your actual genesis signature
    const GENESIS_SIGNATURE =
      '42oXxibwpHeoX8ZrEhzbfptNAT8wGhpbRA1j7hrnALwZB4ERB1wCFpMTHjMzsfJHeEKxgPEiwwgCWa9fStip8rra';

    res.json({
      syncing:
        !earliestSignature || earliestSignature.signature !== GENESIS_SIGNATURE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /stats:
 *   get:
 *     summary: Get platform statistics
 *     description: Retrieve comprehensive platform statistics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *         description: Start time filter (timestamp)
 *     responses:
 *       200:
 *         description: Platform statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 players:
 *                   type: number
 *                 usd_volume:
 *                   type: number
 *                 plays:
 *                   type: number
 *                 creators:
 *                   type: number
 *                 revenue_usd:
 *                   type: number
 *                 player_net_profit_usd:
 *                   type: number
 *                 active_players:
 *                   type: number
 *                 first_bet_time:
 *                   type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/stats',
  cache('60 minutes'),
  validate(statsSchema),
  async (req, res) => {
    try {
      const { creator } = req.query;
      const startTime = Number(req.query.startTime ?? 0);
      const now = Date.now();

      const params: any[] = [];
      let paramIndex = 1;

      const creatorCondition = creator ? `AND creator = $${paramIndex++}` : '';
      params.push(creator);

      const timeCondition = `AND block_time * 1000 BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(startTime, now);

      const baseCondition = `1 ${creatorCondition} ${timeCondition}`;

      const activePlayers = await get(
        `
        SELECT COUNT(DISTINCT "user") AS active_players
        FROM settled_games
        WHERE ${baseCondition}
          AND block_time * 1000 > $${paramIndex}
      `,
        [...params, Date.now() - 60 * 60 * 1000]
      );

      const totalPlayers = await get(
        `SELECT COUNT(DISTINCT "user") AS players FROM settled_games WHERE ${baseCondition}`,
        params
      );

      const firstBet = await get(
        `SELECT block_time * 1000 AS time FROM settled_games WHERE ${baseCondition} ORDER BY block_time ASC LIMIT 1`,
        params
      );

      const volume = await get(
        `SELECT COUNT(*) AS plays, SUM(wager * usd_per_unit) AS usd_volume FROM settled_games WHERE ${baseCondition}`,
        params
      );

      const totalCreators = await get(
        `SELECT COUNT(DISTINCT creator) AS creators FROM settled_games WHERE ${baseCondition}`,
        params
      );

      const revenue = await get(
        `
        SELECT
          SUM(creator_fee * usd_per_unit) AS revenue_usd,
          SUM((payout - wager - gamba_fee - pool_fee) * usd_per_unit) AS player_net_profit_usd
        FROM settled_games
        WHERE 1
          ${creator ? 'AND creator = $1' : ''}
          AND block_time * 1000 BETWEEN $2 AND $3
      `,
        creator ? [creator, daysAgo(99999), now] : [daysAgo(99999), now]
      );

      res.json({
        players: totalPlayers.players,
        usd_volume: volume.usd_volume,
        plays: volume.plays,
        creators: totalCreators.creators,
        revenue_usd: revenue.revenue_usd,
        player_net_profit_usd: revenue.player_net_profit_usd,
        active_players: activePlayers.active_players,
        first_bet_time: firstBet?.time ?? 0,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /chart/daily-usd:
 *   get:
 *     summary: Get daily USD volume chart
 *     description: Retrieve daily USD volume data for the last 6 days
 *     tags: [Charts]
 *     parameters:
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *     responses:
 *       200:
 *         description: Daily USD volume data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   total_volume:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get(
  '/chart/daily-usd',
  cache('60 minutes'),
  validate(dailyUsdSchema),
  async (req, res) => {
    try {
      const { creator } = req.query;
      const params: any[] = [];
      let paramIndex = 1;

      const conditions = creator ? `AND creator = $${paramIndex++}` : '';
      params.push(creator);

      const rows = await all(
        `
        SELECT
          TO_CHAR(TO_TIMESTAMP(block_time), 'YYYY-MM-DD 00:00') AS date,
          SUM(wager * usd_per_unit) AS total_volume
        FROM settled_games
        WHERE 1 ${conditions}
          AND block_time * 1000 BETWEEN $${paramIndex++} AND $${paramIndex}
        GROUP BY date
        ORDER BY date
      `,
        [...params, daysAgo(6), Date.now()]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /chart/dao-usd:
 *   get:
 *     summary: Get daily DAO fees chart
 *     description: Retrieve daily DAO fees data for the last 6 months
 *     tags: [Charts]
 *     parameters:
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *         description: Filter by creator address
 *     responses:
 *       200:
 *         description: Daily DAO fees data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   total_volume:
 *                     type: number
 *       500:
 *         description: Internal server error
 */
api.get('/chart/dao-usd', cache('60 minutes'), async (req, res) => {
  try {
    const { creator } = req.query as { creator?: string };
    const params: any[] = [];
    let paramIndex = 1;

    const conditions = creator ? `AND creator = $${paramIndex++}` : '';
    params.push(creator);

    const rows = await all(
      `
      SELECT
        TO_CHAR(TO_TIMESTAMP(block_time), 'YYYY-MM-DD 00:00') AS date,
        SUM(gamba_fee * usd_per_unit) AS total_volume
      FROM settled_games
      WHERE 1 ${conditions}
        AND block_time * 1000 BETWEEN $${paramIndex++} AND $${paramIndex}
      GROUP BY date
      ORDER BY date
    `,
      [...params, daysAgo(30 * 6), Date.now()]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Internal server error' });
  }
});

export default api;
