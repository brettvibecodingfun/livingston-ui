import { pool } from './db';
import { Query } from './types';

export interface TeamStanding {
  teamId: number;
  team: string;
  teamName: string;
  wins: number;
  losses: number;
  winPct: number;
  conference: string;
  seed?: number;
}

export interface TeamPlayer {
  fullName: string;
  team: string;
  ppg: number;
  apg?: number;
  rpg?: number;
  gamesPlayed: number;
}

export interface TeamData {
  teamId: number;
  team: string;
  teamName: string;
  wins: number;
  losses: number;
  winPct: number;
  conference: string;
  seed?: number;
  topScorers?: TeamPlayer[];
}

export async function runTeamQuery(q: Query): Promise<TeamData[]> {
  const season = q.season;
  
  // If a specific team is mentioned, or if no limit is specified (asking for "the best team" singular),
  // return just that team (limit = 1) to get detailed view with top scorers
  // Otherwise, use the requested limit for multiple teams
  const limit = (q.team || !q.limit) ? 1 : Math.min(q.limit, 30);
  
  let params: any[] = [season];
  let paramIndex = 1;
  const whereConditions: string[] = [`s.season = $1`];

  // Add team filter if specified
  if (q.team) {
    if (Array.isArray(q.team) && q.team.length > 0) {
      // Multiple teams: use ANY clause
      paramIndex++;
      params.push(q.team);
      whereConditions.push(`t.abbreviation = ANY($${paramIndex})`);
    } else if (typeof q.team === 'string') {
      // Single team: use equality
      paramIndex++;
      params.push(q.team.toUpperCase());
      whereConditions.push(`t.abbreviation = $${paramIndex}`);
    }
  }

  // Get standings for the season, optionally filtered by team
  const standingsQuery = `
    SELECT
      s.team_id,
      t.abbreviation AS team,
      t.name AS team_name,
      s.wins,
      s.losses,
      CASE 
        WHEN t.conference = 'East' THEN 'east'
        WHEN t.conference = 'West' THEN 'west'
        ELSE 'unknown'
      END AS conference,
      s.conference_rank AS seed
    FROM standings s
    INNER JOIN teams t ON s.team_id = t.id
    WHERE ${whereConditions.join(' AND ')}
  `;

  const standingsResult = await pool.query(standingsQuery, params);
  const allStandings: TeamStanding[] = standingsResult.rows.map((row: any) => ({
    teamId: row.team_id,
    team: row.team,
    teamName: row.team_name,
    wins: row.wins,
    losses: row.losses,
    winPct: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : 0,
    conference: row.conference,
    seed: row.seed
  }));

  // Determine sorting
  const orderDirection = q.order_direction || 'desc'; // 'desc' for best record (highest win pct), 'asc' for worst
  const sortedStandings = [...allStandings].sort((a, b) => {
    if (orderDirection === 'desc') {
      // Best first: higher win pct, then more wins, then fewer losses
      if (b.winPct !== a.winPct) {
        return b.winPct - a.winPct;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.losses - b.losses;
    } else {
      // Worst first: lower win pct, then fewer wins, then more losses
      if (a.winPct !== b.winPct) {
        return a.winPct - b.winPct;
      }
      if (a.wins !== b.wins) {
        return a.wins - b.wins;
      }
      return b.losses - a.losses;
    }
  });

  // Apply limit
  const limitedStandings = sortedStandings.slice(0, limit);

  // If asking for a single team (limit is 1), get top 5 scorers for that team
  if (limit === 1 && limitedStandings.length === 1) {
    const team = limitedStandings[0];
    
    // Get top 5 scorers for this team
    const topScorersQuery = `
      SELECT
        p.full_name,
        t.abbreviation AS team,
        sa.points AS ppg,
        sa.assists AS apg,
        sa.rebounds AS rpg,
        sa.games_played
      FROM season_averages sa
      INNER JOIN players p ON sa.player_id = p.id
      INNER JOIN teams t ON p.team_id = t.id
      WHERE sa.season = $1
        AND t.abbreviation = $2
        AND sa.games_played >= 10
        AND sa.minutes >= 10
      ORDER BY sa.points DESC
      LIMIT 5
    `;

    const scorersResult = await pool.query(topScorersQuery, [season, team.team]);
    const topScorers: TeamPlayer[] = scorersResult.rows.map((row: any) => ({
      fullName: row.full_name,
      team: row.team,
      ppg: parseFloat(row.ppg) || 0,
      apg: row.apg ? parseFloat(row.apg) : undefined,
      rpg: row.rpg ? parseFloat(row.rpg) : undefined,
      gamesPlayed: row.games_played
    }));

    return [{
      ...team,
      topScorers
    }];
  }

  // For multiple teams, just return the standings
  return limitedStandings.map(team => ({
    ...team,
    topScorers: undefined
  }));
}
