import { z } from 'zod';

// Zod schema for runtime validation
export const QueryZ = z.object({
  task: z.enum(['rank', 'leaders', 'lookup', 'compare']),
  metric: z.enum(['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm', 'all']),
  season: z.number(),
  team: z.union([z.string(), z.array(z.string())]).nullish(),
  position: z.enum(['guards', 'forwards', 'centers']).nullish(),
  filters: z.object({
    min_games: z.number().optional(),
    min_metric_value: z.number().optional(),
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
  limit: z.number().optional()
});

// Export the inferred TypeScript type
export type Query = z.infer<typeof QueryZ>;

// JSON Schema for OpenAI's response_format.json_schema
export const QuerySchema = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      enum: ['rank', 'leaders', 'lookup', 'compare']
    },
    metric: {
      type: 'string',
      enum: ['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm', 'all']
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
    }
  },
  required: ['task', 'metric', 'season'],
  additionalProperties: false
};
