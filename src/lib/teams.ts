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

// Map team metrics to database column names
function getTeamMetricColumn(metric: string): string | null {
  const metricMap: Record<string, string> = {
    'team_ppg': 'points',
    'team_fgm': 'fgm',
    'team_fga': 'fga',
    'team_fg_pct': 'fg_pct',
    'team_fta': 'fta',
    'team_ftm': 'ftm',
    'team_ft_pct': 'ft_pct',
    'team_fg3a': 'fg3a',
    'team_fg3m': 'fg3m',
    'team_fg3_pct': 'fg3_pct',
    'team_pace': 'pace',
    'team_efg_pct': 'efg_pct',
    'team_ts_pct': 'ts_pct',
    'team_def_rating': 'defensive_rating',
    'team_off_rating': 'offensive_rating',
    'team_net_rating': 'net_rating',
  };
  return metricMap[metric] || null;
}

export async function runTeamQuery(q: Query): Promise<TeamData[]> {
  const season = q.season;
  
  // Check if this is a team stats query (has team_* metric)
  const isTeamStatsQuery = q.metric && q.metric.startsWith('team_');
  
  if (isTeamStatsQuery && q.metric) {
    return await runTeamStatsQuery(q);
  }
  
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

async function runTeamStatsQuery(q: Query): Promise<TeamData[]> {
  const season = q.season;
  const limit = Math.min(q.limit ?? 10, 30);
  const metric = q.metric!;
  const metricColumn = getTeamMetricColumn(metric);
  
  if (!metricColumn) {
    throw new Error(`Invalid team metric: ${metric}`);
  }
  
  let params: any[] = [season, 'regular']; // season and season_type
  let paramIndex = 2;
  const whereConditions: string[] = [`tsa.season = $1`, `tsa.season_type = $2`];
  
  // Add team filter if specified
  if (q.team) {
    if (Array.isArray(q.team) && q.team.length > 0) {
      paramIndex++;
      params.push(q.team);
      whereConditions.push(`t.abbreviation = ANY($${paramIndex})`);
    } else if (typeof q.team === 'string') {
      paramIndex++;
      params.push(q.team.toUpperCase());
      whereConditions.push(`t.abbreviation = $${paramIndex}`);
    }
  }
  
  // Add min/max metric value filters
  if (q.filters?.min_metric_value != null) {
    paramIndex++;
    params.push(q.filters.min_metric_value);
    whereConditions.push(`tsa.${metricColumn} >= $${paramIndex}`);
  }
  if (q.filters?.max_metric_value != null) {
    paramIndex++;
    params.push(q.filters.max_metric_value);
    whereConditions.push(`tsa.${metricColumn} <= $${paramIndex}`);
  }
  
  // For defensive rating, lower is better, so default to ASC unless explicitly set
  // For offensive rating and net rating, higher is better, so default to DESC
  let defaultOrderDirection = 'desc';
  if (metric === 'team_def_rating') {
    defaultOrderDirection = 'asc'; // Lower defensive rating is better
  }
  
  const orderDirection = q.order_direction || defaultOrderDirection;
  const orderBy = `tsa.${metricColumn} ${orderDirection.toUpperCase()}`;
  
  // Build the query
  const query = `
    SELECT
      tsa.team_id,
      t.abbreviation AS team,
      t.name AS team_name,
      s.wins,
      s.losses,
      CASE 
        WHEN t.conference = 'East' THEN 'east'
        WHEN t.conference = 'West' THEN 'west'
        ELSE 'unknown'
      END AS conference,
      s.conference_rank AS seed,
      tsa.points,
      tsa.fgm,
      tsa.fga,
      tsa.fg_pct,
      tsa.fta,
      tsa.ftm,
      tsa.ft_pct,
      tsa.fg3a,
      tsa.fg3m,
      tsa.fg3_pct,
      tsa.pace,
      tsa.efg_pct,
      tsa.ts_pct,
      tsa.defensive_rating,
      tsa.offensive_rating,
      tsa.net_rating
    FROM team_season_averages tsa
    INNER JOIN teams t ON tsa.team_id = t.id
    LEFT JOIN standings s ON s.team_id = t.id AND s.season = tsa.season
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${++paramIndex}
  `;
  
  params.push(limit);
  
  const result = await pool.query(query, params);
  
  return result.rows.map((row: any) => ({
    teamId: row.team_id,
    team: row.team,
    teamName: row.team_name,
    wins: row.wins || 0,
    losses: row.losses || 0,
    winPct: (row.wins && row.losses) ? row.wins / (row.wins + row.losses) : 0,
    conference: row.conference || 'unknown',
    seed: row.seed,
    points: row.points ? parseFloat(row.points) : undefined,
    fgm: row.fgm ? parseFloat(row.fgm) : undefined,
    fga: row.fga ? parseFloat(row.fga) : undefined,
    fgPct: row.fg_pct ? parseFloat(row.fg_pct) : undefined,
    fta: row.fta ? parseFloat(row.fta) : undefined,
    ftm: row.ftm ? parseFloat(row.ftm) : undefined,
    ftPct: row.ft_pct ? parseFloat(row.ft_pct) : undefined,
    fg3a: row.fg3a ? parseFloat(row.fg3a) : undefined,
    fg3m: row.fg3m ? parseFloat(row.fg3m) : undefined,
    fg3Pct: row.fg3_pct ? parseFloat(row.fg3_pct) : undefined,
    pace: row.pace ? parseFloat(row.pace) : undefined,
    efgPct: row.efg_pct ? parseFloat(row.efg_pct) : undefined,
    tsPct: row.ts_pct ? parseFloat(row.ts_pct) : undefined,
    defensiveRating: row.defensive_rating ? parseFloat(row.defensive_rating) : undefined,
    offensiveRating: row.offensive_rating ? parseFloat(row.offensive_rating) : undefined,
    netRating: row.net_rating ? parseFloat(row.net_rating) : undefined,
  }));
}
