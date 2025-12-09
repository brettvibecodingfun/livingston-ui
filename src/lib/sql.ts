import { pool } from './db';
import { Query } from './types';
import { METRIC_COL_MAP } from './constants';

// Map position groups to database position values
function mapPositionGroup(positionGroup: string): string {
  switch (positionGroup) {
    case 'guards':
      return 'G';
    case 'forwards':
      return 'F';
    case 'centers':
      return 'C';
    default:
      return '';
  }
}

export async function runQuery(q: Query, playerNames?: string[]): Promise<any[]> {
  const limit = Math.min(q.limit ?? 10, 25);
  const params: any[] = [];
  let i = 0;
  // Prioritize players from query filters, then fall back to playerNames parameter
  const effectivePlayerNames = (q.filters?.players?.length ? q.filters.players : playerNames) ?? [];
  const normalizedPlayerNames = effectivePlayerNames.map((name) => name.toLowerCase());
  const hasPlayerFilter = normalizedPlayerNames.length > 0;
  const draftRange = q.filters?.draft_year_range;
  const hasDraftFilter = !!draftRange && (draftRange.gte != null || draftRange.lte != null);
  const ageRange = q.filters?.age_range;
  const hasAgeFilter = !!ageRange && (ageRange.gte != null || ageRange.lte != null);
  const collegeFilter = q.filters?.colleges?.map((c) => c.toLowerCase()) ?? [];
  const hasCollegeFilter = collegeFilter.length > 0;
  const countryFilter = q.filters?.countries ?? [];
  const hasCountryFilter = countryFilter.length > 0;

  // All queries use season_averages table for accurate stats
  // This includes: compare, rank, and leaders tasks
  // Never use the leaders table - always query season_averages directly
  
  // Special handling for compare tasks with specific players
  if (q.task === 'compare' && hasPlayerFilter) {
    // Compare query using season_averages table
    params.push(q.season); i++; // $1 season

    const whereCompare: string[] = [
      `sa.season = $1`,
    ];

    if (normalizedPlayerNames.length > 0) {
      // Use LIKE for case-insensitive partial matching to handle name variations
      const nameConditions = normalizedPlayerNames.map((name) => {
        params.push(`%${name}%`); i++;
        const paramIdx = i;
        return `LOWER(p.full_name) LIKE $${paramIdx}`;
      });
      whereCompare.push(`(${nameConditions.join(' OR ')})`);
    }

    if (hasCountryFilter) {
      params.push(countryFilter); i++;
      whereCompare.push(`LOWER(p.country) = ANY($${i})`);
    }

    const sql = `
      SELECT
        p.full_name,
        t.abbreviation AS team,
        sa.games_played,
        sa.points AS ppg,
        sa.assists AS apg,
        sa.rebounds AS rpg,
        sa.steals AS spg,
        sa.blocks AS bpg,
        sa.fg_pct,
        sa.three_pct,
        sa.ft_pct
      FROM season_averages sa
      INNER JOIN players p ON sa.player_id = p.id
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE ${whereCompare.join(' AND ')}
      ORDER BY p.full_name ASC
    `;

    console.log('Compare SQL (season_averages):', sql);
    console.log('Compare params:', params);
    console.log('Searching for players:', normalizedPlayerNames);
    const result = await pool.query(sql, params);
    console.log(`Found ${result.rows.length} players in season_averages`);
    if (result.rows.length === 0 && normalizedPlayerNames.length > 0) {
      // Try to see if players exist in the database at all
      const checkSql = `
        SELECT p.full_name, p.id
        FROM players p
        WHERE ${normalizedPlayerNames.map((name, idx) => {
          const paramIdx = idx + 1;
          return `LOWER(p.full_name) LIKE $${paramIdx}`;
        }).join(' OR ')}
      `;
      const checkParams = normalizedPlayerNames.map(name => `%${name}%`);
      const checkResult = await pool.query(checkSql, checkParams);
      console.log(`Players found in database:`, checkResult.rows.map(r => r.full_name));
    }
    return result.rows;
  }

  // Main query path: All rank/leaders/lookup queries use season_averages table
  // This includes queries like "best scorers on the knicks" (leaders task with team filter)
  params.push(q.season); i++; // $1 season

  const whereAgg: string[] = [
    `sa.season = $1`,
  ];

  // Add team filter if specified (e.g., "best scorers on the knicks")
  if (q.team) { params.push(q.team); i++; whereAgg.push(`t.abbreviation = $${i}`); }
  if (q.position) {
    const position = mapPositionGroup(q.position);
    if (position) {
      params.push(position); i++; 
      whereAgg.push(`p.position = $${i}`);
    }
  }

  if (draftRange?.gte != null) { params.push(draftRange.gte); i++; whereAgg.push(`p.draft_year >= $${i}`); }
  if (draftRange?.lte != null) { params.push(draftRange.lte); i++; whereAgg.push(`p.draft_year <= $${i}`); }

  if (ageRange?.gte != null) { params.push(ageRange.gte); i++; whereAgg.push(`p.age >= $${i}`); }
  if (ageRange?.lte != null) { params.push(ageRange.lte); i++; whereAgg.push(`p.age <= $${i}`); }

  if (hasCollegeFilter) { params.push(collegeFilter); i++; whereAgg.push(`LOWER(p.college) = ANY($${i})`); }

  if (hasCountryFilter) {
    const normalizedCountries = countryFilter.map((c) => c.toLowerCase());
    params.push(normalizedCountries); i++;
    whereAgg.push(`LOWER(p.country) = ANY($${i})`);
  }

  if (normalizedPlayerNames.length > 0) {
    // Use LIKE for case-insensitive partial matching to handle name variations
    const nameConditions = normalizedPlayerNames.map((name) => {
      params.push(`%${name}%`); i++;
      const paramIdx = i;
      return `LOWER(p.full_name) LIKE $${paramIdx}`;
    });
    whereAgg.push(`(${nameConditions.join(' OR ')})`);
  }

  // Add minimum metric value filter (e.g., "scoring over 20 points per game")
  if (q.filters?.min_metric_value != null) {
    const metricCol = METRIC_COL_MAP[q.metric] || 'points_per_game';
    const seasonAvgCol = metricCol === 'points_per_game' ? 'points' :
                        metricCol === 'assists_per_game' ? 'assists' :
                        metricCol === 'rebounds_per_game' ? 'rebounds' :
                        metricCol === 'steals_per_game' ? 'steals' :
                        metricCol === 'blocks_per_game' ? 'blocks' :
                        metricCol === 'field_goal_percentage' ? 'fg_pct' :
                        metricCol === 'three_point_percentage' ? 'three_pct' :
                        metricCol === 'free_throw_percentage' ? 'ft_pct' : 'points';
    params.push(q.filters.min_metric_value); i++;
    whereAgg.push(`sa.${seasonAvgCol} >= $${i}`);
  }

  // For compare tasks, don't order by metric - just return the requested players
  // For other tasks, order by the metric or by age if specified
  let orderByClause: string;
  let finalLimit: number;
  const orderByAge = q.filters?.order_by_age;
  
  if (q.task === 'compare' && hasPlayerFilter) {
    // For comparisons, order by player name to ensure consistent ordering
    // Don't limit - we want all requested players
    orderByClause = `ORDER BY full_name ASC`;
    finalLimit = 100; // High limit to ensure we get all requested players
  } else if (orderByAge) {
    // Order by age (oldest first for desc, youngest first for asc)
    orderByClause = `ORDER BY p.age ${orderByAge.toUpperCase()} NULLS LAST`;
    finalLimit = limit;
  } else {
    // Order column mapping based on computed aliases below
    const orderColumnMap: Record<string, string> = {
      ppg: 'ppg', apg: 'apg', rpg: 'rpg', spg: 'spg', bpg: 'bpg',
      fg_pct: 'fg_pct', three_pct: 'three_pct', ft_pct: 'ft_pct', bpm: 'ppg', // fallback
      all: 'ppg' // For "all" metric, order by ppg as default
    };
    const orderBy = orderColumnMap[q.metric] || 'ppg';
    orderByClause = `ORDER BY ${orderBy} DESC NULLS LAST`;
    finalLimit = limit;
  }

  // Query season_averages table for all rank/leaders/lookup tasks
  // This ensures accurate, up-to-date statistics from the player stats table
  // Include age in SELECT if we're ordering by age
  const selectAge = orderByAge ? ', p.age' : '';
  const sql = `
    SELECT
      p.full_name,
      t.abbreviation AS team,
      sa.games_played,
      sa.points AS ppg,
      sa.assists AS apg,
      sa.rebounds AS rpg,
      sa.steals AS spg,
      sa.blocks AS bpg,
      sa.fg_pct,
      sa.three_pct,
      sa.ft_pct${selectAge}
    FROM season_averages sa
    INNER JOIN players p ON sa.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE ${whereAgg.join(' AND ')}
    ${orderByClause}
    LIMIT ${finalLimit}
  `;

  console.log('Query SQL (season_averages):', sql);
  console.log('Query params:', params);
  console.log('Task:', q.task, 'Metric:', q.metric);
  const result = await pool.query(sql, params);
  console.log(`Found ${result.rows.length} players in season_averages`);
  return result.rows;
}
