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
  // Team queries shouldn't use this function
  if (q.task === 'team' || !q.metric) {
    return [];
  }

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
  const minutesRange = q.filters?.minutes_range;
  const hasMinutesFilter = !!minutesRange && (minutesRange.gte != null || minutesRange.lte != null);
  const salaryRange = q.filters?.salary_range;
  const hasSalaryFilter = !!salaryRange && (salaryRange.gte != null || salaryRange.lte != null);
  const collegeFilter = q.filters?.colleges?.map((c) => c.toLowerCase()) ?? [];
  const hasCollegeFilter = collegeFilter.length > 0;
  const countryFilter = q.filters?.countries ?? [];
  const hasCountryFilter = countryFilter.length > 0;
  
  // Define advanced stats that require minimum 10 minutes per game and 15 games played
  const advancedStats = ['off_rating', 'def_rating', 'net_rating', 'pie', 'e_pace', 'fga_pg', 'fgm_pg', 
                         'ts_pct', 'ast_pct', 'efg_pct', 'reb_pct', 'usg_pct', 'dreb_pct', 'oreb_pct', 
                         'ast_ratio', 'e_tov_pct', 'e_usg_pct'];
  const isAdvancedStat = advancedStats.includes(q.metric);

  // Determine which table to use - clutch_season_averages for clutch queries, season_averages otherwise
  const tableName = q.clutch ? 'clutch_season_averages' : 'season_averages';
  
  // All queries use season_averages table (or clutch_season_averages for clutch queries) for accurate stats
  // This includes: compare, rank, and leaders tasks
  // Never use the leaders table - always query season_averages/clutch_season_averages directly
  
  // Special handling for compare tasks with specific players
  if (q.task === 'compare' && hasPlayerFilter) {
    // Compare query using season_averages table
    params.push(q.season); i++; // $1 season

    const whereCompare: string[] = [
      `sa.season = $1`,
    ];
    
    // For advanced stats in compare queries, require minimum 10 minutes per game and 15 games played
    if (isAdvancedStat) {
      params.push(15); i++;
      whereCompare.push(`sa.games_played >= $${i}`);
      params.push(10); i++;
      whereCompare.push(`sa.minutes >= $${i}`);
    }

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
    
    // For advanced stats in compare queries, require minimum 10 minutes per game and 15 games played
    if (q.metric) {
      const advancedStats = ['off_rating', 'def_rating', 'net_rating', 'pie', 'e_pace', 'fga_pg', 'fgm_pg', 
                             'ts_pct', 'ast_pct', 'efg_pct', 'reb_pct', 'usg_pct', 'dreb_pct', 'oreb_pct', 
                             'ast_ratio', 'e_tov_pct', 'e_usg_pct'];
      if (advancedStats.includes(q.metric)) {
        params.push(15); i++;
        whereCompare.push(`sa.games_played >= $${i}`);
        params.push(10); i++;
        whereCompare.push(`sa.minutes >= $${i}`);
      }
    }

    const compareTableName = q.clutch ? 'clutch_season_averages' : 'season_averages';
    const sql = `
      SELECT
        p.full_name,
        t.abbreviation AS team,
        sa.games_played,
        sa.minutes,
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
      FROM ${compareTableName} sa
      INNER JOIN players p ON sa.player_id = p.id
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE ${whereCompare.join(' AND ')}
      ORDER BY p.full_name ASC
    `;

    const result = await pool.query(sql, params);
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
    }
    return result.rows;
  }

  // Main query path: All rank/leaders/lookup queries use season_averages table
  // This includes queries like "best scorers on the knicks" (leaders task with team filter)
  params.push(q.season); i++; // $1 season

  const whereAgg: string[] = [
    `sa.season = $1`,
  ];

  // Add team filter if specified (e.g., "best scorers on the knicks" or "Warriors and Lakers")
  if (q.team) {
    if (Array.isArray(q.team) && q.team.length > 0) {
      // Multiple teams: use IN clause
      params.push(q.team); i++;
      whereAgg.push(`t.abbreviation = ANY($${i})`);
    } else if (typeof q.team === 'string') {
      // Single team: use equality
      params.push(q.team); i++;
      whereAgg.push(`t.abbreviation = $${i}`);
    }
  }
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

  if (minutesRange?.gte != null) { params.push(minutesRange.gte); i++; whereAgg.push(`sa.minutes >= $${i}`); }
  if (minutesRange?.lte != null) { params.push(minutesRange.lte); i++; whereAgg.push(`sa.minutes <= $${i}`); }

  if (salaryRange?.gte != null) { params.push(salaryRange.gte); i++; whereAgg.push(`p.base_salary >= $${i}`); }
  if (salaryRange?.lte != null) { params.push(salaryRange.lte); i++; whereAgg.push(`p.base_salary <= $${i}`); }

  // Add minimum games filter
  if (q.filters?.min_games != null) {
    params.push(q.filters.min_games); i++;
    whereAgg.push(`sa.games_played >= $${i}`);
  }
  
  // For advanced stats, require minimum 10 minutes per game and 15 games played
  if (isAdvancedStat) {
    // Add minimum games filter if not already set
    if (q.filters?.min_games == null) {
      params.push(15); i++;
      whereAgg.push(`sa.games_played >= $${i}`);
    }
    // Add minimum minutes per game filter (only if not already set by minutesRange filter)
    if (minutesRange?.gte == null) {
      params.push(10); i++;
      whereAgg.push(`sa.minutes >= $${i}`);
    }
  }

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
  // If filter_by_metric is specified, filter by that metric instead of the ranking metric
  if (q.filters?.min_metric_value != null) {
    // Use filter_by_metric if specified, otherwise use the ranking metric
    const filterMetric = q.filters?.filter_by_metric || q.metric;
    if (!filterMetric) return []; // Need at least one metric to filter by
    
    // Skip team metrics - they're not valid for player queries
    if (filterMetric.startsWith('team_')) return [];
    
    const metricCol = METRIC_COL_MAP[filterMetric as keyof typeof METRIC_COL_MAP] || 'points_per_game';
    const seasonAvgCol = metricCol === 'points_per_game' ? 'points' :
                        metricCol === 'assists_per_game' ? 'assists' :
                        metricCol === 'rebounds_per_game' ? 'rebounds' :
                        metricCol === 'steals_per_game' ? 'steals' :
                        metricCol === 'blocks_per_game' ? 'blocks' :
                        metricCol === 'field_goal_percentage' ? 'fg_pct' :
                        metricCol === 'three_point_percentage' ? 'three_pct' :
                        metricCol === 'free_throw_percentage' ? 'ft_pct' :
                        metricCol === 'tpm' ? 'tpm' :
                        metricCol === 'tpa' ? 'tpa' :
                        metricCol === 'ftm' ? 'ftm' :
                        metricCol === 'fta' ? 'fta' :
                        metricCol === 'offensive_rating' ? 'off_rating' :
                        metricCol === 'defensive_rating' ? 'def_rating' :
                        metricCol === 'net_rating' ? 'net_rating' :
                        metricCol === 'player_impact_estimate' ? 'pie' :
                        metricCol === 'estimated_pace' ? 'e_pace' :
                        metricCol === 'field_goals_attempted_per_game' ? 'fga_pg' :
                        metricCol === 'field_goals_made_per_game' ? 'fgm_pg' :
                        metricCol === 'true_shooting_percentage' ? 'ts_pct' :
                        metricCol === 'assist_percentage' ? 'ast_pct' :
                        metricCol === 'effective_field_goal_percentage' ? 'efg_pct' :
                        metricCol === 'rebound_percentage' ? 'reb_pct' :
                        metricCol === 'usage_percentage' ? 'usg_pct' :
                        metricCol === 'defensive_rebound_percentage' ? 'dreb_pct' :
                        metricCol === 'offensive_rebound_percentage' ? 'oreb_pct' :
                        metricCol === 'assist_ratio' ? 'ast_ratio' :
                        metricCol === 'estimated_turnover_percentage' ? 'e_tov_pct' :
                        metricCol === 'estimated_usage_percentage' ? 'e_usg_pct' : 'points';
    params.push(q.filters.min_metric_value); i++;
    whereAgg.push(`sa.${seasonAvgCol} >= $${i}`);
  }

  // Add maximum metric value filter (e.g., "shooting 15 or less shots per game")
  // If filter_by_metric is specified, filter by that metric instead of the ranking metric
  if (q.filters?.max_metric_value != null) {
    // Use filter_by_metric if specified, otherwise use the ranking metric
    const filterMetric = q.filters?.filter_by_metric || q.metric;
    if (!filterMetric) return []; // Need at least one metric to filter by
    
    // Skip team metrics - they're not valid for player queries
    if (filterMetric.startsWith('team_')) return [];
    
    const metricCol = METRIC_COL_MAP[filterMetric as keyof typeof METRIC_COL_MAP] || 'points_per_game';
    const seasonAvgCol = metricCol === 'points_per_game' ? 'points' :
                        metricCol === 'assists_per_game' ? 'assists' :
                        metricCol === 'rebounds_per_game' ? 'rebounds' :
                        metricCol === 'steals_per_game' ? 'steals' :
                        metricCol === 'blocks_per_game' ? 'blocks' :
                        metricCol === 'field_goal_percentage' ? 'fg_pct' :
                        metricCol === 'three_point_percentage' ? 'three_pct' :
                        metricCol === 'free_throw_percentage' ? 'ft_pct' :
                        metricCol === 'tpm' ? 'tpm' :
                        metricCol === 'tpa' ? 'tpa' :
                        metricCol === 'ftm' ? 'ftm' :
                        metricCol === 'fta' ? 'fta' :
                        metricCol === 'offensive_rating' ? 'off_rating' :
                        metricCol === 'defensive_rating' ? 'def_rating' :
                        metricCol === 'net_rating' ? 'net_rating' :
                        metricCol === 'player_impact_estimate' ? 'pie' :
                        metricCol === 'estimated_pace' ? 'e_pace' :
                        metricCol === 'field_goals_attempted_per_game' ? 'fga_pg' :
                        metricCol === 'field_goals_made_per_game' ? 'fgm_pg' :
                        metricCol === 'true_shooting_percentage' ? 'ts_pct' :
                        metricCol === 'assist_percentage' ? 'ast_pct' :
                        metricCol === 'effective_field_goal_percentage' ? 'efg_pct' :
                        metricCol === 'rebound_percentage' ? 'reb_pct' :
                        metricCol === 'usage_percentage' ? 'usg_pct' :
                        metricCol === 'defensive_rebound_percentage' ? 'dreb_pct' :
                        metricCol === 'offensive_rebound_percentage' ? 'oreb_pct' :
                        metricCol === 'assist_ratio' ? 'ast_ratio' :
                        metricCol === 'estimated_turnover_percentage' ? 'e_tov_pct' :
                        metricCol === 'estimated_usage_percentage' ? 'e_usg_pct' : 'points';
    params.push(q.filters.max_metric_value); i++;
    whereAgg.push(`sa.${seasonAvgCol} <= $${i}`);
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
      tpm: 'tpm', tpa: 'tpa', ftm: 'ftm', fta: 'fta',
      off_rating: 'off_rating', def_rating: 'def_rating', net_rating: 'net_rating', pie: 'pie',
      e_pace: 'e_pace', fga_pg: 'fga_pg', fgm_pg: 'fgm_pg', ts_pct: 'ts_pct',
      ast_pct: 'ast_pct', efg_pct: 'efg_pct', reb_pct: 'reb_pct', usg_pct: 'usg_pct',
      dreb_pct: 'dreb_pct', oreb_pct: 'oreb_pct', ast_ratio: 'ast_ratio',
      e_tov_pct: 'e_tov_pct', e_usg_pct: 'e_usg_pct',
      all: 'ppg' // For "all" metric, order by ppg as default
    };
    const orderBy = (q.metric && orderColumnMap[q.metric]) || 'ppg';
    // Use order_direction if specified (for reverse sorting), otherwise default to DESC
    const direction = q.order_direction?.toUpperCase() || 'DESC';
    orderByClause = `ORDER BY ${orderBy} ${direction} NULLS LAST`;
    console.log(`Ordering by ${orderBy} ${direction} (order_direction: ${q.order_direction})`);
    finalLimit = limit;
  }

  // Query season_averages table for all rank/leaders/lookup tasks
  // This ensures accurate, up-to-date statistics from the player stats table
  // Include age in SELECT if we're ordering by age
  // Include position for solo queries (when limit is 1 and has player filter)
  const selectAge = orderByAge ? ', p.age' : '';
  const selectPosition = (q.limit === 1 && hasPlayerFilter) ? ', p.position' : '';
  const sql = `
    SELECT
      p.full_name,
      t.abbreviation AS team,
      sa.games_played,
      sa.minutes,
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
      sa.e_usg_pct${selectAge}${selectPosition}
    FROM ${tableName} sa
    INNER JOIN players p ON sa.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE ${whereAgg.join(' AND ')}
    ${orderByClause}
    LIMIT ${finalLimit}
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

