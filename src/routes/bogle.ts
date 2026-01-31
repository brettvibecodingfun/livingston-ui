import express from 'express';
import { Query } from '../lib/types';
import { toStructuredQuery } from '../server';
import { runQuery } from '../lib/sql';

export function setupBogleRoutes(app: express.Application) {
  /**
   * API endpoint for submitting Bogle game scores (proxies to backend service)
   */
  app.post('/api/bogle/scores', async (req, res) => {
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

      const response = await fetch(`${backendUrl}/api/bogle/scores`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(req.body)
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying score submission:', error);
      return res.status(500).json({
        error: 'Failed to submit score.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching Bogle game info by date (proxies to backend service)
   */
  app.get('/api/bogle/games', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      const date = req.query['date'] as string;
      
      if (!date) {
        return res.status(400).json({
          error: 'Date query parameter is required',
          details: 'Date must be in YYYY-MM-DD format'
        });
      }
      
      if (!backendUrl) {
        return res.status(500).json({
          error: 'Backend service URL not configured',
          details: 'BACKEND_SERVICE environment variable is not set'
        });
      }

      const response = await fetch(`${backendUrl}/api/bogle/games?date=${encodeURIComponent(date)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying game info request:', error);
      return res.status(500).json({
        error: 'Failed to fetch game info.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching Bogle scores by date (proxies to backend service)
   */
  app.get('/api/bogle/scores', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      const date = req.query['date'] as string;
      
      if (!date) {
        return res.status(400).json({
          error: 'Date query parameter is required',
          details: 'Date must be in YYYY-MM-DD format'
        });
      }
      
      if (!backendUrl) {
        return res.status(500).json({
          error: 'Backend service URL not configured',
          details: 'BACKEND_SERVICE environment variable is not set'
        });
      }

      const response = await fetch(`${backendUrl}/api/bogle/scores?date=${encodeURIComponent(date)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      return res.status(response.status).json(data);
    } catch (error) {
      console.error('Error proxying scores request:', error);
      return res.status(500).json({
        error: 'Failed to fetch scores.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching daily Bogle game data
   * Accepts question as query parameter, or fetches from games API if not provided
   */
  app.get('/api/bogle/daily-game', async (req, res) => {
    try {
      const backendUrl = process.env['BACKEND_SERVICE'];
      let question: string;
      let query: Query;

      // Check if querySchema is provided as query parameter
      const querySchemaParam = req.query['querySchema'] as string;
      
      if (querySchemaParam) {
        // Use the provided querySchema instead of parsing the question
        try {
          query = JSON.parse(querySchemaParam);
          // Get question from query if available, or use a default
          question = req.query['question'] as string || 'Daily game';
        } catch (e) {
          console.error('Error parsing querySchema:', e);
          return res.status(400).json({
            error: 'Invalid querySchema format',
            details: 'querySchema must be valid JSON'
          });
        }
      } else {
        // Fallback: Parse question using toStructuredQuery
        // Check if question is provided as query parameter
        const questionParam = req.query['question'] as string;
        
        if (questionParam) {
          // Use the provided question
          question = decodeURIComponent(questionParam);
        } else {
          // Fallback: Get question from games API if not provided
          if (!backendUrl) {
            return res.status(500).json({
              error: 'Backend service URL not configured',
              details: 'BACKEND_SERVICE environment variable is not set'
            });
          }

          // Get today's date in Central Time (YYYY-MM-DD format)
          const now = new Date();
          const centralFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          const parts = centralFormatter.formatToParts(now);
          const year = parts.find(p => p.type === 'year')?.value;
          const month = parts.find(p => p.type === 'month')?.value;
          const day = parts.find(p => p.type === 'day')?.value;
          const centralDate = `${year}-${month}-${day}`;

          // Get game info from backend service
          const gameInfoResponse = await fetch(`${backendUrl}/api/bogle/games?date=${encodeURIComponent(centralDate)}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (!gameInfoResponse.ok) {
            throw new Error(`Failed to fetch game info: ${gameInfoResponse.statusText}`);
          }

          const gameInfo = await gameInfoResponse.json();
          
          if (!gameInfo.success || !gameInfo.data || !gameInfo.data.gameQuestion) {
            throw new Error('Invalid game info response');
          }

          question = gameInfo.data.gameQuestion;
        }

        // Parse the question into a structured query
        query = await toStructuredQuery(question);
      }
      
      // Ensure limit is set to 10 for Bogle games
      if (!query.limit || query.limit > 10) {
        query.limit = 10;
      }

      // Add minimum games filter for Bogle (players must have played at least 15 games)
      // Exception: Skip min_games requirement for clutch queries
      if (!query.clutch) {
        if (!query.filters) {
          query.filters = {};
        }
        // Only set min_games if not already set and not a clutch query
        if (query.filters.min_games == null) {
          query.filters.min_games = 15;
        }
      }

      const rows = await runQuery(query);
      
      // Transform the results to match the expected format
      const players = rows.map((row, index) => {
        // Normalize name for photo path (replace spaces with underscores)
        const photoName = row.full_name.replace(/\s+/g, '_');
        
        return {
          rank: index + 1,
          fullName: row.full_name,
          team: row.team || '',
          ppg: row.ppg || 0,
          apg: row.apg || 0,
          rpg: row.rpg || 0,
          spg: row.spg || 0,
          bpg: row.bpg || 0,
          fgm: row.fgm_pg || 0, // Field goals made per game
          fga: row.fga_pg || 0, // Field goals attempted per game
          fg_pct: row.fg_pct || 0,
          ftm: row.ftm || 0,
          fta: row.fta || 0,
          ft_pct: row.ft_pct || 0,
          tpm: row.tpm || 0,
          tpa: row.tpa || 0,
          three_pct: row.three_pct || 0,
          net_rating: row.net_rating || null,
          photoName: photoName
        };
      });

      const response = {
        question: question,
        players: players
      };

      return res.json(response);
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch daily game data.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
