import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Query } from '../../lib/types';

export interface PlayerStatsRow {
  full_name: string;
  team: string | null;
  games_played: number;
  minutes: number | null;
  ppg: number | null;
  apg: number | null;
  rpg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
  off_rating: number | null;
  def_rating: number | null;
  net_rating: number | null;
  pie: number | null;
  e_pace: number | null;
  fga_pg: number | null;
  fgm_pg: number | null;
  ts_pct: number | null;
  ast_pct: number | null;
  efg_pct: number | null;
  reb_pct: number | null;
  usg_pct: number | null;
  dreb_pct: number | null;
  oreb_pct: number | null;
  ast_ratio: number | null;
  e_tov_pct: number | null;
  e_usg_pct: number | null;
  // Shooting stats
  corner_3_fgm?: number | null;
  corner_3_fga?: number | null;
  corner_3_fg_pct?: number | null;
  left_corner_3_fgm?: number | null;
  left_corner_3_fga?: number | null;
  left_corner_3_fg_pct?: number | null;
  right_corner_3_fgm?: number | null;
  right_corner_3_fga?: number | null;
  right_corner_3_fg_pct?: number | null;
  above_the_break_3_fgm?: number | null;
  above_the_break_3_fga?: number | null;
  above_the_break_3_fg_pct?: number | null;
  backcourt_fgm?: number | null;
  backcourt_fga?: number | null;
  backcourt_fg_pct?: number | null;
  mid_range_fgm?: number | null;
  mid_range_fga?: number | null;
  mid_range_fg_pct?: number | null;
  restricted_area_fgm?: number | null;
  restricted_area_fga?: number | null;
  restricted_area_fg_pct?: number | null;
  in_the_paint_non_ra_fgm?: number | null;
  in_the_paint_non_ra_fga?: number | null;
  in_the_paint_non_ra_fg_pct?: number | null;
}

export interface TeamPlayer {
  fullName: string;
  team: string;
  ppg: number;
  apg?: number;
  rpg?: number;
  gamesPlayed: number;
}

export interface TeamData {
  teamId: number;
  team: string;
  teamName: string;
  wins: number;
  losses: number;
  winPct: number;
  conference: string;
  seed?: number;
  topScorers?: TeamPlayer[];
}

export interface HistoricalComparison {
  playerName: string;
  age?: number;
  clusterNumber?: number;
  noClusterFound?: boolean;
  ageBreaksModel?: boolean;
  currentPlayer?: {
    fullName: string;
    team: string | null;
    season: number;
    points: number;
    assists: number;
    rebounds: number;
    fgPct: number;
    threePct: number;
    ftPct: number;
    gamesPlayed: number;
    minutes: number;
  };
  comparisons?: {
    playerName: string;
    playerFullName: string;
    season: number;
    points: number;
    assists: number;
    rebounds: number;
    fgPct: number;
    threePct: number;
    ftPct: number;
    gamesPlayed: number;
    minutes: number;
  }[];
}

export interface SoloPlayerData {
  player: PlayerStatsRow;
  isAdvanced?: boolean; // true if showing advanced stats, false if basic stats
}

export interface QueryResponse {
  query: Query;
  rows?: PlayerStatsRow[];
  teams?: TeamData[];
  historicalComparison?: HistoricalComparison;
  soloPlayer?: SoloPlayerData;
  summary?: string;
  error?: string;
  suggestions?: string[];
}

export interface AskRequest {
  question: string;
  narrate?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LivingstonService {
  private apiUrl = '/api/ask'; // Backend API endpoint

  constructor(private http: HttpClient) {}

  askQuestion(request: AskRequest): Observable<QueryResponse> {
    // Call the real backend API
    return this.http.post<QueryResponse>(this.apiUrl, request);
  }
}
