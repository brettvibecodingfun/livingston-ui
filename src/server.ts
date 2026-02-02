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
import { Query, QueryZ, QuerySchema } from './lib/types';
import { DEFAULT_SEASON } from './lib/constants';
import { setupBogleRoutes } from './routes/bogle';
import { setupGuessPlayerRoutes } from './routes/guess-player';
import { setupAskRoutes } from './routes/ask';
import { setupOtherRoutes } from './routes/other';
import { setupClustersRoutes } from './routes/clusters';

// Load environment variables from .env file
dotenv.config();

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Middleware to parse JSON bodies
app.use(express.json());

// Setup API routes
setupBogleRoutes(app);
setupGuessPlayerRoutes(app);
setupAskRoutes(app);
setupOtherRoutes(app);
setupClustersRoutes(app);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

export function extractPlayerNames(question: string): string[] {
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
export async function toStructuredQuery(question: string): Promise<Query> {
  const prompt = `You are a query parser for NBA statistics. Convert the user's question into a structured query.

Current season/year: ${DEFAULT_SEASON}

Available metrics:
Player metrics:
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

Shooting stats by zone (from shooting_stats table):
- corner_3_fgm: corner 3 pointers made per game (e.g., "who leads in corner 3s made", "most corner 3s per game")
- corner_3_fga: corner 3 pointers attempted per game (e.g., "who attempts the most corner 3s")
- corner_3_fg_pct: corner 3 point percentage (e.g., "best corner 3 percentage")
- left_corner_3_fgm: left corner 3 pointers made per game
- left_corner_3_fga: left corner 3 pointers attempted per game
- left_corner_3_fg_pct: left corner 3 point percentage
- right_corner_3_fgm: right corner 3 pointers made per game
- right_corner_3_fga: right corner 3 pointers attempted per game
- right_corner_3_fg_pct: right corner 3 point percentage
- above_the_break_3_fgm: above the break 3 pointers made per game
- above_the_break_3_fga: above the break 3 pointers attempted per game
- above_the_break_3_fg_pct: above the break 3 point percentage
- backcourt_fgm: backcourt field goals made per game
- backcourt_fga: backcourt field goals attempted per game
- backcourt_fg_pct: backcourt field goal percentage
- mid_range_fgm: mid-range field goals made per game
- mid_range_fga: mid-range field goals attempted per game
- mid_range_fg_pct: mid-range field goal percentage
- restricted_area_fgm: restricted area field goals made per game
- restricted_area_fga: restricted area field goals attempted per game
- restricted_area_fg_pct: restricted area field goal percentage
- in_the_paint_non_ra_fgm: in the paint (non-RA) field goals made per game
- in_the_paint_non_ra_fga: in the paint (non-RA) field goals attempted per game
- in_the_paint_non_ra_fg_pct: in the paint (non-RA) field goal percentage

Team metrics (use when asking about team statistics):
- team_ppg: team points per game (e.g., "which team scores the most points per game")
- team_fgm: team field goals made per game (e.g., "what team hits the most shots per game")
- team_fga: team field goals attempted per game (ALL field goals, including 2-pointers and 3-pointers combined)
- team_fg_pct: team field goal percentage
- team_fta: team free throws attempted per game
- team_ftm: team free throws made per game
- team_ft_pct: team free throw percentage
- team_fg3a: team three pointers attempted per game (e.g., "what team leads in 3 pointers attempted per game", "which team attempts the most threes per game", "3 pointers attempted")
- team_fg3m: team three pointers made per game (e.g., "what team makes the most 3 pointers per game")
- team_fg3_pct: team three-point percentage
- team_pace: team pace per game (e.g., "what team plays with the most pace per game")
- team_efg_pct: team effective field goal percentage
- team_ts_pct: team true shooting percentage
- team_def_rating: team defensive rating (e.g., "who has the best defense in the NBA"). IMPORTANT: For defensive rating, lower is better, so when querying defensive rating, set order_direction = "asc" to show teams with the best (lowest) defensive rating first.
- team_off_rating: team offensive rating (e.g., "who has the best offense in the NBA")
- team_net_rating: team net rating (e.g., "who is analytically the best team in the NBA")

- all: use when the user asks about players in general without specifying a particular stat (e.g., "show me all the raptors players", "find me the greatest duke players", "team best players", "who on the nuggets are playing the highest performing")

Available tasks:
- rank: rank players by a metric
- leaders: get top leaders for a metric
- lookup: find specific players
- compare: compare players
- team: query about teams (e.g., "best team", "worst team", "top teams", "who's the best team"). When task is "team", do NOT include metric in the response.
- historical_comparison: find historical player comparisons (e.g., "Find me a historical comparison for Tyrese Maxey", "Find someone from the past like Anthony Edwards", "Who are similar players to Stephen Curry historically?"). When task is "historical_comparison", include the player name in filters.players array. DO NOT include metric when task is "historical_comparison".
- solo: show a single player's stats in a detailed solo display (e.g., "show me Kon Knueppel's stats", "show me Kon Knueppel's basic stats", "show me Kon Knueppel's advanced stats"). When task is "solo", include the player name in filters.players array. If the user asks for "advanced stats", the system will show advanced stats; otherwise it shows basic stats. DO NOT include metric when task is "solo".
  - For historical_comparison tasks, you can optionally include historical_comparison_count at the TOP LEVEL:
    * If the user asks for "all" comparisons (e.g., "give me all the historical comparisons", "show me all comparisons", "all the historical comparisons for [player]"), set historical_comparison_count = "all".
    * If the user specifies a number (e.g., "give me 5 historical comparisons", "show me 10 players like [player]"), set historical_comparison_count to that number.
    * If the user just asks for a historical comparison without specifying a count (e.g., "find me a historical comparison for Anthony Edwards"), do NOT include historical_comparison_count (defaults to 3).

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
- If the user asks about teams (keywords such as "best team", "worst team", "top teams", "who's the best team", "what team has the best record", "summary of the thunder", "tell me about the lakers", etc.), set task = "team".
- IMPORTANT DISTINCTION: When asking about team statistics comparing teams (e.g., "which team scores the most points", "who has the best defense", "what team plays with the most pace", "who is analytically the best team"), set task = "team" and use the appropriate team_* metric (e.g., team_ppg, team_def_rating, team_pace, team_net_rating).
- CRITICAL: When asking about PLAYER statistics filtered by team (e.g., "net rating leaders on the rockets", "top scorers on the lakers", "best rebounders on the celtics"), set task = "leaders" or "rank" (NOT "team") and use the PLAYER metric (e.g., net_rating, ppg, rpg) with the team field set to filter players. Do NOT use team_* metrics for player queries.
- When task = "team" and the user mentions a specific team name (e.g., "thunder", "lakers", "celtics"), include the team field with the team abbreviation (e.g., "OKC", "LAL", "BOS"). This will return detailed information about that specific team including top scorers.
- When task = "team" and the user asks about team statistics (not just records/wins), include the appropriate team_* metric. If asking about records/wins only, do NOT include metric.
- If the user asks for historical comparisons (keywords such as "historical comparison", "find someone from the past like", "find me a historical comparison for", "who are similar players to", "players like", "comparable players to", "historical comp", "find players like", etc.), set task = "historical_comparison". Include the player name in filters.players array. DO NOT include metric when task is "historical_comparison".
- If the user explicitly compares players (keywords such as "compare", "versus", "vs", "better than", "better season", "who is having the better year", etc.), set task = "compare".
- If the user asks for "top", "best", "leaders", "highest", "lowest", etc. without naming specific players and NOT asking about teams or historical comparisons, use task = "leaders".
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
- If the user mentions a college/university (e.g., "Duke players", "best Duke players", "Give me the best Duke players", "Duke alumni", "players from Duke"), populate filters.colleges with an array of matching school names (e.g., ["Duke"]).
- Recognize common abbreviations or nicknames (e.g., "UNC" for "North Carolina").
- Examples: "Give me the best Duke players in the NBA" → filters.colleges = ["Duke"], "top scorers from Kentucky" → filters.colleges = ["Kentucky"], "best UNC players" → filters.colleges = ["North Carolina"].

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

Minimum and maximum metric value filters:
- If the user asks for players "scoring over X points", "averaging more than X assists", "rebounding over X per game", etc., set filters.min_metric_value to the specified number.
- If the user asks for players "scoring under X points", "averaging less than X assists", "shooting X or less shots", "15 or less shots per game", "at most X", etc., set filters.max_metric_value to the specified number.
- Match the min_metric_value or max_metric_value to the metric being queried (e.g., if metric is "ppg" and user says "scoring over 20", set min_metric_value = 20).
- When filtering by a different metric (using filter_by_metric), apply min_metric_value or max_metric_value to that filter metric.
- Examples: 
  * "scoring over 20 points" → min_metric_value = 20 (with metric = ppg)
  * "averaging more than 10 assists" → min_metric_value = 10 (with metric = apg)
  * "shooting 15 or less shots per game" → max_metric_value = 15 (with filter_by_metric = fga_pg if ranking by ppg)
  * "for guys who shoot 15 or less shots a game, who averages the most points per game?" → metric = ppg, filter_by_metric = fga_pg, max_metric_value = 15
  * "players averaging less than 20 points" → max_metric_value = 20 (with metric = ppg)
  * "players with at most 10 assists per game" → max_metric_value = 10 (with metric = apg)

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
- IMPORTANT: When asking about shooting stats, distinguish carefully:
  * "3 pointers attempted", "three pointers attempted", "3 point attempts", "threes attempted", "3PA" → use team_fg3a (NOT team_fga)
  * "3 pointers made", "three pointers made", "3 point makes", "threes made", "3PM" → use team_fg3m
  * "field goals attempted" (without "three" or "3") → use team_fga (all field goals including 2-pointers and 3-pointers)
  * "field goals made" (without "three" or "3") → use team_fgm (all field goals including 2-pointers and 3-pointers)
- If the user asks about players in general without mentioning a specific stat (e.g., "show me all the raptors players", "find me the greatest duke players", "Give me the best Duke players in the NBA", "team best players", "who on the nuggets are playing the highest performing"), use metric = "all".
- IMPORTANT: When the user asks for "best [college] players", "top [college] players", "greatest [college] players", or similar phrasing without a specific stat, set metric = "all" AND include filters.colleges = ["[college]"]. For example, "Give me the best Duke players in the NBA" → { metric: "all", filters: { colleges: ["Duke"] } }.
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

Parse this question into the structured query format. Only include optional fields (team, position, filters, limit, order_direction) if they are explicitly mentioned in the user's question or needed based on the rules above. If the user mentions "this year", "this season", or "current season", use ${DEFAULT_SEASON} as the season. Remember: If the user asks for "least", "lowest", or "worst", you MUST include "order_direction": "asc" at the top level.

IMPORTANT: If the question cannot be answered with structured data (e.g., it asks for explanations, definitions, or general knowledge that isn't about specific player/team statistics), you should still attempt to parse it, but use your best judgment to map it to the closest valid query structure. For questions about general NBA concepts, rules, or explanations that don't involve specific stats, try to use task = "lookup" with metric = "all" and appropriate filters if possible.`;

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
    // Throw a custom error so the caller can handle it appropriately
    throw new Error('QUERY_PARSE_FAILED');
  }
}

/**
 * Custom error class for query parsing failures
 */
export class QueryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryParseError';
  }
}

/**
 * Determines if a question is informational (can be answered with text) vs a data query
 */
export async function isInformationalQuestion(question: string): Promise<boolean> {
  const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
  });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that determines if a question about the NBA can be answered with structured data (player stats, team stats, comparisons) or requires a general informational answer.',
        },
        {
          role: 'user',
          content: `Is this question asking for structured data/statistics, or is it asking for general information/explanations?

Question: "${question}"

Respond with only "data" if it's asking for stats/data that can be displayed in a table or comparison.
Respond with only "informational" if it's asking for explanations, definitions, or general knowledge that can't be answered with structured data.

Examples:
- "Who are the top scorers?" → data
- "Compare LeBron and Curry" → data
- "What is a field goal percentage?" → informational
- "Tell me about the NBA" → informational
- "Who leads in PPG?" → data
- "How does the draft work?" → informational`,
        },
      ],
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content?.toLowerCase().trim();
    return response === 'informational';
  } catch (error) {
    console.error('Error determining question type:', error);
    // Default to false (treat as data query) if we can't determine
    return false;
  }
}

/**
 * Gets a direct text answer from OpenAI for informational questions
 */
export async function getInformationalAnswer(question: string): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
  });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that answers questions about the NBA. Provide concise, accurate answers focused on the 2026 NBA season when relevant.',
        },
        {
          role: 'user',
          content: question,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate an answer to that question.';
  } catch (error) {
    console.error('Error getting informational answer:', error);
    throw error;
  }
}


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
