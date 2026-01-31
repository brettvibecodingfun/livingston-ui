import { Component, signal, OnInit, OnDestroy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BogleService, BoglePlayer, BogleGameInfo, BogleGameData } from '../../../services/bogle.service';

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

interface Answer {
  playerName: string;
  rank: number | null;
  isCorrect: boolean | null;
  playerData?: RookiePlayer;
}

@Component({
  selector: 'app-bogle-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bogle-game.component.html',
  styleUrl: './bogle-game.component.css'
})
export class BogleGameComponent implements OnInit, OnDestroy {
  playerName = input.required<string>();
  
  question = signal('');
  playerInput = signal('');
  answers = signal<Answer[]>([]);
  gameOver = signal(false);
  isLoading = signal(true);
  error = signal<string | null>(null);
  timeRemaining = signal(180);
  timeElapsed = signal(0);
  
  gameEnded = output<{
    score: number;
    timeElapsed: number;
    correctAnswers: RookiePlayer[];
    userCorrectRanks: number[];
    rankType: string;
    gameId: number;
    gameQuestion: string;
  }>();

  private correctAnswers: RookiePlayer[] = [];
  private timerInterval: any = null;
  private gameStartTime: number = 0;
  private gameId: number = 0;
  private rankType: string = 'ppg';
  private readonly STORAGE_KEY = 'bogle_last_played_date';
  private readonly ANSWERS_STORAGE_KEY = 'bogle_game_answers';

  constructor(private bogleService: BogleService) {}

  ngOnInit() {
    this.loadDailyGame();
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  loadDailyGame() {
    this.isLoading.set(true);
    this.error.set(null);

    const centralDate = this.getCentralTimeDate();

    this.bogleService.getGameInfo(centralDate).subscribe({
      next: (gameInfo: BogleGameInfo) => {
        if (gameInfo.success && gameInfo.data) {
          this.gameId = gameInfo.data.gameId;
          const gameQuestion = gameInfo.data.gameQuestion;
          let rankType = gameInfo.data.rankType || 'ppg';
          rankType = this.normalizeRankType(rankType);
          this.rankType = rankType;
          
          let querySchemaParam: string | undefined;
          if (gameInfo.data.querySchema) {
            try {
              JSON.parse(gameInfo.data.querySchema);
              querySchemaParam = gameInfo.data.querySchema;
            } catch (e) {
              console.error('Invalid querySchema JSON:', e);
            }
          }

          this.bogleService.getDailyGame(querySchemaParam ? undefined : gameQuestion, querySchemaParam).subscribe({
            next: (data: BogleGameData) => {
              this.question.set(gameQuestion);
              this.correctAnswers = data.players.map((player: BoglePlayer) => ({
                rank: player.rank,
                fullName: player.fullName,
                team: player.team,
                ppg: player.ppg,
                apg: player.apg,
                rpg: player.rpg,
                spg: player.spg,
                bpg: player.bpg,
                fgm: player.fgm,
                fga: player.fga,
                fg_pct: player.fg_pct,
                ftm: player.ftm,
                fta: player.fta,
                ft_pct: player.ft_pct,
                tpm: player.tpm,
                tpa: player.tpa,
                three_pct: player.three_pct,
                net_rating: player.net_rating,
                photoName: player.photoName
              }));
              
              this.isLoading.set(false);
              this.startTimer();
            },
            error: (err: any) => {
              console.error('Error loading daily game:', err);
              this.error.set(err.message || 'Failed to load daily game');
              this.isLoading.set(false);
            }
          });
        } else {
          this.error.set('Failed to get game info');
          this.isLoading.set(false);
        }
      },
      error: (err: any) => {
        console.error('Error loading game info:', err);
        this.error.set(err.message || 'Failed to load game info');
        this.isLoading.set(false);
      }
    });
  }

  onInputChange(value: string) {
    if (this.gameOver()) return;
    
    this.playerInput.set(value);
    
    const trimmedValue = value.trim();
    if (trimmedValue.length > 0) {
      const matchedPlayer = this.findMatchingPlayer(trimmedValue);
      
      if (matchedPlayer) {
        const alreadyAnswered = this.answers().some(
          answer => answer.rank === matchedPlayer.rank
        );
        
        if (!alreadyAnswered) {
          setTimeout(() => {
            this.submitAnswer(trimmedValue, matchedPlayer);
          }, 0);
        }
      }
    }
  }
  
  private submitAnswer(input: string, matchedPlayer: RookiePlayer | null) {
    if (!input) return;
    
    const alreadyAnswered = this.answers().some(
      answer => answer.playerName.toLowerCase() === input.toLowerCase() ||
                 answer.rank === matchedPlayer?.rank
    );

    if (alreadyAnswered) {
      this.playerInput.set('');
      return;
    }

    if (matchedPlayer) {
      const rankAlreadyFilled = this.answers().some(
        answer => answer.rank === matchedPlayer.rank
      );

      if (rankAlreadyFilled) {
        this.answers.update(answers => [
          ...answers,
          { playerName: input, rank: null, isCorrect: false }
        ]);
      } else {
        this.answers.update(answers => {
          const newAnswers = [...answers, {
            playerName: matchedPlayer.fullName,
            rank: matchedPlayer.rank,
            isCorrect: true,
            playerData: matchedPlayer
          }];
          const sorted = newAnswers.sort((a, b) => {
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return a.rank - b.rank;
          });
          
          const correctCount = sorted.filter(a => a.isCorrect === true && a.rank !== null).length;
          if (correctCount === 10) {
            setTimeout(() => {
              this.endGame();
            }, 100);
          }
          
          return sorted;
        });
      }
    } else {
      this.answers.update(answers => [
        ...answers,
        { playerName: input, rank: null, isCorrect: false }
      ]);
    }

    this.playerInput.set('');
  }

  onSubmitAnswer() {
    if (this.gameOver()) return;
    
    const input = this.playerInput().trim();
    if (!input) return;

    const matchedPlayer = this.findMatchingPlayer(input);
    this.submitAnswer(input, matchedPlayer);
  }

  private findMatchingPlayer(input: string): RookiePlayer | null {
    const inputLower = input.toLowerCase().trim();
    
    let match = this.correctAnswers.find(
      player => player.fullName.toLowerCase() === inputLower
    );
    
    if (match) return match;
    
    match = this.correctAnswers.find(
      player => player.fullName.toLowerCase().replace(/\s+/g, ' ') === inputLower.replace(/\s+/g, ' ')
    );
    
    if (match) return match;
    
    match = this.correctAnswers.find(player => {
      const nameParts = player.fullName.toLowerCase().split(' ');
      return nameParts.some(part => part === inputLower) ||
             (nameParts.length > 0 && nameParts[0] === inputLower) ||
             (nameParts.length > 1 && nameParts[nameParts.length - 1] === inputLower);
    });
    
    return match || null;
  }

  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onSubmitAnswer();
    }
  }

  getAnswerForRank(rank: number): Answer | null {
    const answers = this.answers();
    const userAnswer = answers.find(answer => answer.rank === rank);
    
    if (this.gameOver()) {
      if (userAnswer) {
        return userAnswer;
      } else {
        const correctPlayer = this.correctAnswers.find(p => p.rank === rank);
        if (correctPlayer) {
          return {
            playerName: correctPlayer.fullName,
            rank: correctPlayer.rank,
            isCorrect: false,
            playerData: correctPlayer
          };
        }
      }
    }
    
    return userAnswer || null;
  }

  onGiveUp() {
    this.endGame();
  }

  private endGame() {
    this.stopTimer();
    this.gameOver.set(true);
    this.answers.update(answers => {
      return answers.map(answer => {
        if (answer.isCorrect === null) {
          return { ...answer, isCorrect: false };
        }
        return answer;
      });
    });
    
    const today = this.getCentralTimeDate();
    localStorage.setItem(this.STORAGE_KEY, today);
    
    this.saveGameAnswers(today);
    
    const correctRanks = this.answers()
      .filter(answer => answer.isCorrect === true && answer.rank !== null)
      .map(answer => answer.rank!);
    
    this.gameEnded.emit({
      score: this.getScore(),
      timeElapsed: this.timeElapsed(),
      correctAnswers: this.correctAnswers,
      userCorrectRanks: correctRanks,
      rankType: this.rankType,
      gameId: this.gameId,
      gameQuestion: this.question()
    });
  }

  private saveGameAnswers(date: string) {
    const gameData = {
      date: date,
      correctAnswers: this.correctAnswers.map(player => ({
        rank: player.rank,
        fullName: player.fullName,
        team: player.team,
        ppg: player.ppg,
        apg: player.apg,
        rpg: player.rpg,
        spg: player.spg,
        bpg: player.bpg,
        fgm: player.fgm,
        fga: player.fga,
        fg_pct: player.fg_pct,
        ftm: player.ftm,
        fta: player.fta,
        ft_pct: player.ft_pct,
        tpm: player.tpm,
        tpa: player.tpa,
        three_pct: player.three_pct,
        net_rating: player.net_rating,
        photoName: player.photoName
      })),
      userCorrectAnswers: this.answers()
        .filter(answer => answer.isCorrect === true && answer.rank !== null)
        .map(answer => answer.rank)
    };
    
    localStorage.setItem(`${this.ANSWERS_STORAGE_KEY}_${date}`, JSON.stringify(gameData));
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

  getScore(): number {
    const correctAnswers = this.answers().filter(
      answer => answer.isCorrect === true && answer.rank !== null
    );
    return correctAnswers.length;
  }

  private startTimer() {
    this.gameStartTime = Date.now();
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      
      this.timeElapsed.set(elapsed);
      this.timeRemaining.set(remaining);
      
      if (remaining === 0) {
        this.endGame();
      }
    }, 100);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.gameStartTime > 0) {
      const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
      this.timeElapsed.set(Math.min(elapsed, 180));
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    return statMap[this.rankType] || 'PPG';
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
    
    const value = statMap[this.rankType];
    if (value == null || value === undefined) return null;
    
    if (this.rankType === 'fg_pct' || this.rankType === 'ft_pct' || this.rankType === 'three_pct') {
      return (value * 100).toFixed(1) + '%';
    }
    
    return value.toFixed(1);
  }

  getHeadshotSrc(playerData: RookiePlayer): string {
    return `/assets/playerHeadshots/${encodeURIComponent(playerData.photoName)}.jpg`;
  }
}
