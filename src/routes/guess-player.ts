import express from 'express';
import { pool } from '../lib/db';
import { DEFAULT_SEASON } from '../lib/constants';

export function setupGuessPlayerRoutes(app: express.Application) {
  /**
   * API endpoint for fetching a random player for the guess game
   */
  app.get('/api/guess-player/random', async (req, res) => {
    try {
      // Parse filter query parameters
      const filters: {
        ppgMin?: number;
        ppgMax?: number;
        apgMin?: number;
        apgMax?: number;
        rpgMin?: number;
        rpgMax?: number;
        ageMin?: number;
        ageMax?: number;
        team?: string;
      } = {};
      
      if (req.query['ppgMin']) filters['ppgMin'] = parseFloat(req.query['ppgMin'] as string);
      if (req.query['ppgMax']) filters['ppgMax'] = parseFloat(req.query['ppgMax'] as string);
      if (req.query['apgMin']) filters['apgMin'] = parseFloat(req.query['apgMin'] as string);
      if (req.query['apgMax']) filters['apgMax'] = parseFloat(req.query['apgMax'] as string);
      if (req.query['rpgMin']) filters['rpgMin'] = parseFloat(req.query['rpgMin'] as string);
      if (req.query['rpgMax']) filters['rpgMax'] = parseFloat(req.query['rpgMax'] as string);
      if (req.query['ageMin']) filters['ageMin'] = parseInt(req.query['ageMin'] as string);
      if (req.query['ageMax']) filters['ageMax'] = parseInt(req.query['ageMax'] as string);
      if (req.query['team']) filters['team'] = req.query['team'] as string;

      // Build WHERE conditions
      const params: any[] = [DEFAULT_SEASON];
      let paramIndex = 1;
      const whereConditions: string[] = [
        `sa.season = $${paramIndex++}`,
        `sa.points IS NOT NULL`,
        `sa.games_played > 0`
      ];

      if (filters['ppgMin'] != null) {
        params.push(filters['ppgMin']);
        whereConditions.push(`sa.points >= $${paramIndex++}`);
      }
      if (filters['ppgMax'] != null) {
        params.push(filters['ppgMax']);
        whereConditions.push(`sa.points <= $${paramIndex++}`);
      }
      if (filters['apgMin'] != null) {
        params.push(filters['apgMin']);
        whereConditions.push(`sa.assists >= $${paramIndex++}`);
      }
      if (filters['apgMax'] != null) {
        params.push(filters['apgMax']);
        whereConditions.push(`sa.assists <= $${paramIndex++}`);
      }
      if (filters['rpgMin'] != null) {
        params.push(filters['rpgMin']);
        whereConditions.push(`sa.rebounds >= $${paramIndex++}`);
      }
      if (filters['rpgMax'] != null) {
        params.push(filters['rpgMax']);
        whereConditions.push(`sa.rebounds <= $${paramIndex++}`);
      }
      if (filters['ageMin'] != null) {
        params.push(filters['ageMin']);
        whereConditions.push(`p.age >= $${paramIndex++}`);
      }
      if (filters['ageMax'] != null) {
        params.push(filters['ageMax']);
        whereConditions.push(`p.age <= $${paramIndex++}`);
      }
      if (filters['team']) {
        params.push(filters['team'].toUpperCase());
        whereConditions.push(`UPPER(t.abbreviation) = $${paramIndex++}`);
      }

      // Get a random player with their stats from season_averages
      const randomPlayerQuery = `
        SELECT
          p.id AS player_id,
          sa.season,
          p.full_name,
          sa.points AS ppg,
          sa.rebounds AS rpg,
          sa.assists AS apg,
          sa.steals AS spg,
          sa.blocks AS bpg,
          sa.fg_pct,
          sa.three_pct,
          sa.ft_pct,
          sa.tpm,
          sa.tpa,
          sa.ftm,
          sa.fta,
          sa.off_rating,
          sa.def_rating,
          sa.net_rating,
          sa.pie,
          sa.e_pace,
          sa.fga_pg,
          sa.fgm_pg,
          sa.ts_pct,
          sa.ast_pct,
          sa.efg_pct,
          sa.reb_pct,
          sa.usg_pct,
          sa.dreb_pct,
          sa.oreb_pct,
          sa.ast_ratio,
          sa.e_tov_pct,
          sa.e_usg_pct
        FROM season_averages sa
        INNER JOIN players p ON sa.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY RANDOM()
        LIMIT 1
      `;
      
      const result = await pool.query(randomPlayerQuery, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No players found matching the filters' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch random player.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for submitting Guess Player leaderboard scores (proxies to backend service)
   */
  app.post('/api/guess-player-leaderboard', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      const apiAuthKey = process.env['API_AUTH_KEY'];
      
      if (!backendUrl) {
        return res.status(500).json({
          error: 'Backend service URL not configured',
          details: 'BACKEND_SERVICE environment variable is not set'
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add authentication header from .env file (backend checks x-api-key or authorization header)
      if (apiAuthKey) {
        headers['x-api-key'] = apiAuthKey;
      }

      const response = await fetch(`${backendUrl}/api/guess-player-leaderboard`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(req.body)
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying guess player leaderboard request:', error);
      return res.status(500).json({
        error: 'Failed to submit guess player score',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching Guess Player leaderboard by player ID and season (proxies to backend service)
   */
  app.get('/api/guess-player-leaderboard/player', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      const playerIdSeason = req.query['playerIdSeason'] as string;
      
      if (!playerIdSeason) {
        return res.status(400).json({
          error: 'playerIdSeason query parameter is required',
          details: 'playerIdSeason must be in format "playerId-season" (e.g., "246-2026")'
        });
      }
      
      if (!backendUrl) {
        return res.status(500).json({
          error: 'Backend service URL not configured',
          details: 'BACKEND_SERVICE environment variable is not set'
        });
      }

      const response = await fetch(`${backendUrl}/api/guess-player-leaderboard/player?playerIdSeason=${encodeURIComponent(playerIdSeason)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying guess player leaderboard request:', error);
      return res.status(500).json({
        error: 'Failed to fetch leaderboard.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
