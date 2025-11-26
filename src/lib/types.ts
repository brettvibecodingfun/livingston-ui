import { z } from 'zod';

// Zod schema for runtime validation
export const QueryZ = z.object({
  task: z.enum(['rank', 'leaders', 'lookup', 'compare']),
  metric: z.enum(['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm']),
  season: z.number(),
  team: z.string().nullish(),
  position: z.enum(['guards', 'forwards', 'centers']).nullish(),
  filters: z.object({
    min_games: z.number().optional(),
    players: z.array(z.string()).optional(),
    draft_year_range: z
      .object({
        gte: z.number().optional(),
        lte: z.number().optional(),
      })
      .optional(),
    colleges: z.array(z.string()).optional(),
  }).optional(),
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
      enum: ['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct', 'bpm']
    },
    season: {
      type: 'number'
    },
    team: {
      type: 'string'
    },
    position: {
      type: 'string',
      enum: ['guards', 'forwards', 'centers']
    },
    filters: {
      type: 'object',
      properties: {
        min_games: { type: 'number' },
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
        colleges: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: [],
      additionalProperties: false
    },
    limit: {
      type: 'number'
    }
  },
  required: ['task', 'metric', 'season'],
  additionalProperties: false
};
