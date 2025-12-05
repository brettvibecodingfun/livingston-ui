import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PlayerForGuess {
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

@Injectable({
  providedIn: 'root'
})
export class GuessPlayerService {
  private apiUrl = '/api/guess-player/random';

  constructor(private http: HttpClient) {}

  getRandomPlayer(): Observable<PlayerForGuess> {
    return this.http.get<PlayerForGuess>(this.apiUrl);
  }
}

