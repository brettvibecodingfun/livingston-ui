import { z } from 'zod';

// Zod schema for runtime validation
export const QueryZ = z.object({
  task: z.enum(['rank', 'leaders', 'lookup', 'compare', 'team', 'historical_comparison']),
  metric: z.enum(['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm', 'off_rating', 'def_rating', 'net_rating', 'pie', 'e_pace', 'fga_pg', 'fgm_pg', 'ts_pct', 'ast_pct', 'efg_pct', 'reb_pct', 'usg_pct', 'dreb_pct', 'oreb_pct', 'ast_ratio', 'e_tov_pct', 'e_usg_pct', 'tpm', 'tpa', 'ftm', 'fta', 'team_ppg', 'team_fgm', 'team_fga', 'team_fg_pct', 'team_fta', 'team_ftm', 'team_ft_pct', 'team_fg3a', 'team_fg3m', 'team_fg3_pct', 'team_pace', 'team_efg_pct', 'team_ts_pct', 'team_def_rating', 'team_off_rating', 'team_net_rating', 'all']).optional(),
  season: z.number(),
  team: z.union([z.string(), z.array(z.string())]).nullish(),
  position: z.enum(['guards', 'forwards', 'centers']).nullish(),
  filters: z.object({
    min_games: z.number().optional(),
    min_metric_value: z.number().optional(),
    max_metric_value: z.number().optional(),
    filter_by_metric: z.enum(['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm', 'off_rating', 'def_rating', 'net_rating', 'pie', 'e_pace', 'fga_pg', 'fgm_pg', 'ts_pct', 'ast_pct', 'efg_pct', 'reb_pct', 'usg_pct', 'dreb_pct', 'oreb_pct', 'ast_ratio', 'e_tov_pct', 'e_usg_pct', 'tpm', 'tpa', 'ftm', 'fta', 'team_ppg', 'team_fgm', 'team_fga', 'team_fg_pct', 'team_fta', 'team_ftm', 'team_ft_pct', 'team_fg3a', 'team_fg3m', 'team_fg3_pct', 'team_pace', 'team_efg_pct', 'team_ts_pct', 'team_def_rating', 'team_off_rating', 'team_net_rating']).optional(),
    players: z.array(z.string()).optional(),
    draft_year_range: z
      .object({
        gte: z.number().optional(),
        lte: z.number().optional(),
      })
      .optional(),
    age_range: z
      .object({
        gte: z.number().optional(),
        lte: z.number().optional(),
      })
      .optional(),
    minutes_range: z
      .object({
        gte: z.number().optional(),
        lte: z.number().optional(),
      })
      .optional(),
    salary_range: z
      .object({
        gte: z.number().optional(),
        lte: z.number().optional(),
      })
      .optional(),
    order_by_age: z.enum(['asc', 'desc']).optional(),
    colleges: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
  }).optional(),
  order_direction: z.enum(['asc', 'desc']).optional(),
  limit: z.number().optional(),
  clutch: z.boolean().optional(),
  historical_comparison_count: z.union([z.number(), z.literal('all')]).optional()
});

// Export the inferred TypeScript type
export type Query = z.infer<typeof QueryZ>;

// JSON Schema for OpenAI's response_format.json_schema
export const QuerySchema = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      enum: ['rank', 'leaders', 'lookup', 'compare', 'team', 'historical_comparison']
    },
    metric: {
      type: 'string',
      enum: ['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm', 'off_rating', 'def_rating', 'net_rating', 'pie', 'e_pace', 'fga_pg', 'fgm_pg', 'ts_pct', 'ast_pct', 'efg_pct', 'reb_pct', 'usg_pct', 'dreb_pct', 'oreb_pct', 'ast_ratio', 'e_tov_pct', 'e_usg_pct', 'tpm', 'tpa', 'ftm', 'fta', 'team_ppg', 'team_fgm', 'team_fga', 'team_fg_pct', 'team_fta', 'team_ftm', 'team_ft_pct', 'team_fg3a', 'team_fg3m', 'team_fg3_pct', 'team_pace', 'team_efg_pct', 'team_ts_pct', 'team_def_rating', 'team_off_rating', 'team_net_rating', 'all']
    },
    season: {
      type: 'number'
    },
    team: {
      oneOf: [
        { type: 'string' },
        { type: 'array', items: { type: 'string' } }
      ]
    },
    position: {
      type: 'string',
      enum: ['guards', 'forwards', 'centers']
    },
    filters: {
      type: 'object',
      properties: {
        min_games: { type: 'number' },
        min_metric_value: { type: 'number' },
        max_metric_value: { type: 'number' },
        filter_by_metric: {
          type: 'string',
          enum: ['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm', 'off_rating', 'def_rating', 'net_rating', 'pie', 'e_pace', 'fga_pg', 'fgm_pg', 'ts_pct', 'ast_pct', 'efg_pct', 'reb_pct', 'usg_pct', 'dreb_pct', 'oreb_pct', 'ast_ratio', 'e_tov_pct', 'e_usg_pct', 'tpm', 'tpa', 'ftm', 'fta', 'team_ppg', 'team_fgm', 'team_fga', 'team_fg_pct', 'team_fta', 'team_ftm', 'team_ft_pct', 'team_fg3a', 'team_fg3m', 'team_fg3_pct', 'team_pace', 'team_efg_pct', 'team_ts_pct', 'team_def_rating', 'team_off_rating', 'team_net_rating']
        },
        players: {
          type: 'array',
          items: { type: 'string' }
        },
        draft_year_range: {
          type: 'object',
          properties: {
            gte: { type: 'number' },
            lte: { type: 'number' }
          },
          additionalProperties: false
        },
        age_range: {
          type: 'object',
          properties: {
            gte: { type: 'number' },
            lte: { type: 'number' }
          },
          additionalProperties: false
        },
        minutes_range: {
          type: 'object',
          properties: {
            gte: { type: 'number' },
            lte: { type: 'number' }
          },
          additionalProperties: false
        },
        salary_range: {
          type: 'object',
          properties: {
            gte: { type: 'number' },
            lte: { type: 'number' }
          },
          additionalProperties: false
        },
        order_by_age: {
          type: 'string',
          enum: ['asc', 'desc']
        },
        colleges: {
          type: 'array',
          items: { type: 'string' }
        },
        countries: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: [],
      additionalProperties: false
    },
    order_direction: {
      type: 'string',
      enum: ['asc', 'desc']
    },
    limit: {
      type: 'number'
    },
    clutch: {
      type: 'boolean'
    },
    historical_comparison_count: {
      oneOf: [
        { type: 'number' },
        { type: 'string', enum: ['all'] }
      ]
    }
  },
  required: ['task', 'season'],
  additionalProperties: false
};
