import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ConferenceStandings {
  teamId: number;
  team: string;
  seed: number;
  wins: number;
  losses: number;
  gamesBack: string;
}

export interface StandingsResponse {
  east: ConferenceStandings[];
  west: ConferenceStandings[];
}

@Injectable({
  providedIn: 'root'
})
export class StandingsService {
  private apiUrl = '/api/standings';

  constructor(private http: HttpClient) {}

  getStandings(season: number): Observable<StandingsResponse> {
    return this.http.get<StandingsResponse>(`${this.apiUrl}/${season}`);
  }
}

