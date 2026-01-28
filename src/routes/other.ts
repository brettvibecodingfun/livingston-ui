import express from 'express';
import { pool } from '../lib/db';
import { DEFAULT_SEASON } from '../lib/constants';

export function setupOtherRoutes(app: express.Application) {
  /**
   * API endpoint for fetching previous night's games and box scores
   */
  app.get('/api/box-scores/previous-night', async (req, res) => {
    try {
      // Calculate yesterday's date in Central Time
      const now = new Date();
      // Get current date components in Central Time
      const centralFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = centralFormatter.formatToParts(now);
      const year = parseInt(parts.find(p => p.type === 'year')!.value);
      const month = parseInt(parts.find(p => p.type === 'month')!.value);
      const day = parseInt(parts.find(p => p.type === 'day')!.value);
      
      // Create date in Central Time and calculate yesterday
      const centralDate = new Date(year, month - 1, day);
      centralDate.setDate(centralDate.getDate() - 1);
      const yesterdayDateStr = `${centralDate.getFullYear()}-${String(centralDate.getMonth() + 1).padStart(2, '0')}-${String(centralDate.getDate()).padStart(2, '0')}`;
      
      // Get all games from previous night (yesterday in Central Time)
      const gamesQuery = `
        SELECT DISTINCT
          g.id AS game_id,
          g.date AS game_date,
          ht.name AS home_team_name,
          ht.abbreviation AS home_team_abbr,
          at.name AS away_team_name,
          at.abbreviation AS away_team_abbr,
          g.home_score,
          g.away_score
        FROM games g
        INNER JOIN teams ht ON g.home_team_id = ht.id
        INNER JOIN teams at ON g.away_team_id = at.id
        WHERE g.date = $1
        ORDER BY g.date DESC, g.id
      `;
      
      const gamesResult = await pool.query(gamesQuery, [yesterdayDateStr]);
      const games = gamesResult.rows;
      
      // For each game, get the box scores
      const gamesWithBoxScores = await Promise.all(
        games.map(async (game) => {
          const boxScoresQuery = `
            SELECT 
              bs.id,
              p.full_name AS player_name,
              p.first_name,
              p.last_name,
              t.name AS team_name,
              t.abbreviation AS team_abbr,
              COALESCE(bs.minutes, 0) AS minutes,
              bs.points,
              bs.assists,
              bs.rebounds,
              bs.steals,
              bs.blocks,
              bs.turnovers,
              bs.fgm,
              bs.fga,
              bs.tpm,
              bs.tpa,
              bs.ftm,
              bs.fta
            FROM box_scores bs
            INNER JOIN players p ON bs.player_id = p.id
            INNER JOIN teams t ON bs.team_id = t.id
            WHERE bs.game_id = $1
            ORDER BY t.abbreviation, bs.points DESC NULLS LAST
          `;
          
          const boxScoresResult = await pool.query(boxScoresQuery, [game.game_id]);
          
          return {
            ...game,
            boxScores: boxScoresResult.rows
          };
        })
      );
      
      return res.json({ games: gamesWithBoxScores });
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch previous night\'s games.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching standings
   */
  app.get('/api/standings/:season', async (req, res) => {
    try {
      const season = parseInt(req.params.season, 10);
      
      if (isNaN(season)) {
        return res.status(400).json({ error: 'Invalid season parameter' });
      }

      // Get standings for the season, ordered by conference and rank
      // Note: Using teams.conference to determine East/West
      const standingsQuery = `
        SELECT
          s.team_id,
          t.abbreviation AS team,
          s.conference_rank AS seed,
          s.wins,
          s.losses,
          CASE 
            WHEN t.conference = 'East' THEN 'east'
            WHEN t.conference = 'West' THEN 'west'
            ELSE 'unknown'
          END AS conference
        FROM standings s
        INNER JOIN teams t ON s.team_id = t.id
        WHERE s.season = $1
        ORDER BY t.conference, s.conference_rank ASC
      `;

      const result = await pool.query(standingsQuery, [season]);
      const allStandings = result.rows;

      // Calculate games back for each team
      const eastStandings = allStandings
        .filter((s: any) => s.conference === 'east')
        .map((team: any, index: number) => {
          const leader = allStandings.find((s: any) => s.conference === 'east' && s.seed === 1);
          const gamesBack = leader && index > 0
            ? ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2
            : 0;
          return {
            teamId: team.team_id,
            team: team.team,
            seed: team.seed,
            wins: team.wins,
            losses: team.losses,
            gamesBack: gamesBack === 0 ? '-' : gamesBack.toFixed(1)
          };
        });

      const westStandings = allStandings
        .filter((s: any) => s.conference === 'west')
        .map((team: any, index: number) => {
          const leader = allStandings.find((s: any) => s.conference === 'west' && s.seed === 1);
          const gamesBack = leader && index > 0
            ? ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2
            : 0;
          return {
            teamId: team.team_id,
            team: team.team,
            seed: team.seed,
            wins: team.wins,
            losses: team.losses,
            gamesBack: gamesBack === 0 ? '-' : gamesBack.toFixed(1)
          };
        });

      return res.json({
        east: eastStandings,
        west: westStandings
      });
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch standings.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * API endpoint for fetching player information
   */
  app.get('/api/player/:playerName', async (req, res) => {
    try {
      const playerName = decodeURIComponent(req.params.playerName);
      
      // Query player information with current season stats
      const playerQuery = `
        SELECT
          p.id,
          p.full_name,
          p.first_name,
          p.last_name,
          p.college,
          p.country,
          p.draft_year,
          p.age,
          p.height,
          p.weight,
          p.position,
          p.base_salary,
          t.abbreviation AS team,
          t.name AS team_name,
          sa.games_played,
          sa.minutes AS minutes,
          sa.points AS ppg,
          sa.assists AS apg,
          sa.rebounds AS rpg,
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
          sa.pie
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN season_averages sa ON sa.player_id = p.id AND sa.season = $2
        WHERE LOWER(p.full_name) = LOWER($1)
        LIMIT 1
      `;
      
      const result = await pool.query(playerQuery, [playerName, DEFAULT_SEASON]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch player information.',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

}
