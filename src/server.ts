import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { runQuery } from './lib/sql';
import { summarizeAnswer } from './lib/narrate';
import { runTeamQuery } from './lib/teams';
import { DEFAULT_SEASON } from './lib/constants';
import { Query, QueryZ, QuerySchema } from './lib/types';
import { pool } from './lib/db';

// Load environment variables from .env file
dotenv.config();

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

function extractPlayerNames(question: string): string[] {
  const ignored = new Set(['nba', 'stats', 'season', 'league', 'team', 'teams']);
  const matches = question.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g) ?? [];

  return matches
    .map((name) => name.replace(/'s$/i, '').trim())
    .filter((name) => {
      if (!name) return false;
      const lower = name.toLowerCase();
      return !ignored.has(lower) && lower.split(' ').length >= 2;
    });
}

// Function to parse question into structured query using OpenAI
async function toStructuredQuery(question: string): Promise<Query> {
  const prompt = `You are a query parser for NBA statistics. Convert the user's question into a structured query.

Current season/year: ${DEFAULT_SEASON}

Available metrics:
- ppg: points per game
- apg: assists per game
- rpg: rebounds per game
- spg: steals per game
- bpg: blocks per game
- fg_pct: field goal percentage
- three_pct: three-point percentage
- ft_pct: free throw percentage
- tpm: three pointers made per game
- tpa: three point attempts per game
- ftm: free throws made per game
- fta: free throw attempts per game
- bpm: box plus/minus
- off_rating: offensive rating
- def_rating: defensive rating
- net_rating: net rating
- pie: player impact estimate
- e_pace: estimated pace
- fga_pg: field goals attempted per game
- fgm_pg: field goals made per game
- ts_pct: true shooting percentage
- ast_pct: assist percentage
- efg_pct: effective field goal percentage
- reb_pct: rebound percentage
- usg_pct: usage percentage
- dreb_pct: defensive rebound percentage
- oreb_pct: offensive rebound percentage
- ast_ratio: assist ratio
- e_tov_pct: estimated turnover percentage
- e_usg_pct: estimated usage percentage
- all: use when the user asks about players in general without specifying a particular stat (e.g., "show me all the raptors players", "find me the greatest duke players", "team best players", "who on the nuggets are playing the highest performing")

Available tasks:
- rank: rank players by a metric
- leaders: get top leaders for a metric
- lookup: find specific players
- compare: compare players
- team: query about teams (e.g., "best team", "worst team", "top teams", "who's the best team"). When task is "team", do NOT include metric in the response.

Team abbreviations mapping (use these exact abbreviations):
- Brooklyn Nets, Nets, Brooklyn → BKN
- Boston Celtics, Celtics, Boston → BOS
- New York Knicks, Knicks, New York → NYK
- Philadelphia 76ers, 76ers, Sixers, Philadelphia → PHI
- Toronto Raptors, Raptors, Toronto → TOR
- Chicago Bulls, Bulls, Chicago → CHI
- Cleveland Cavaliers, Cavaliers, Cavs, Cleveland → CLE
- Detroit Pistons, Pistons, Detroit → DET
- Indiana Pacers, Pacers, Indiana → IND
- Milwaukee Bucks, Bucks, Milwaukee → MIL
- Atlanta Hawks, Hawks, Atlanta → ATL
- Charlotte Hornets, Hornets, Charlotte → CHA
- Miami Heat, Heat, Miami → MIA
- Orlando Magic, Magic, Orlando → ORL
- Washington Wizards, Wizards, Washington → WAS
- Denver Nuggets, Nuggets, Denver → DEN
- Minnesota Timberwolves, Timberwolves, Wolves, Minnesota → MIN
- Oklahoma City Thunder, Thunder, Oklahoma City → OKC
- Portland Trail Blazers, Trail Blazers, Blazers, Portland → POR
- Utah Jazz, Jazz, Utah → UTA
- Golden State Warriors, Warriors, Golden State → GSW
- LA Clippers, Clippers, Los Angeles Clippers → LAC
- Los Angeles Lakers, Lakers, LA Lakers → LAL
- Phoenix Suns, Suns, Phoenix → PHX
- Sacramento Kings, Kings, Sacramento → SAC
- Dallas Mavericks, Mavericks, Mavs, Dallas → DAL
- Houston Rockets, Rockets, Houston → HOU
- Memphis Grizzlies, Grizzlies, Memphis → MEM
- New Orleans Pelicans, Pelicans, New Orleans → NOP
- San Antonio Spurs, Spurs, San Antonio → SAS

Positions (OPTIONAL - only include if user explicitly mentions a position): Use "guards" (for point guards and shooting guards), "forwards" (for small forwards and power forwards), or "centers" (for centers). If the user doesn't mention a position, do NOT include the position field in your response.

Team (OPTIONAL - only include if user explicitly mentions a team): 
- For a single team: Use the team abbreviation mapping provided above and set team as a string (e.g., "GSW" for Warriors).
- For multiple teams: If the user mentions multiple teams (e.g., "Warriors and Lakers", "Celtics or Heat"), set team as an array of team abbreviations (e.g., ["GSW", "LAL"]).
- Examples: "top scorers on the Warriors" → team = "GSW", "top scorers from the Warriors and Lakers" → team = ["GSW", "LAL"], "players from the Celtics, Heat, and Knicks" → team = ["BOS", "MIA", "NYK"].
- If the user doesn't mention a team, do NOT include the team field in your response.

Task selection rules (follow strictly):
- If the user asks about teams (keywords such as "best team", "worst team", "top teams", "who's the best team", "what team has the best record", "summary of the thunder", "tell me about the lakers", etc.), set task = "team". DO NOT include metric when task is "team".
- When task = "team" and the user mentions a specific team name (e.g., "thunder", "lakers", "celtics"), include the team field with the team abbreviation (e.g., "OKC", "LAL", "BOS"). This will return detailed information about that specific team including top scorers.
- If the user explicitly compares players (keywords such as "compare", "versus", "vs", "better than", "better season", "who is having the better year", etc.), set task = "compare".
- If the user asks for "top", "best", "leaders", "highest", "lowest", etc. without naming specific players and NOT asking about teams, use task = "leaders".
- Use task = "rank" when the request implies ordering/ranking but not necessarily top-N leaders wording.
- Use task = "lookup" when the user searches for specific stats about one player or a constrained list without comparing.

Clutch queries:
- If the user mentions "clutch", "clutch players", "clutch stats", "clutch performance", "clutch scoring", or any variation indicating they want clutch statistics (stats in clutch situations - typically last 5 minutes of close games), set clutch = true at the TOP LEVEL of the query object.
- Examples:
  * "Who are the best clutch scorers?" → { ..., "clutch": true }
  * "Show me clutch players with the most points" → { ..., "clutch": true }
  * "Who has the best clutch field goal percentage?" → { ..., "clutch": true, "metric": "fg_pct" }
  * "Compare clutch stats for Curry and Durant" → { ..., "clutch": true, "task": "compare" }
- IMPORTANT: clutch is a TOP-LEVEL field, NOT inside filters. Place it at the same level as "task", "metric", "season", etc.
- When clutch = true, the query will use clutch_season_averages table instead of season_averages table.

Player filters:
- When the user mentions specific player names, populate filters.players as an array of the exact full names in the question (e.g., ["Kevin Durant", "Cade Cunningham"]). Do NOT include team names in this list.

Draft year filters:
- If the user asks for "rookies" or "first-year players", add filters.draft_year_range = { gte: 2025, lte: 2025 } (drafted in the current season).
- If the user requests "young players", "recently drafted", or similar phrasing, set filters.draft_year_range to cover the last five seasons (e.g., { gte: 2021, lte: 2025 }).
- For explicit mentions like "players drafted in 2023", set filters.draft_year_range accordingly (both gte and lte equal to 2023).

College filters:
- If the user mentions a college/university (e.g., "Duke players"), populate filters.colleges with an array of matching school names (e.g., ["Duke"]).
- Recognize common abbreviations or nicknames (e.g., "UNC" for "North Carolina").

Country filters:
- If the user mentions a country (e.g., "players from Serbia", "best Serbian players", "who are the best players from France"), populate filters.countries with an array of country names (e.g., ["Serbia"], ["France"]).
- Use the full country name as it appears in the database (e.g., "Serbia", "France", "Croatia", "Slovenia", "Germany", "Spain", "Greece", "Lithuania", "Latvia", "Canada", "Australia", etc.).
- If the user says "Serbian players" or "Serbia", use "Serbia" as the country name.

Age filters:
- If the user mentions "oldest" players, set filters.order_by_age = "desc" to order by age descending (oldest first).
- If the user mentions "youngest" players, set filters.order_by_age = "asc" to order by age ascending (youngest first).
- If the user specifies an age range (e.g., "players over 30", "players under 25", "players aged 25-30"), set filters.age_range with gte (greater than or equal) and/or lte (less than or equal) values.
- For "players over X years old", set filters.age_range.gte = X.
- For "players under X years old" or "players younger than X", set filters.age_range.lte = X.
- For "players aged X to Y", set filters.age_range.gte = X and filters.age_range.lte = Y.

Minutes filters:
- If the user mentions minutes played (e.g., "players averaging under 20 minutes per game", "players who play over 30 minutes", "players with less than 15 minutes"), set filters.minutes_range with gte (greater than or equal) and/or lte (less than or equal) values.
- For "players averaging over X minutes" or "players who play more than X minutes", set filters.minutes_range.gte = X.
- For "players averaging under X minutes" or "players who play less than X minutes", set filters.minutes_range.lte = X.
- For "players averaging X to Y minutes", set filters.minutes_range.gte = X and filters.minutes_range.lte = Y.
- Examples: "players averaging under 20 minutes" → minutes_range.lte = 20, "players who average over 30 minutes" → minutes_range.gte = 30.

Salary filters:
- If the user mentions salary or contract amount (e.g., "players making less than 30 million a year", "players earning over 20 million", "players making under $25M", "players who make more than 15 million"), set filters.salary_range with gte (greater than or equal) and/or lte (less than or equal) values.
- IMPORTANT: Convert salary amounts to raw numbers (in dollars, not millions). For example, "30 million" or "$30M" or "30M" → 30000000, "20 million" → 20000000.
- For "players making more than X million" or "players earning over X million" or "players making over $XM", set filters.salary_range.gte = X * 1000000.
- For "players making less than X million" or "players earning under X million" or "players making under $XM", set filters.salary_range.lte = X * 1000000.
- For "players making between X and Y million", set filters.salary_range.gte = X * 1000000 and filters.salary_range.lte = Y * 1000000.
- Examples: "players making less than 30 million a year" → salary_range.lte = 30000000, "players earning over 20 million" → salary_range.gte = 20000000.

Minimum metric value filters:
- If the user asks for players "scoring over X points", "averaging more than X assists", "rebounding over X per game", etc., set filters.min_metric_value to the specified number.
- Match the min_metric_value to the metric being queried (e.g., if metric is "ppg" and user says "scoring over 20", set min_metric_value = 20).
- Examples: "scoring over 20 points" → min_metric_value = 20 (with metric = ppg), "averaging more than 10 assists" → min_metric_value = 10 (with metric = apg).

Combined stat filtering (filtering by one metric while ranking by another):
- If the user asks to filter by one metric while ranking by a different metric (e.g., "Of players averaging over 20 points per game, who has the highest field goal percentage?"), you need to:
  1. Set metric to the metric being ranked/sorted by (e.g., "fg_pct" for field goal percentage).
  2. Set filters.filter_by_metric to the metric being used for filtering (e.g., "ppg" for points per game).
  3. Set filters.min_metric_value to the threshold value (e.g., 20 for "over 20 points per game").
- Examples:
  * "Of players averaging over 20 points per game, who has the highest field goal percentage?" → { metric: "fg_pct", filters: { filter_by_metric: "ppg", min_metric_value: 20 } }
  * "Among players averaging more than 10 rebounds per game, who has the most assists?" → { metric: "apg", filters: { filter_by_metric: "rpg", min_metric_value: 10 } }
  * "Players scoring over 25 points per game, ranked by three-point percentage" → { metric: "three_pct", filters: { filter_by_metric: "ppg", min_metric_value: 25 } }
  * "Of players who shoot more than 7 threes per game, who has the best percentage?" → { metric: "three_pct", filters: { filter_by_metric: "tpa", min_metric_value: 7 } }
  * "Players attempting more than 5 threes per game, ranked by three-point percentage" → { metric: "three_pct", filters: { filter_by_metric: "tpa", min_metric_value: 5 } }
  * "Of players who take more than 8 free throws per game, who makes the highest percentage?" → { metric: "ft_pct", filters: { filter_by_metric: "fta", min_metric_value: 8 } }
- IMPORTANT: Only use filter_by_metric when filtering by a DIFFERENT metric than the one being ranked. If filtering and ranking by the same metric (e.g., "players scoring over 20 points per game"), just use min_metric_value without filter_by_metric (current behavior).
- IMPORTANT: When the user says "shoot more than X threes per game" or "attempt more than X threes per game", they are referring to three point attempts (tpa), not three pointers made (tpm). Use "tpa" as the filter_by_metric.

Metric rules:
- Always set metric to one of the allowed values.
- If the user asks about players in general without mentioning a specific stat (e.g., "show me all the raptors players", "find me the greatest duke players", "team best players", "who on the nuggets are playing the highest performing"), use metric = "all".
- If the user mentions a specific stat (points, assists, rebounds, steals, blocks, shooting percentages, etc.), use the corresponding metric.
- If the user does not specify a metric but is asking who is better overall in a comparison context, default to "ppg".
- Do NOT return an empty string for metric.

Order direction (reverse sorting) - READ THIS CAREFULLY:
- By default, results are ordered in descending order (highest values first). This means order_direction should NOT be set unless explicitly needed.
- CRITICAL: If the user asks for "least", "lowest", "worst", "bottom", "fewest", "minimum", "who is averaging the least", "who is averaging the least amount", or ANY similar terms indicating they want the SMALLEST values first, you MUST set order_direction = "asc" (ascending order) at the TOP LEVEL of the query object.
- Examples that REQUIRE order_direction = "asc" at the top level:
  * Question: "who is averaging the least amount of points" → { ..., "order_direction": "asc" }
  * Question: "of the players making more than 50 million a year, who is averaging the least amount of points" → { ..., "filters": { "salary_range": { "gte": 50000000 } }, "order_direction": "asc" }
  * Question: "players with the lowest rebounds" → { ..., "order_direction": "asc" }
  * Question: "worst free throw shooters" → { ..., "order_direction": "asc" }
  * Question: "who is scoring the least" → { ..., "order_direction": "asc" }
  * Question: "lowest scoring players" → { ..., "order_direction": "asc" }
  * Question: "players averaging the fewest points" → { ..., "order_direction": "asc" }
- IMPORTANT: order_direction is a TOP-LEVEL field, NOT inside filters. Place it at the same level as "task", "metric", "season", etc.
- If the user asks for "most", "highest", "best", "top", "greatest", "maximum", or similar terms, do NOT set order_direction (use default descending).
- Remember: "least" or "lowest" = ascending order (smallest first), "most" or "highest" = descending order (largest first, default).

Default limit: 10 (max 25)

Example query with order_direction:
Question: "of the players making more than 50 million a year, who is averaging the least amount of points"
Response:
{
  "task": "rank",
  "metric": "ppg",
  "season": 2025,
  "filters": {
    "salary_range": {
      "gte": 50000000
    }
  },
  "order_direction": "asc",
  "limit": 10
}

User question: "${question}"

Parse this question into the structured query format. Only include optional fields (team, position, filters, limit, order_direction) if they are explicitly mentioned in the user's question or needed based on the rules above. If the user mentions "this year", "this season", or "current season", use ${DEFAULT_SEASON} as the season. Remember: If the user asks for "least", "lowest", or "worst", you MUST include "order_direction": "asc" at the top level.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that converts NBA questions into structured queries. Always return valid JSON matching the schema.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'nba_query',
          strict: false,
          schema: QuerySchema,
        },
      },
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Ensure required fields are present with defaults
    if (!parsed.metric || parsed.metric === 'undefined') {
      console.warn('OpenAI returned query without metric, defaulting to ppg');
      parsed.metric = 'ppg';
    }
    if (!parsed.task) {
      console.warn('OpenAI returned query without task, defaulting to rank');
      parsed.task = 'rank';
    }
    if (!parsed.season) {
      parsed.season = DEFAULT_SEASON;
    }
    
    // Transform null or empty string/array values to undefined for optional fields
    if (parsed.team === null || parsed.team === '' || (Array.isArray(parsed.team) && parsed.team.length === 0)) {
      parsed.team = undefined;
    }
    if (parsed.position === null || parsed.position === '') parsed.position = undefined;
    if (parsed.filters === null || parsed.filters === '') parsed.filters = undefined;
    if (parsed.limit === null || parsed.limit === '') parsed.limit = undefined;
    if (parsed.order_direction === null || parsed.order_direction === '') parsed.order_direction = undefined;
    
    // Validate with Zod to ensure type safety
    return QueryZ.parse(parsed);
  } catch (error) {
    console.error('OpenAI API Error:', error);
    // Fallback to a default query if OpenAI fails
    return QueryZ.parse({
      task: 'rank',
      metric: 'ppg',
      season: DEFAULT_SEASON,
      limit: 10,
    });
  }
}

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
 * API endpoint for asking questions about NBA statistics
 */
app.post('/api/ask', async (req, res) => {
  try {
    const { question, narrate } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required and must be a string' });
    }

    // Parse the question into a structured query
    let query = await toStructuredQuery(question);
    console.log('Parsed query:', JSON.stringify(query, null, 2));

    // Query the database
    const extractedNames = extractPlayerNames(question);
    
    // Filter out college names from extracted player names to avoid conflicts
    const collegeNames = query.filters?.colleges?.map(c => c.toLowerCase()) ?? [];
    const filteredPlayerNames = extractedNames.filter(name => {
      const nameLower = name.toLowerCase();
      return !collegeNames.some(college => college === nameLower || nameLower.includes(college) || college.includes(nameLower));
    });
    
    const playerNames = query.filters?.players?.length ? query.filters.players : filteredPlayerNames;

    if (playerNames.length && (!query.filters || !query.filters.players)) {
      query = {
        ...query,
        filters: {
          ...(query.filters ?? {}),
          players: playerNames
        }
      };
    }

    // Handle team queries differently
    let rows: any[] = [];
    let teams: any[] = [];
    
    if (query.task === 'team') {
      teams = await runTeamQuery(query);
      console.log(`Team query returned ${teams.length} teams`);
    } else {
      rows = await runQuery(query, playerNames);
      console.log(`Query returned ${rows.length} rows`);
    }

    // Prepare response
    const response: {
      query: Query;
      rows?: any[];
      teams?: any[];
      summary?: string;
    } = {
      query: query,
    };

    if (query.task === 'team') {
      response.teams = teams;
    } else {
      response.rows = rows;
      
      // Add summary if narrate is requested (only for player queries)
      if (narrate) {
        response.summary = await summarizeAnswer(query, rows);
      }
    }

    return res.json(response);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process your question. Please try again.',
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
    if (!query.filters) {
      query.filters = {};
    }
    query.filters.min_games = 15;

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

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
