import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PlayerInfo {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  college: string | null;
  country: string | null;
  draft_year: number | null;
  age: number | null;
  height: string | null;
  weight: number | null;
  position: string | null;
  base_salary: number | null;
  team: string | null;
  team_name: string | null;
  games_played: number | null;
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

@Injectable({
  providedIn: 'root'
})
export class PlayerInfoService {
  private apiUrl = '/api/player'; // Backend API endpoint

  constructor(private http: HttpClient) {}

  getPlayerInfo(playerName: string): Observable<PlayerInfo> {
    const encodedName = encodeURIComponent(playerName);
    return this.http.get<PlayerInfo>(`${this.apiUrl}/${encodedName}`);
  }
}

