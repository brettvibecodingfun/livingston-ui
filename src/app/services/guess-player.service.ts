import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PlayerForGuess {
  player_id?: number;
  season?: number;
  full_name: string;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
}

export interface GuessLeaderboardSubmission {
  userName: string;
  score: number;
  gameDate: string; // YYYY-MM-DD format
  playerIdSeason: string; // Format: "playerId-season"
}

export interface GuessLeaderboardEntry {
  id: number;
  userName: string;
  score: number;
  gameDate: string;
  playerIdSeason: string;
  createdAt: string;
}

export interface GuessLeaderboardResponse {
  success: boolean;
  playerIdSeason: string;
  count: number;
  data: GuessLeaderboardEntry[];
}

export interface PlayerFilters {
  ppgMin?: number;
  ppgMax?: number;
  apgMin?: number;
  apgMax?: number;
  rpgMin?: number;
  rpgMax?: number;
  ageMin?: number;
  ageMax?: number;
  team?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GuessPlayerService {
  private apiUrl = '/api/guess-player/random';
  private leaderboardUrl = '/api/guess-player-leaderboard';
  private leaderboardPlayerUrl = '/api/guess-player-leaderboard/player';

  constructor(private http: HttpClient) {}

  getRandomPlayer(filters?: PlayerFilters): Observable<PlayerForGuess> {
    let params = new HttpParams();
    
    if (filters) {
      if (filters.ppgMin != null) params = params.set('ppgMin', filters.ppgMin.toString());
      if (filters.ppgMax != null) params = params.set('ppgMax', filters.ppgMax.toString());
      if (filters.apgMin != null) params = params.set('apgMin', filters.apgMin.toString());
      if (filters.apgMax != null) params = params.set('apgMax', filters.apgMax.toString());
      if (filters.rpgMin != null) params = params.set('rpgMin', filters.rpgMin.toString());
      if (filters.rpgMax != null) params = params.set('rpgMax', filters.rpgMax.toString());
      if (filters.ageMin != null) params = params.set('ageMin', filters.ageMin.toString());
      if (filters.ageMax != null) params = params.set('ageMax', filters.ageMax.toString());
      if (filters.team) params = params.set('team', filters.team);
    }
    
    return this.http.get<PlayerForGuess>(this.apiUrl, { params });
  }

  submitGuess(guessData: GuessLeaderboardSubmission): Observable<any> {
    return this.http.post(this.leaderboardUrl, guessData);
  }

  getPlayerLeaderboard(playerIdSeason: string): Observable<GuessLeaderboardResponse> {
    const params = new HttpParams().set('playerIdSeason', playerIdSeason);
    return this.http.get<GuessLeaderboardResponse>(this.leaderboardPlayerUrl, { params });
  }
}

