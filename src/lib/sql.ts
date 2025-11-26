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
  const collegeFilter = q.filters?.colleges?.map((c) => c.toLowerCase()) ?? [];
  const hasCollegeFilter = collegeFilter.length > 0;

  // Decide path: use leaders table for rank/leaders with pts/reb/ast/stl/blk,

  // For compare tasks, always use season_averages table for accurate stats
  // For rank/leaders, use leaders table for main stats but season_averages for percentages
  const leadersStatType: Record<string, string> = {
    ppg: 'pts',
    rpg: 'reb',
    apg: 'ast',
    spg: 'stl',
    bpg: 'blk',
  };
  const canUseLeaders = (q.task === 'leaders' || q.task === 'rank') && leadersStatType[q.metric];

  // Use season_averages for compare tasks
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

  // Use leaders table for rank/leaders when metric supports it
  if (canUseLeaders && !hasPlayerFilter && !hasDraftFilter && !hasCollegeFilter) {
    // Leaders query - join multiple leader rows to get all stats
    const statType = leadersStatType[q.metric];
    params.push(statType); i++;                 // $1 stat_type
    
    const where: string[] = [
      `l_main.stat_type = $1`,
    ];

    let seasonParamIndex = 0;
    // Add season filter if explicitly provided
    if (q.season) {
      params.push(q.season); i++;
      seasonParamIndex = i;
      where.push(`l_main.season = $${i}`);
    }

    if (q.team) { params.push(q.team); i++; where.push(`t.abbreviation = $${i}`); }
    if (q.position) {
      const position = mapPositionGroup(q.position);
      if (position) {
        params.push(position); i++; 
        where.push(`p.position = $${i}`);
      }
    }

    if (draftRange?.gte != null) {
      params.push(draftRange.gte); i++;
      where.push(`p.draft_year >= $${i}`);
    }
    if (draftRange?.lte != null) {
      params.push(draftRange.lte); i++;
      where.push(`p.draft_year <= $${i}`);
    }

    if (hasCollegeFilter) {
      params.push(collegeFilter); i++;
      where.push(`LOWER(p.college) = ANY($${i})`);
    }

    if (normalizedPlayerNames.length > 0) {
      // Use LIKE for case-insensitive partial matching to handle name variations
      const nameConditions = normalizedPlayerNames.map((name) => {
        params.push(`%${name}%`); i++;
        const paramIdx = i;
        return `LOWER(p.full_name) LIKE $${paramIdx}`;
      });
      where.push(`(${nameConditions.join(' OR ')})`);
    }

    // For compare queries, use a higher limit to ensure we get all requested players
    const finalLimitForLeaders = q.task === 'compare' ? 100 : limit;
    params.push(finalLimitForLeaders); i++; // final limit

    // Join all stat types to get complete stats, using season_averages for percentages
    const sql = `
      SELECT
        p.full_name,
        t.abbreviation AS team,
        l_main.games_played AS games_played,
        l_pts.value AS ppg,
        l_ast.value AS apg,
        l_reb.value AS rpg,
        l_stl.value AS spg,
        l_blk.value AS bpg,
        sa.fg_pct,
        sa.three_pct,
        sa.ft_pct
      FROM leaders l_main
      INNER JOIN players p ON l_main.player_id = p.id
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN leaders l_pts ON l_pts.player_id = p.id AND l_pts.stat_type = 'pts' AND l_pts.season = l_main.season
      LEFT JOIN leaders l_ast ON l_ast.player_id = p.id AND l_ast.stat_type = 'ast' AND l_ast.season = l_main.season
      LEFT JOIN leaders l_reb ON l_reb.player_id = p.id AND l_reb.stat_type = 'reb' AND l_reb.season = l_main.season
      LEFT JOIN leaders l_stl ON l_stl.player_id = p.id AND l_stl.stat_type = 'stl' AND l_stl.season = l_main.season
      LEFT JOIN leaders l_blk ON l_blk.player_id = p.id AND l_blk.stat_type = 'blk' AND l_blk.season = l_main.season
      LEFT JOIN season_averages sa ON sa.player_id = p.id AND sa.season = l_main.season
      WHERE ${where.join(' AND ')}
      ORDER BY l_main.rank ASC
      LIMIT $${i}
    `;

    console.log('Leaders SQL:', sql);
    console.log('Leaders params:', params);
    const result = await pool.query(sql, params);
    return result.rows;
  }

  // Aggregate season stats from season_averages table
  params.push(q.season); i++; // $1 season

  const whereAgg: string[] = [
    `sa.season = $1`,
  ];

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

  if (hasCollegeFilter) { params.push(collegeFilter); i++; whereAgg.push(`LOWER(p.college) = ANY($${i})`); }

  if (normalizedPlayerNames.length > 0) {
    // Use LIKE for case-insensitive partial matching to handle name variations
    const nameConditions = normalizedPlayerNames.map((name) => {
      params.push(`%${name}%`); i++;
      const paramIdx = i;
      return `LOWER(p.full_name) LIKE $${paramIdx}`;
    });
    whereAgg.push(`(${nameConditions.join(' OR ')})`);
  }

  // For compare tasks, don't order by metric - just return the requested players
  // For other tasks, order by the metric
  let orderByClause: string;
  let finalLimit: number;
  
  if (q.task === 'compare' && hasPlayerFilter) {
    // For comparisons, order by player name to ensure consistent ordering
    // Don't limit - we want all requested players
    orderByClause = `ORDER BY full_name ASC`;
    finalLimit = 100; // High limit to ensure we get all requested players
  } else {
    // Order column mapping based on computed aliases below
    const orderColumnMap: Record<string, string> = {
      ppg: 'ppg', apg: 'apg', rpg: 'rpg', spg: 'spg', bpg: 'bpg',
      fg_pct: 'fg_pct', three_pct: 'three_pct', ft_pct: 'ft_pct', bpm: 'ppg' // fallback
    };
    const orderBy = orderColumnMap[q.metric] || 'ppg';
    orderByClause = `ORDER BY ${orderBy} DESC NULLS LAST`;
    finalLimit = limit;
  }

  // Use season_averages table for aggregate queries (fallback path)
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
    WHERE ${whereAgg.join(' AND ')}
    ${orderByClause}
    LIMIT ${finalLimit}
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}
