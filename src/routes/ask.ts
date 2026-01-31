import express from 'express';
import { Query } from '../lib/types';
import { toStructuredQuery, extractPlayerNames, isInformationalQuestion } from '../server';
import { runQuery } from '../lib/sql';
import { runTeamQuery } from '../lib/teams';
import { summarizeAnswer } from '../lib/narrate';
import { pool } from '../lib/db';
import { DEFAULT_SEASON } from '../lib/constants';

export function setupAskRoutes(app: express.Application) {
  /**
   * API endpoint for asking questions about NBA statistics
   */
  app.post('/api/ask', async (req, res) => {
    try {
      const { question, narrate } = req.body;

      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Question is required and must be a string' });
      }

      // First check if this is an informational question BEFORE trying to parse
      const isInformational = await isInformationalQuestion(question);
      
      if (isInformational) {
        // For informational questions, return suggestions instead of answering directly
        return res.status(400).json({
          error: 'I can help you with statistics and comparisons for the 2026 NBA season. Try asking about player statistics, team comparisons, or historical player comparisons.',
          suggestions: [
            'Who are the top scorers in the NBA?',
            'Compare Stephen Curry and Kevin Durant',
            'Find me a historical comparison for Anthony Edwards',
            'Who are the best Duke players in the NBA?',
            'What team has the best record?',
            'Who leads the league in assists?',
            'Show me players averaging over 25 points per game'
          ]
        });
      }

      // Parse the question into a structured query (only for data queries)
      let query: Query;
      try {
        query = await toStructuredQuery(question);
        console.log('Parsed query:', JSON.stringify(query, null, 2));
        const querySchemaString = JSON.stringify(query).replace(/"/g, '\\"');
        console.log(`"querySchema": "${querySchemaString}"`);
      } catch (error) {
        // If query parsing fails, return helpful error with suggestions
        if (error instanceof Error && error.message === 'QUERY_PARSE_FAILED') {
          return res.status(400).json({
            error: 'I couldn\'t understand your question. Try asking about player statistics, team comparisons, or historical player comparisons for the 2026 NBA season.',
            suggestions: [
              'Who are the top scorers in the NBA?',
              'Compare Stephen Curry and Kevin Durant',
              'Find me a historical comparison for Anthony Edwards',
              'Who are the best Duke players in the NBA?',
              'What team has the best record?'
            ]
          });
        }
        
        // Re-throw if it's a different error
        throw error;
      }

      // Check if this is a solo player query
      if (query.task === 'solo') {
        // Get player name from filters.players or extract from question
        let playerName: string | null = null;
        
        if (query.filters?.players && query.filters.players.length > 0) {
          playerName = query.filters.players[0];
        } else {
          // Fallback: Extract player name from question
          const extractedNames = extractPlayerNames(question);
          if (extractedNames.length > 0) {
            playerName = extractedNames[0];
          }
        }
        
        if (!playerName) {
          return res.status(400).json({ 
            error: 'Could not find a player name in your question. Please specify a player name.' 
          });
        }

        // Check if user asked for advanced stats
        const questionLower = question.toLowerCase();
        const isAdvanced = questionLower.includes('advanced') || questionLower.includes('advanced stats');

        // Query the player's stats
        const playerQuery: Query = {
          task: 'lookup',
          season: DEFAULT_SEASON,
          metric: 'all',
          filters: {
            players: [playerName]
          },
          limit: 1
        };

        const playerRows = await runQuery(playerQuery, [playerName]);
        
        if (playerRows.length === 0) {
          return res.status(404).json({
            error: `Could not find player "${playerName}" in the database.`,
            suggestions: [
              'Who are the top scorers in the NBA?',
              'Compare Stephen Curry and Kevin Durant',
              'Find me a historical comparison for Anthony Edwards'
            ]
          });
        }

        // Get player position and additional info from players table
        const playerInfoQuery = `
          SELECT p.position, p.full_name
          FROM players p
          WHERE LOWER(p.full_name) LIKE LOWER($1)
          LIMIT 1
        `;
        const playerInfoResult = await pool.query(playerInfoQuery, [`%${playerName}%`]);
        const playerInfo = playerInfoResult.rows[0];

        const soloPlayer = {
          player: {
            ...playerRows[0],
            position: playerInfo?.position || null
          },
          isAdvanced: isAdvanced
        };

        return res.json({
          query: query,
          soloPlayer: soloPlayer
        });
      }

      // Check if this is a historical comparison query
      if (query.task === 'historical_comparison') {
        // Get player name from filters.players or extract from question
        let playerName: string | null = null;
        
        if (query.filters?.players && query.filters.players.length > 0) {
          playerName = query.filters.players[0];
        } else {
          // Fallback: Extract player name from question
          const extractedNames = extractPlayerNames(question);
          if (extractedNames.length > 0) {
            playerName = extractedNames[0];
          }
        }
        
        if (!playerName) {
          return res.status(400).json({ 
            error: 'Could not find a player name in your question. Please specify a player name for historical comparison.' 
          });
        }
        
        // Check if this is a player whose age breaks the model (e.g., LeBron James)
        const playerNameLower = playerName.toLowerCase();
        const playersWithAgeIssues = ['lebron james', 'lebron', 'le bron james'];
        
        if (playersWithAgeIssues.some(name => playerNameLower.includes(name))) {
          const historicalComparison = {
            playerName: playerName,
            ageBreaksModel: true
          };

          const query: Query = {
            task: 'lookup',
            season: DEFAULT_SEASON,
            metric: 'all'
          };

          return res.json({
            query: query,
            historicalComparison: historicalComparison
          });
        }
        
        const backendUrl = process.env['BACKEND_SERVICE'];
        
        if (!backendUrl) {
          return res.status(500).json({
            error: 'Backend service URL not configured',
            details: 'BACKEND_SERVICE environment variable is not set'
          });
        }

        // Store the historical_comparison_count from the query before entering try block
        const historicalComparisonCount = query.historical_comparison_count;

        try {
          // Step 1: Get player cluster data (case-insensitive - backend should handle this, but we'll send as-is)
          const playerClusterResponse = await fetch(`${backendUrl}/api/clusters/player?name=${encodeURIComponent(playerName)}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (!playerClusterResponse.ok) {
            throw new Error(`Failed to fetch player cluster: ${playerClusterResponse.statusText}`);
          }

          const playerClusterData = await playerClusterResponse.json();
          
          if (!playerClusterData.success || !playerClusterData.data || playerClusterData.data.length === 0) {
            // Return a response indicating no cluster was found, but still return successfully
            // so the frontend can display a proper message
            const historicalComparison = {
              playerName: playerName,
              noClusterFound: true
            };

            const query: Query = {
              task: 'lookup',
              season: DEFAULT_SEASON,
              metric: 'all'
            };

            return res.json({
              query: query,
              historicalComparison: historicalComparison
            });
          }

          // Get age and clusterNumber from the first result
          const firstCluster = playerClusterData.data[0];
          const age = firstCluster.age;
          const clusterNumber = firstCluster.clusterNumber;

          // Step 2: Get all clusters for this age and clusterNumber
          const clustersResponse = await fetch(`${backendUrl}/api/clusters?age=${encodeURIComponent(age)}&clusterNumber=${encodeURIComponent(clusterNumber)}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (!clustersResponse.ok) {
            throw new Error(`Failed to fetch clusters: ${clustersResponse.statusText}`);
          }

          const clustersData = await clustersResponse.json();
          
          if (!clustersData.success || !clustersData.data || clustersData.data.length === 0) {
            // Return a response indicating no cluster was found, but still return successfully
            // so the frontend can display a proper message
            const historicalComparison = {
              playerName: playerName,
              noClusterFound: true
            };

            const query: Query = {
              task: 'lookup',
              season: DEFAULT_SEASON,
              metric: 'all'
            };

            return res.json({
              query: query,
              historicalComparison: historicalComparison
            });
          }

          // Step 3: Filter out the original player (case-insensitive matching)
          const playerNameLower = playerName.toLowerCase();
          const otherPlayers = clustersData.data.filter((p: any) => {
            const pNameLower = (p.playerName || '').toLowerCase();
            const pFullNameLower = (p.playerFullName || '').toLowerCase();
            return pNameLower !== playerNameLower && pFullNameLower !== playerNameLower;
          });

          if (otherPlayers.length === 0) {
            // Return a response indicating no cluster was found, but still return successfully
            // so the frontend can display a proper message
            const historicalComparison = {
              playerName: playerName,
              noClusterFound: true
            };

            const query: Query = {
              task: 'lookup',
              season: DEFAULT_SEASON,
              metric: 'all'
            };

            return res.json({
              query: query,
              historicalComparison: historicalComparison
            });
          }

          // Step 4: Determine how many players to return based on the query
          const requestedCount = historicalComparisonCount;
          let selectedPlayers: any[];
          
          if (requestedCount === 'all') {
            // Return all players
            selectedPlayers = otherPlayers;
          } else if (typeof requestedCount === 'number' && requestedCount > 0) {
            // Randomly select the requested number (or as many as available)
            const shuffled = otherPlayers.sort(() => 0.5 - Math.random());
            selectedPlayers = shuffled.slice(0, Math.min(requestedCount, shuffled.length));
          } else {
            // Default to 3 if nothing is specified
            const shuffled = otherPlayers.sort(() => 0.5 - Math.random());
            selectedPlayers = shuffled.slice(0, Math.min(3, shuffled.length));
          }

          // Step 5: Fetch current player's stats from the database
          let currentPlayerStats = null;
          try {
            const playerQuery = `
              SELECT
                p.full_name,
                t.abbreviation AS team,
                sa.season,
                sa.points,
                sa.assists,
                sa.rebounds,
                sa.fg_pct,
                sa.three_pct,
                sa.ft_pct,
                sa.games_played,
                sa.minutes
              FROM players p
              LEFT JOIN teams t ON p.team_id = t.id
              LEFT JOIN season_averages sa ON sa.player_id = p.id AND sa.season = $2
              WHERE LOWER(p.full_name) = LOWER($1)
              LIMIT 1
            `;
            
            const playerResult = await pool.query(playerQuery, [playerName, DEFAULT_SEASON]);
            
            if (playerResult.rows.length > 0) {
              const playerRow = playerResult.rows[0];
              // Increment season by 1 for current season (2025 -> 2026)
              const seasonFromDb = playerRow.season || DEFAULT_SEASON;
              const displaySeason = seasonFromDb === DEFAULT_SEASON ? seasonFromDb + 1 : seasonFromDb;
              currentPlayerStats = {
                fullName: playerRow.full_name,
                team: playerRow.team,
                season: displaySeason,
                points: playerRow.points || 0,
                assists: playerRow.assists || 0,
                rebounds: playerRow.rebounds || 0,
                fgPct: playerRow.fg_pct || 0,
                threePct: playerRow.three_pct || 0,
                ftPct: playerRow.ft_pct || 0,
                gamesPlayed: playerRow.games_played || 0,
                minutes: playerRow.minutes || 0
              };
            }
          } catch (error) {
            console.error('Error fetching current player stats:', error);
            // Continue without current player stats if there's an error
          }

          // Step 6: Format the response
          const historicalComparison = {
            playerName: playerName,
            age: age,
            clusterNumber: clusterNumber,
            currentPlayer: currentPlayerStats,
            comparisons: selectedPlayers.map((p: any) => ({
              playerName: p.playerName,
              playerFullName: p.playerFullName,
              season: p.season,
              points: p.points,
              assists: p.assists,
              rebounds: p.rebounds,
              fgPct: p.fgPct,
              threePct: p.threePct,
              ftPct: p.ftPct,
              gamesPlayed: p.gamesPlayed,
              minutes: p.minutes
            }))
          };

          // Create a minimal query for the response
          const query: Query = {
            task: 'lookup',
            season: DEFAULT_SEASON,
            metric: 'all'
          };

          return res.json({
            query: query,
            historicalComparison: historicalComparison
          });

        } catch (error) {
          console.error('Error fetching historical comparison:', error);
          return res.status(500).json({
            error: 'Failed to fetch historical comparison data.',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

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
        historicalComparison?: any;
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
}
