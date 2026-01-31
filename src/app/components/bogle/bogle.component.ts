import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BogleService, BogleScoreSubmission, BogleScore } from '../../services/bogle.service';
import { BogleUsernameComponent } from './bogle-username/bogle-username.component';
import { BogleGameComponent } from './bogle-game/bogle-game.component';
import { BogleLeaderboardComponent } from './bogle-leaderboard/bogle-leaderboard.component';

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
  selector: 'app-bogle',
  standalone: true,
  imports: [CommonModule, BogleUsernameComponent, BogleGameComponent, BogleLeaderboardComponent],
  templateUrl: './bogle.component.html',
  styleUrl: './bogle.component.css'
})
export class BogleComponent implements OnInit {
  playerName = signal('');
  gameStarted = signal(false);
  hasPlayedToday = signal(false);
  showScoreModal = signal(false);
  
  leaderboard = signal<BogleScore[]>([]);
  isLoadingLeaderboard = signal(false);
  mostCorrectAnswers = signal<{ playerName: string; percentage: number }[]>([]);
  mostMissedAnswers = signal<{ playerName: string; percentage: number }[]>([]);
  gamesPlayedCount = signal<number>(0);
  storedGameAnswers = signal<RookiePlayer[]>([]);
  storedUserCorrectRanks = signal<number[]>([]);
  rankType = signal<string>('ppg');
  
  private readonly STORAGE_KEY = 'bogle_last_played_date';
  private readonly ANSWERS_STORAGE_KEY = 'bogle_game_answers';
  private readonly USERNAME_STORAGE_KEY = 'bogle_username';

  constructor(private bogleService: BogleService) {}

  ngOnInit() {
    // Load username from localStorage if it exists
    const savedUsername = localStorage.getItem(this.USERNAME_STORAGE_KEY);
    if (savedUsername) {
      this.playerName.set(savedUsername);
    }
    
    this.checkIfPlayedToday();
  }

  private checkIfPlayedToday() {
    const lastPlayedDate = localStorage.getItem(this.STORAGE_KEY);
    const today = this.getCentralTimeDate();
    
    if (lastPlayedDate === today) {
      this.hasPlayedToday.set(true);
      this.loadGameAnswersForDisplay(today);
      this.loadLeaderboard();
    } else {
      this.hasPlayedToday.set(false);
    }
  }

  onStartGame(username: string) {
    this.playerName.set(username);
    this.gameStarted.set(true);
    this.hasPlayedToday.set(false);
  }

  onGameEnded(event: {
    score: number;
    timeElapsed: number;
    correctAnswers: RookiePlayer[];
    userCorrectRanks: number[];
    rankType: string;
    gameId: number;
    gameQuestion: string;
  }) {
    this.hasPlayedToday.set(true);
    this.rankType.set(event.rankType);
    this.storedGameAnswers.set(event.correctAnswers.sort((a, b) => a.rank - b.rank));
    this.storedUserCorrectRanks.set(event.userCorrectRanks);
    this.showScoreModal.set(true);
    this.submitScore(event);
  }

  private submitScore(event: {
    score: number;
    timeElapsed: number;
    correctAnswers: RookiePlayer[];
    userCorrectRanks: number[];
    rankType: string;
    gameId: number;
    gameQuestion: string;
  }) {
    const centralDate = this.getCentralTimeDate();
    
    const answersCorrect = event.correctAnswers
      .filter(player => event.userCorrectRanks.includes(player.rank))
      .map(player => player.fullName);
    
    const answersMissed = event.correctAnswers
      .filter(player => !event.userCorrectRanks.includes(player.rank))
      .map(player => player.fullName);
    
    const scoreData: BogleScoreSubmission = {
      username: this.playerName(),
      gameScore: event.score,
      gameDate: centralDate,
      gameQuestion: event.gameQuestion,
      gameId: event.gameId,
      timeTaken: event.timeElapsed,
      answersCorrect: answersCorrect,
      answersMissed: answersMissed
    };

    this.bogleService.submitScore(scoreData).subscribe({
      next: (response) => {
        console.log('Score submitted successfully:', response);
        setTimeout(() => {
          this.loadLeaderboard();
        }, 500);
      },
      error: (err) => {
        console.error('Error submitting score:', err);
        setTimeout(() => {
          this.loadLeaderboard();
        }, 500);
      }
    });
  }

  private loadGameAnswersForDisplay(date: string) {
    this.bogleService.getGameInfo(date).subscribe({
      next: (gameInfo) => {
        if (gameInfo.success && gameInfo.data) {
          let rankType = gameInfo.data.rankType || 'ppg';
          rankType = this.normalizeRankType(rankType);
          this.rankType.set(rankType);
          
          const gameData = this.loadGameAnswers(date);
          if (gameData) {
            const sortedAnswers = [...gameData.correctAnswers].sort((a, b) => a.rank - b.rank);
            this.storedGameAnswers.set(sortedAnswers);
            this.storedUserCorrectRanks.set(gameData.userCorrectRanks);
          }
        }
      },
      error: (err) => {
        console.error('Error loading game info for display:', err);
        const gameData = this.loadGameAnswers(date);
        if (gameData) {
          const sortedAnswers = [...gameData.correctAnswers].sort((a, b) => a.rank - b.rank);
          this.storedGameAnswers.set(sortedAnswers);
          this.storedUserCorrectRanks.set(gameData.userCorrectRanks);
        }
      }
    });
  }

  private loadGameAnswers(date: string): { correctAnswers: RookiePlayer[], userCorrectRanks: number[] } | null {
    try {
      const stored = localStorage.getItem(`${this.ANSWERS_STORAGE_KEY}_${date}`);
      if (stored) {
        const gameData = JSON.parse(stored);
        return {
          correctAnswers: gameData.correctAnswers,
          userCorrectRanks: gameData.userCorrectAnswers || []
        };
      }
    } catch (e) {
      console.error('Error loading game answers:', e);
    }
    return null;
  }

  private loadLeaderboard() {
    this.isLoadingLeaderboard.set(true);
    const centralDate = this.getCentralTimeDate();

    this.bogleService.getScores(centralDate).subscribe({
      next: (response) => {
        if (response.count != null) {
          this.gamesPlayedCount.set(response.count);
        }
        
        if (response.success && response.data) {
          const sorted = [...response.data].sort((a, b) => {
            if (b.gameScore !== a.gameScore) {
              return b.gameScore - a.gameScore;
            }
            return a.timeTaken - b.timeTaken;
          });
          
          this.leaderboard.set(sorted.slice(0, 10));
          this.calculateAnswerStatistics(response.data);
        } else {
          this.mostCorrectAnswers.set([]);
          this.mostMissedAnswers.set([]);
          this.gamesPlayedCount.set(0);
        }
        
        if (this.storedGameAnswers().length === 0) {
          this.loadGameAnswersForDisplay(centralDate);
        }
        
        this.isLoadingLeaderboard.set(false);
      },
      error: (err) => {
        console.error('Error loading leaderboard:', err);
        this.isLoadingLeaderboard.set(false);
      }
    });
  }

  private calculateAnswerStatistics(scores: BogleScore[]) {
    const correctCounts: { [playerName: string]: number } = {};
    const missedCounts: { [playerName: string]: number } = {};
    
    let totalScoresWithCorrect = 0;
    const totalGamesPlayed = scores.filter(score => 
      (score.answersCorrect && Array.isArray(score.answersCorrect)) || 
      (score.answersMissed && Array.isArray(score.answersMissed))
    ).length;

    scores.forEach(score => {
      if (score.answersCorrect && Array.isArray(score.answersCorrect)) {
        totalScoresWithCorrect++;
        score.answersCorrect.forEach(playerName => {
          correctCounts[playerName] = (correctCounts[playerName] || 0) + 1;
        });
      }

      if (score.answersMissed && Array.isArray(score.answersMissed)) {
        score.answersMissed.forEach(playerName => {
          missedCounts[playerName] = (missedCounts[playerName] || 0) + 1;
        });
      }
    });

    const topCorrect = Object.entries(correctCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map(([playerName, count]) => ({
        playerName,
        percentage: totalScoresWithCorrect > 0 ? Math.round((count / totalScoresWithCorrect) * 100) : 0
      }));

    const topMissed = Object.entries(missedCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map(([playerName, usersWhoGotItWrong]) => ({
        playerName,
        percentage: totalGamesPlayed > 0 ? Math.round(((totalGamesPlayed - usersWhoGotItWrong) / totalGamesPlayed) * 100) : 0
      }));

    this.mostCorrectAnswers.set(topCorrect);
    this.mostMissedAnswers.set(topMissed);
  }

  closeScoreModal() {
    this.showScoreModal.set(false);
    if (this.hasPlayedToday() && this.storedGameAnswers().length === 0) {
      const today = this.getCentralTimeDate();
      this.loadGameAnswersForDisplay(today);
    }
  }

  clearLocalStorage() {
    if (confirm('Are you sure you want to clear all local storage? This will reset your saved preferences and game data.')) {
      localStorage.clear();
      alert('Local storage has been cleared. The page will reload.');
      window.location.reload();
    }
  }

  private getCentralTimeDate(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    
    return `${year}-${month}-${day}`;
  }

  private normalizeRankType(rankType: string): string {
    const normalized = rankType.toLowerCase().trim();
    const mapping: { [key: string]: string } = {
      '3pm': 'tpm',
      '3pa': 'tpa',
      '3p%': 'three_pct',
      '3p': 'three_pct',
      'tp%': 'three_pct',
      'tpm': 'tpm',
      'tpa': 'tpa',
      'fgm': 'fgm',
      'fga': 'fga',
      'fg%': 'fg_pct',
      'fg': 'fg_pct',
      'ftm': 'ftm',
      'fta': 'fta',
      'ft%': 'ft_pct',
      'ft': 'ft_pct',
      'net rating': 'net_rating',
      'net_rating': 'net_rating',
      'netrating': 'net_rating',
      'net': 'net_rating'
    };
    return mapping[normalized] || normalized;
  }

  getScore(): number {
    return this.storedUserCorrectRanks().length;
  }
}
