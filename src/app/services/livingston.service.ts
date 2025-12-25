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
}

export interface QueryResponse {
  query: Query;
  rows: PlayerStatsRow[];
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
