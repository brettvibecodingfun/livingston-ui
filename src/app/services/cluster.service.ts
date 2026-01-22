import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ClusterData {
  id: number;
  age: number;
  clusterNumber: number;
  playerId: number;
  season: number;
  playerName: string;
  playerFullName: string;
  playerPosition: string;
  playerTeamId: number;
  points: number;
  assists: number;
  rebounds: number;
  fgPct: number;
  threePct: number;
  ftPct: number;
  gamesPlayed: number;
  minutes: number;
  historicalSeasonAverageId: number | null;
  seasonAverageId: number | null;
  createdAt: string;
}

export interface ClustersResponse {
  success: boolean;
  age: number;
  clusterNumber: number;
  count: number;
  data: ClusterData[];
}

export interface PlayerInfo {
  id: number;
  fullName: string;
  position: string;
  teamId: number;
}

export interface PlayerClusterResponse {
  success: boolean;
  player: PlayerInfo;
  season: number;
  count: number;
  data: ClusterData[];
}

@Injectable({
  providedIn: 'root'
})
export class ClusterService {
  private apiUrl = '/api/clusters';

  constructor(private http: HttpClient) {}

  getClusters(age: number, clusterNumber: number): Observable<ClustersResponse> {
    const params = new HttpParams()
      .set('age', age.toString())
      .set('clusterNumber', clusterNumber.toString());
    
    return this.http.get<ClustersResponse>(this.apiUrl, { params });
  }

  getPlayerCluster(name: string): Observable<PlayerClusterResponse> {
    const params = new HttpParams().set('name', name);
    
    return this.http.get<PlayerClusterResponse>(`${this.apiUrl}/player`, { params });
  }
}
