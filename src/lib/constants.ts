// Default season for queries
export const DEFAULT_SEASON = 2025;

// Mapping of metric names to database column names in season_player_stats
export const METRIC_COL_MAP = {
  ppg: 'points_per_game',
  apg: 'assists_per_game', 
  rpg: 'rebounds_per_game',
  spg: 'steals_per_game',
  bpg: 'blocks_per_game',
  fg_pct: 'field_goal_percentage',
  three_pct: 'three_point_percentage',
  ft_pct: 'free_throw_percentage',
  bpm: 'box_plus_minus'
} as const;

// Team name to abbreviation mapping
export const TEAM_ABBREV = {
  // Brooklyn Nets
  'Nets': 'BKN',
  'Brooklyn Nets': 'BKN',
  'Brooklyn': 'BKN',
  
  // Boston Celtics
  'Celtics': 'BOS',
  'Boston Celtics': 'BOS',
  'Boston': 'BOS',
  
  // New York Knicks
  'Knicks': 'NYK',
  'New York Knicks': 'NYK',
  'New York': 'NYK',
  
  // Philadelphia 76ers
  '76ers': 'PHI',
  'Sixers': 'PHI',
  'Philadelphia 76ers': 'PHI',
  'Philadelphia': 'PHI',
  
  // Toronto Raptors
  'Raptors': 'TOR',
  'Toronto Raptors': 'TOR',
  'Toronto': 'TOR',
  
  // Chicago Bulls
  'Bulls': 'CHI',
  'Chicago Bulls': 'CHI',
  'Chicago': 'CHI',
  
  // Cleveland Cavaliers
  'Cavaliers': 'CLE',
  'Cavs': 'CLE',
  'Cleveland Cavaliers': 'CLE',
  'Cleveland': 'CLE',
  
  // Detroit Pistons
  'Pistons': 'DET',
  'Detroit Pistons': 'DET',
  'Detroit': 'DET',
  
  // Indiana Pacers
  'Pacers': 'IND',
  'Indiana Pacers': 'IND',
  'Indiana': 'IND',
  
  // Milwaukee Bucks
  'Bucks': 'MIL',
  'Milwaukee Bucks': 'MIL',
  'Milwaukee': 'MIL',
  
  // Atlanta Hawks
  'Hawks': 'ATL',
  'Atlanta Hawks': 'ATL',
  'Atlanta': 'ATL',
  
  // Charlotte Hornets
  'Hornets': 'CHA',
  'Charlotte Hornets': 'CHA',
  'Charlotte': 'CHA',
  
  // Miami Heat
  'Heat': 'MIA',
  'Miami Heat': 'MIA',
  'Miami': 'MIA',
  
  // Orlando Magic
  'Magic': 'ORL',
  'Orlando Magic': 'ORL',
  'Orlando': 'ORL',
  
  // Washington Wizards
  'Wizards': 'WAS',
  'Washington Wizards': 'WAS',
  'Washington': 'WAS',
  
  // Denver Nuggets
  'Nuggets': 'DEN',
  'Denver Nuggets': 'DEN',
  'Denver': 'DEN',
  
  // Minnesota Timberwolves
  'Timberwolves': 'MIN',
  'Wolves': 'MIN',
  'Minnesota Timberwolves': 'MIN',
  'Minnesota': 'MIN',
  
  // Oklahoma City Thunder
  'Thunder': 'OKC',
  'Oklahoma City Thunder': 'OKC',
  'Oklahoma City': 'OKC',
  
  // Portland Trail Blazers
  'Trail Blazers': 'POR',
  'Blazers': 'POR',
  'Portland Trail Blazers': 'POR',
  'Portland': 'POR',
  
  // Utah Jazz
  'Jazz': 'UTA',
  'Utah Jazz': 'UTA',
  'Utah': 'UTA',
  
  // Golden State Warriors
  'Warriors': 'GSW',
  'Golden State Warriors': 'GSW',
  'Golden State': 'GSW',
  
  // LA Clippers
  'Clippers': 'LAC',
  'LA Clippers': 'LAC',
  'Los Angeles Clippers': 'LAC',
  
  // Los Angeles Lakers
  'Lakers': 'LAL',
  'LA Lakers': 'LAL',
  'Los Angeles Lakers': 'LAL',
  
  // Phoenix Suns
  'Suns': 'PHX',
  'Phoenix Suns': 'PHX',
  'Phoenix': 'PHX',
  
  // Sacramento Kings
  'Kings': 'SAC',
  'Sacramento Kings': 'SAC',
  'Sacramento': 'SAC',
  
  // Dallas Mavericks
  'Mavericks': 'DAL',
  'Mavs': 'DAL',
  'Dallas Mavericks': 'DAL',
  'Dallas': 'DAL',
  
  // Houston Rockets
  'Rockets': 'HOU',
  'Houston Rockets': 'HOU',
  'Houston': 'HOU',
  
  // Memphis Grizzlies
  'Grizzlies': 'MEM',
  'Memphis Grizzlies': 'MEM',
  'Memphis': 'MEM',
  
  // New Orleans Pelicans
  'Pelicans': 'NOP',
  'New Orleans Pelicans': 'NOP',
  'New Orleans': 'NOP',
  
  // San Antonio Spurs
  'Spurs': 'SAS',
  'San Antonio Spurs': 'SAS',
  'San Antonio': 'SAS'
} as const;

// Position helper functions
export const getGuards = (): ('PG' | 'SG')[] => ['PG', 'SG'];
export const getBigs = (): ('PF' | 'C')[] => ['PF', 'C'];
export const getWings = (): ('SG' | 'SF')[] => ['SG', 'SF'];
export const getForwards = (): ('SF' | 'PF')[] => ['SF', 'PF'];

// Helper function to resolve team abbreviation
export const resolveTeamAbbrev = (teamName: string): string | undefined => {
  return TEAM_ABBREV[teamName as keyof typeof TEAM_ABBREV];
};

// Helper function to get position aliases
export const getPositionAliases = (alias: string): ('PG' | 'SG' | 'SF' | 'PF' | 'C')[] | undefined => {
  switch (alias.toLowerCase()) {
    case 'guards':
    case 'guard':
      return getGuards();
    case 'bigs':
    case 'big':
      return getBigs();
    case 'wings':
    case 'wing':
      return getWings();
    case 'forwards':
    case 'forward':
      return getForwards();
    default:
      return undefined;
  }
};

// Helper function to normalize team names to abbreviations
export const normalizeTeam = (input: string): string | undefined => {
  const normalized = input.toLowerCase().trim();
  return TEAM_ABBREV[normalized as keyof typeof TEAM_ABBREV];
};

// Helper function to parse position words from a question
export const parsePositionWords = (question: string): ('PG' | 'SG' | 'SF' | 'PF' | 'C')[] | undefined => {
  const lowerQuestion = question.toLowerCase();
  
  // Check for position group mentions
  if (lowerQuestion.includes('guards') || lowerQuestion.includes('guard')) {
    return getGuards();
  }
  
  if (lowerQuestion.includes('wings') || lowerQuestion.includes('wing')) {
    return getWings();
  }
  
  if (lowerQuestion.includes('bigs') || lowerQuestion.includes('big')) {
    return getBigs();
  }
  
  if (lowerQuestion.includes('forwards') || lowerQuestion.includes('forward')) {
    return getForwards();
  }
  
  // Check for individual position mentions
  const positions: ('PG' | 'SG' | 'SF' | 'PF' | 'C')[] = [];
  
  if (lowerQuestion.includes('point guard') || lowerQuestion.includes('pg')) {
    positions.push('PG');
  }
  
  if (lowerQuestion.includes('shooting guard') || lowerQuestion.includes('sg')) {
    positions.push('SG');
  }
  
  if (lowerQuestion.includes('small forward') || lowerQuestion.includes('sf')) {
    positions.push('SF');
  }
  
  if (lowerQuestion.includes('power forward') || lowerQuestion.includes('pf')) {
    positions.push('PF');
  }
  
  if (lowerQuestion.includes('center') || lowerQuestion.includes('c ')) {
    positions.push('C');
  }
  
  return positions.length > 0 ? positions : undefined;
};
