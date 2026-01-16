import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BoglePlayer {
  rank: number;
  fullName: string;
  team: string;
  ppg: number;
  apg?: number;
  rpg?: number;
  spg?: number;
  bpg?: number;
  fgm?: number;
  fga?: number;
  fg_pct?: number;
  ftm?: number;
  fta?: number;
  ft_pct?: number;
  tpm?: number;
  tpa?: number;
  three_pct?: number;
  photoName: string;
}

export interface BogleGameData {
  question: string;
  players: BoglePlayer[];
}

export interface BogleGameInfo {
  success: boolean;
  date: string;
  data: {
    gameId: number;
    gameDate: string;
    gameQuestion: string;
    rankType?: string;
    querySchema?: any;
  };
}

export interface BogleScoreSubmission {
  username: string;
  gameScore: number;
  gameDate: string; // YYYY-MM-DD format
  gameQuestion: string;
  gameId: number;
  timeTaken?: number | null;
  answersCorrect: string[];
  answersMissed: string[];
}

export interface BogleScore {
  id: number;
  gameId: number;
  username: string;
  gameScore: number;
  gameDate: string;
  gameQuestion: string;
  timeTaken: number;
  createdAt: string;
  answersCorrect?: string[];
  answersMissed?: string[];
}

export interface BogleScoresResponse {
  success: boolean;
  date: string;
  count: number;
  data: BogleScore[];
}

@Injectable({
  providedIn: 'root'
})
export class BogleService {
  private apiUrl = '/api/bogle/daily-game';
  private scoresUrl = '/api/bogle/scores';
  private gamesUrl = '/api/bogle/games';

  constructor(private http: HttpClient) {}

  getDailyGame(question?: string, querySchema?: string): Observable<BogleGameData> {
    const params = new URLSearchParams();
    if (question) {
      params.append('question', question);
    }
    if (querySchema) {
      params.append('querySchema', querySchema);
    }
    const url = params.toString() 
      ? `${this.apiUrl}?${params.toString()}`
      : this.apiUrl;
    return this.http.get<BogleGameData>(url);
  }

  getGameInfo(date: string): Observable<BogleGameInfo> {
    return this.http.get<BogleGameInfo>(`${this.gamesUrl}?date=${encodeURIComponent(date)}`);
  }

  submitScore(scoreData: BogleScoreSubmission): Observable<any> {
    console.log('Submitting score:', scoreData);
    return this.http.post(this.scoresUrl, scoreData);
  }

  getScores(date: string): Observable<BogleScoresResponse> {
    return this.http.get<BogleScoresResponse>(`${this.scoresUrl}?date=${encodeURIComponent(date)}`);
  }
}

