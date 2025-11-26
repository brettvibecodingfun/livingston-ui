import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BoxScorePlayer {
  id: number;
  player_name: string;
  first_name: string;
  last_name: string;
  team_name: string;
  team_abbr: string;
  minutes: number | null;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
}

export interface Game {
  game_id: number;
  game_date: string;
  home_team_name: string;
  home_team_abbr: string;
  away_team_name: string;
  away_team_abbr: string;
  home_score: number | null;
  away_score: number | null;
  boxScores: BoxScorePlayer[];
}

export interface PreviousNightGamesResponse {
  games: Game[];
}

@Injectable({
  providedIn: 'root'
})
export class BoxScoresService {
  private apiUrl = '/api/box-scores/previous-night';

  constructor(private http: HttpClient) {}

  getPreviousNightGames(): Observable<PreviousNightGamesResponse> {
    return this.http.get<PreviousNightGamesResponse>(this.apiUrl);
  }
}

