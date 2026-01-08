import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { runQuery } from './lib/sql';
import { summarizeAnswer } from './lib/narrate';
import { DEFAULT_SEASON } from './lib/constants';
import { Query, QueryZ, QuerySchema } from './lib/types';
import { pool } from './lib/db';

// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// CORS middleware for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, API-Auth-Key, X-API-Auth-Key');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Authentication middleware for POST routes
const authenticatePost = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const apiAuthKey = process.env['API_AUTH_KEY'];
  const providedKey = req.headers['api-auth-key'] || req.headers['x-api-auth-key'];
  
  if (!apiAuthKey) {
    console.warn('API_AUTH_KEY not configured in environment variables');
    res.status(500).json({
      error: 'Server configuration error',
      details: 'API authentication not properly configured'
    });
    return;
  }
  
  if (!providedKey || providedKey !== apiAuthKey) {
    res.status(401).json({
      error: 'Unauthorized',
      details: 'Invalid or missing API authentication key'
    });
    return;
  }
  
  next();
};

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
- bpm: box plus/minus

Available tasks:
- rank: rank players by a metric
- leaders: get top leaders for a metric
- lookup: find specific players
- compare: compare players

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
- If the user explicitly compares players (keywords such as "compare", "versus", "vs", "better than", "better season", "who is having the better year", etc.), set task = "compare".
- If the user asks for "top", "best", "leaders", "highest", "lowest", etc. without naming specific players, use task = "leaders".
- Use task = "rank" when the request implies ordering/ranking but not necessarily top-N leaders wording.
- Use task = "lookup" when the user searches for specific stats about one player or a constrained list without comparing.

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
    
    // Transform null or empty string/array values to undefined for optional fields
    if (parsed.team === null || parsed.team === '' || (Array.isArray(parsed.team) && parsed.team.length === 0)) {
      parsed.team = undefined;
    }
    if (parsed.position === null || parsed.position === '') parsed.position = undefined;
    if (parsed.filters === null || parsed.filters === '') parsed.filters = undefined;
    if (parsed.limit === null || parsed.limit === '') parsed.limit = undefined;
    
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
        p.full_name,
        sa.points AS ppg,
        sa.rebounds AS rpg,
        sa.assists AS apg,
        sa.steals AS spg,
        sa.blocks AS bpg,
        sa.fg_pct,
        sa.three_pct,
        sa.ft_pct
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

    const rows = await runQuery(query, playerNames);
    console.log(`Query returned ${rows.length} rows`);

    // Prepare response
    const response: {
      query: Query;
      rows: any[];
      summary?: string;
    } = {
      query: query,
      rows: rows
    };

    // Add summary if narrate is requested
    if (narrate) {
      response.summary = await summarizeAnswer(query, rows);
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
 * API endpoint for submitting Bogle game scores (proxies to backend service)
 */
app.post('/api/bogle/scores', authenticatePost, async (req, res) => {
  try {
    const backendUrl = process.env['BACKEND_SERVICE'];
    
    if (!backendUrl) {
      return res.status(500).json({
        error: 'Backend service URL not configured',
        details: 'BACKEND_SERVICE environment variable is not set'
      });
    }

    const response = await fetch(`${backendUrl}/api/bogle/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
 * API endpoint for fetching daily Bogle game data
 * Randomly selects between different game types
 */
app.get('/api/bogle/daily-game', async (req, res) => {
  try {
    // Randomly select a game type (0 or 1)
    const gameType = Math.floor(Math.random() * 2);
    
    let query: Query;
    let question: string;

    if (gameType === 0) {
      // Game 1: Top 10 rookie scorers
      question = 'Name the top 10 scoring rookies in the NBA this year';
      query = {
        task: 'leaders',
        metric: 'ppg',
        season: DEFAULT_SEASON,
        filters: {
          draft_year_range: {
            gte: DEFAULT_SEASON,
            lte: DEFAULT_SEASON
          },
          min_games: 15
        },
        limit: 10
      };
    } else {
      // Game 2: Top 10 scorers from Duke
      question = 'Name the top 10 scorers that went to Duke this season';
      query = {
        task: 'leaders',
        metric: 'ppg',
        season: DEFAULT_SEASON,
        filters: {
          colleges: ['Duke'],
          min_games: 15
        },
        limit: 10
      };
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
 * Start the server
 */
const port = process.env['PORT'] || 4000;
app.listen(port, () => {
  console.log(`Development API server listening on http://localhost:${port}`);
});

