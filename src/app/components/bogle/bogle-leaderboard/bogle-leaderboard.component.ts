import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BogleScore } from '../../../services/bogle.service';

interface RookiePlayer {
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
  net_rating?: number;
  photoName: string;
}

@Component({
  selector: 'app-bogle-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bogle-leaderboard.component.html',
  styleUrl: './bogle-leaderboard.component.css'
})
export class BogleLeaderboardComponent {
  leaderboard = input.required<BogleScore[]>();
  isLoadingLeaderboard = input.required<boolean>();
  playerName = input<string>('');
  gamesPlayedCount = input<number>(0);
  mostCorrectAnswers = input<{ playerName: string; percentage: number }[]>([]);
  mostMissedAnswers = input<{ playerName: string; percentage: number }[]>([]);
  storedGameAnswers = input<RookiePlayer[]>([]);
  storedUserCorrectRanks = input<number[]>([]);
  rankType = input<string>('ppg');
  isLightMode = input<boolean>(false);
  
  clearStorage = output<void>();

  formatTimeForLeaderboard(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  wasPlayerCorrect(playerRank: number): boolean {
    return this.storedUserCorrectRanks().includes(playerRank);
  }

  getHeadshotSrc(playerData: RookiePlayer): string {
    return `/assets/playerHeadshots/${encodeURIComponent(playerData.photoName)}.jpg`;
  }

  getStatHeaderName(): string {
    const statMap: { [key: string]: string } = {
      'ppg': 'PPG',
      'apg': 'APG',
      'rpg': 'RPG',
      'spg': 'SPG',
      'bpg': 'BPG',
      'fgm': 'FGM',
      'fga': 'FGA',
      'fg_pct': 'FG%',
      'ftm': 'FTM',
      'fta': 'FTA',
      'ft_pct': 'FT%',
      'tpm': '3PM',
      'tpa': '3PA',
      'three_pct': '3P%',
      'net_rating': 'NET'
    };
    return statMap[this.rankType()] || 'PPG';
  }

  getStatValue(player: RookiePlayer | null | undefined): string | null {
    if (!player) return null;
    
    const statMap: { [key: string]: number | undefined } = {
      'ppg': player.ppg,
      'apg': player.apg,
      'rpg': player.rpg,
      'spg': player.spg,
      'bpg': player.bpg,
      'fgm': player.fgm,
      'fga': player.fga,
      'fg_pct': player.fg_pct,
      'ftm': player.ftm,
      'fta': player.fta,
      'ft_pct': player.ft_pct,
      'tpm': player.tpm,
      'tpa': player.tpa,
      'three_pct': player.three_pct,
      'net_rating': player.net_rating
    };
    
    const value = statMap[this.rankType()];
    if (value == null || value === undefined) return null;
    
    // Format percentages differently (multiply by 100 and add %)
    if (this.rankType() === 'fg_pct' || this.rankType() === 'ft_pct' || this.rankType() === 'three_pct') {
      return (value * 100).toFixed(1) + '%';
    }
    
    // Format to 1 decimal place for other stats
    return value.toFixed(1);
  }

  onClearStorage() {
    this.clearStorage.emit();
  }
}
