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

export interface QueryResponse {
  query: Query;
  rows?: PlayerStatsRow[];
  teams?: TeamData[];
  summary?: string;
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
