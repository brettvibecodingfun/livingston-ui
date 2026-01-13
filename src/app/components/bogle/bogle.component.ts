import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BogleService, BoglePlayer, BogleScoreSubmission, BogleScore } from '../../services/bogle.service';

interface RookiePlayer {
  rank: number;
  fullName: string;
  team: string;
  ppg: number;
  apg?: number;
  rpg?: number;
  spg?: number;
  bpg?: number;
  photoName: string; // For constructing image path
}

interface Answer {
  playerName: string;
  rank: number | null; // The correct rank (1-10) or null if incorrect
  isCorrect: boolean | null; // null = not checked yet, true = correct, false = incorrect
  playerData?: RookiePlayer; // Full player data if correct
}

@Component({
  selector: 'app-bogle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bogle.component.html',
  styleUrl: './bogle.component.css'
})
export class BogleComponent implements OnInit, OnDestroy {
  question = signal('');
  playerInput = signal('');
  answers = signal<Answer[]>([]);
  gameOver = signal(false);
  isLoading = signal(true);
  error = signal<string | null>(null);
  showScoreModal = signal(false);
  playerName = signal('');
  gameStarted = signal(false);
  timeRemaining = signal(180); // 3 minutes in seconds
  timeElapsed = signal(0); // Time taken in seconds
  leaderboard = signal<BogleScore[]>([]);
  isLoadingLeaderboard = signal(false);
  hasPlayedToday = signal(false);
  mostCorrectAnswers = signal<string[]>([]);
  mostMissedAnswers = signal<string[]>([]);

  // Correct answers loaded from database
  private correctAnswers: RookiePlayer[] = [];
  private timerInterval: any = null;
  private gameStartTime: number = 0;
  private gameId: number = 0;
  private rankType: string = 'ppg'; // Default to points per game
  private readonly STORAGE_KEY = 'bogle_last_played_date';
  private readonly ANSWERS_STORAGE_KEY = 'bogle_game_answers'; // Store game answers by date

  constructor(private bogleService: BogleService) {}

  ngOnInit() {
    // Check if user has already played today
    this.checkIfPlayedToday();
  }

  private checkIfPlayedToday() {
    const lastPlayedDate = localStorage.getItem(this.STORAGE_KEY);
    const today = this.getCentralTimeDate();
    
    if (lastPlayedDate === today) {
      this.hasPlayedToday.set(true);
      // Load game answers from localStorage
      this.loadGameAnswersForDisplay(today);
      // Load leaderboard if they've already played today
      this.loadLeaderboard();
    } else {
      this.hasPlayedToday.set(false);
    }
  }

  // Store loaded game answers for display
  storedGameAnswers = signal<RookiePlayer[]>([]);
  storedUserCorrectRanks = signal<number[]>([]);

  private loadGameAnswersForDisplay(date: string) {
    const gameData = this.loadGameAnswers(date);
    if (gameData) {
      // Sort answers by rank for display
      const sortedAnswers = [...gameData.correctAnswers].sort((a, b) => a.rank - b.rank);
      this.storedGameAnswers.set(sortedAnswers);
      this.storedUserCorrectRanks.set(gameData.userCorrectRanks);
    } else {
      // If no stored data but we have current game data, use it
      if (this.correctAnswers.length > 0) {
        // Sort answers by rank for display
        const sortedAnswers = [...this.correctAnswers].sort((a, b) => a.rank - b.rank);
        this.storedGameAnswers.set(sortedAnswers);
        const correctRanks = this.answers()
          .filter(answer => answer.isCorrect === true && answer.rank !== null)
          .map(answer => answer.rank!);
        this.storedUserCorrectRanks.set(correctRanks);
      } else {
        // Try to load from API if we don't have the data
        this.loadGameDataForDisplay(date);
      }
    }
  }

  private loadGameDataForDisplay(date: string) {
    // Load game data from API to show answers even if not stored in localStorage
    this.bogleService.getGameInfo(date).subscribe({
      next: (gameInfo) => {
        if (gameInfo.success && gameInfo.data) {
          const gameQuestion = gameInfo.data.gameQuestion;
          this.rankType = gameInfo.data.rankType || 'ppg';
          
          // Load the game data
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
            next: (data) => {
              const players = data.players.map(player => ({
                rank: player.rank,
                fullName: player.fullName,
                team: player.team,
                ppg: player.ppg,
                apg: player.apg,
                rpg: player.rpg,
                spg: player.spg,
                bpg: player.bpg,
                photoName: player.photoName
              }));
              // Sort answers by rank for display
              const sortedPlayers = [...players].sort((a, b) => a.rank - b.rank);
              this.storedGameAnswers.set(sortedPlayers);
              
              // Load user's correct answers from localStorage if available
              const gameData = this.loadGameAnswers(date);
              if (gameData && gameData.userCorrectRanks) {
                this.storedUserCorrectRanks.set(gameData.userCorrectRanks);
              } else {
                this.storedUserCorrectRanks.set([]);
              }
            },
            error: (err) => {
              console.error('Error loading game data for display:', err);
            }
          });
        }
      },
      error: (err) => {
        console.error('Error loading game info for display:', err);
      }
    });
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  loadDailyGame() {
    this.isLoading.set(true);
    this.error.set(null);

    // Get today's date in Central Time
    const centralDate = this.getCentralTimeDate();

    // First, get the game info (gameId and gameQuestion)
    this.bogleService.getGameInfo(centralDate).subscribe({
      next: (gameInfo) => {
        if (gameInfo.success && gameInfo.data) {
          this.gameId = gameInfo.data.gameId;
          // Use the gameQuestion from the API response
          const gameQuestion = gameInfo.data.gameQuestion;
          // Get rankType or default to 'ppg'
          this.rankType = gameInfo.data.rankType || 'ppg';
          
          // Check if querySchema exists - if so, use it instead of the question
          let querySchemaParam: string | undefined;
          if (gameInfo.data.querySchema) {
            // querySchema is sent as a string, parse it to validate it's valid JSON
            try {
              JSON.parse(gameInfo.data.querySchema);
              querySchemaParam = gameInfo.data.querySchema;
            } catch (e) {
              console.error('Invalid querySchema JSON:', e);
              // Fall back to using question if querySchema is invalid
            }
          }

          // Then load the daily game data, passing either querySchema or question
          this.bogleService.getDailyGame(querySchemaParam ? undefined : gameQuestion, querySchemaParam).subscribe({
            next: (data) => {
              // Use the question from the game info API
              this.question.set(gameQuestion);
              // Transform BoglePlayer to RookiePlayer format
              this.correctAnswers = data.players.map(player => ({
                rank: player.rank,
                fullName: player.fullName,
                team: player.team,
                ppg: player.ppg,
                apg: player.apg,
                rpg: player.rpg,
                spg: player.spg,
                bpg: player.bpg,
                photoName: player.photoName
              }));
              
              // Also store in storedGameAnswers for display (if user has already played today)
              // If user has played, try loading from localStorage first
              if (this.hasPlayedToday()) {
                this.loadGameAnswersForDisplay(centralDate);
              } else {
                // If not played yet, store current answers (will be saved when game ends)
                // Sort answers by rank for display
                const sortedAnswers = [...this.correctAnswers].sort((a, b) => a.rank - b.rank);
                this.storedGameAnswers.set(sortedAnswers);
              }
              
              this.isLoading.set(false);
              // Start timer after game loads
              this.startTimer();
            },
            error: (err) => {
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
      error: (err) => {
        console.error('Error loading game info:', err);
        this.error.set(err.message || 'Failed to load game info');
        this.isLoading.set(false);
      }
    });
  }

  onInputChange(value: string) {
    if (this.gameOver()) return; // Don't process input if game is over
    
    this.playerInput.set(value);
    
    // Check for auto-submit on exact match (Sporcle-style)
    const trimmedValue = value.trim();
    if (trimmedValue.length > 0) {
      // Check if this matches a correct answer exactly
      const matchedPlayer = this.findMatchingPlayer(trimmedValue);
      
      if (matchedPlayer) {
        // Check if already answered
        const alreadyAnswered = this.answers().some(
          answer => answer.rank === matchedPlayer.rank
        );
        
        if (!alreadyAnswered) {
          // Auto-submit the correct answer
          setTimeout(() => {
            this.submitAnswer(trimmedValue, matchedPlayer);
          }, 0);
        }
      }
    }
  }
  
  private submitAnswer(input: string, matchedPlayer: RookiePlayer | null) {
    if (!input) return;
    
    // Check if this player is already in the answers list
    const alreadyAnswered = this.answers().some(
      answer => answer.playerName.toLowerCase() === input.toLowerCase() ||
                 answer.rank === matchedPlayer?.rank
    );

    if (alreadyAnswered) {
      // Clear input and return
      this.playerInput.set('');
      return;
    }

    if (matchedPlayer) {
      // Check if this rank is already filled
      const rankAlreadyFilled = this.answers().some(
        answer => answer.rank === matchedPlayer.rank
      );

      if (rankAlreadyFilled) {
        // Rank already filled, treat as incorrect
        this.answers.update(answers => [
          ...answers,
          { playerName: input, rank: null, isCorrect: false }
        ]);
      } else {
        // Correct answer! Add it with the correct rank
        this.answers.update(answers => {
          const newAnswers = [...answers, {
            playerName: matchedPlayer.fullName, // Use the correct full name
            rank: matchedPlayer.rank,
            isCorrect: true,
            playerData: matchedPlayer
          }];
          // Sort by rank to keep them in order
          const sorted = newAnswers.sort((a, b) => {
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return a.rank - b.rank;
          });
          
          // Check if all 10 players are correct
          const correctCount = sorted.filter(a => a.isCorrect === true && a.rank !== null).length;
          if (correctCount === 10) {
            // All players found! End the game
            setTimeout(() => {
              this.endGame();
            }, 100);
          }
          
          return sorted;
        });
      }
    } else {
      // Incorrect answer
      this.answers.update(answers => [
        ...answers,
        { playerName: input, rank: null, isCorrect: false }
      ]);
    }

    // Clear input
    this.playerInput.set('');
  }

  onSubmitAnswer() {
    if (this.gameOver()) return; // Don't accept answers if game is over
    
    const input = this.playerInput().trim();
    if (!input) return;

    // Check if the answer matches any of the correct answers
    const matchedPlayer = this.findMatchingPlayer(input);
    this.submitAnswer(input, matchedPlayer);
  }

  private findMatchingPlayer(input: string): RookiePlayer | null {
    const inputLower = input.toLowerCase().trim();
    
    // Try exact match first (for auto-submit)
    let match = this.correctAnswers.find(
      player => player.fullName.toLowerCase() === inputLower
    );
    
    if (match) return match;
    
    // Try match ignoring case and extra spaces
    match = this.correctAnswers.find(
      player => player.fullName.toLowerCase().replace(/\s+/g, ' ') === inputLower.replace(/\s+/g, ' ')
    );
    
    if (match) return match;
    
    // Try partial match (first name or last name) - but only if it's a complete word match
    match = this.correctAnswers.find(player => {
      const nameParts = player.fullName.toLowerCase().split(' ');
      // Check if input matches a complete first or last name
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
    // Find answer with matching rank
    const userAnswer = answers.find(answer => answer.rank === rank);
    
    // If game is over, show all answers (guessed or not)
    if (this.gameOver()) {
      if (userAnswer) {
        // User guessed this one - return their answer (correct or incorrect)
        return userAnswer;
      } else {
        // User didn't guess this one - show it in red as missed
        const correctPlayer = this.correctAnswers.find(p => p.rank === rank);
        if (correctPlayer) {
          return {
            playerName: correctPlayer.fullName,
            rank: correctPlayer.rank,
            isCorrect: false, // Mark as false to show in red (missed)
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
    // Mark all incorrect answers
    this.answers.update(answers => {
      return answers.map(answer => {
        if (answer.isCorrect === null) {
          return { ...answer, isCorrect: false };
        }
        return answer;
      });
    });
    
    // Mark that user has played today in localStorage
    const today = this.getCentralTimeDate();
    localStorage.setItem(this.STORAGE_KEY, today);
    this.hasPlayedToday.set(true);
    
    // Store game answers in localStorage
    this.saveGameAnswers(today);
    
    // Set stored answers for display (will be used in the modal)
    // Sort answers by rank for display
    const sortedAnswers = [...this.correctAnswers].sort((a, b) => a.rank - b.rank);
    this.storedGameAnswers.set(sortedAnswers);
    const correctRanks = this.answers()
      .filter(answer => answer.isCorrect === true && answer.rank !== null)
      .map(answer => answer.rank!);
    this.storedUserCorrectRanks.set(correctRanks);
    
    // Show score modal
    this.showScoreModal.set(true);
    
    // Submit score to database, then load leaderboard after success
    this.submitScore();
  }

  private saveGameAnswers(date: string) {
    // Store all correct answers and which ones the user got correct
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
        photoName: player.photoName
      })),
      userCorrectAnswers: this.answers()
        .filter(answer => answer.isCorrect === true && answer.rank !== null)
        .map(answer => answer.rank) // Store ranks that were correct
    };
    
    // Store answers by date key
    localStorage.setItem(`${this.ANSWERS_STORAGE_KEY}_${date}`, JSON.stringify(gameData));
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

  private submitScore() {
    const score = this.getScore();
    const currentQuestion = this.question();
    
    // Get today's date in Central Time (YYYY-MM-DD format)
    const centralDate = this.getCentralTimeDate();
    
    // Calculate correct answers (player names that were correctly identified)
    const answersCorrect = this.answers()
      .filter(answer => answer.isCorrect === true)
      .map(answer => answer.playerName);
    
    // Calculate missed answers (player names from correctAnswers that were not found)
    const correctRanks = this.answers()
      .filter(answer => answer.isCorrect === true && answer.rank !== null)
      .map(answer => answer.rank!);
    const answersMissed = this.correctAnswers
      .filter(player => !correctRanks.includes(player.rank))
      .map(player => player.fullName);
    
    const scoreData : BogleScoreSubmission = {
      username: this.playerName(),
      gameScore: score,
      gameDate: centralDate,
      gameQuestion: currentQuestion,
      gameId: this.gameId,
      timeTaken: this.timeElapsed(),
      answersCorrect: answersCorrect,
      answersMissed: answersMissed
    };

    this.bogleService.submitScore(scoreData).subscribe({
      next: (response) => {
        console.log('Score submitted successfully:', response);
        // Wait for score to be saved, then load leaderboard with a slight delay
        setTimeout(() => {
          this.loadLeaderboard();
        }, 500); // 500ms delay to ensure the score is in the database
      },
      error: (err) => {
        console.error('Error submitting score:', err);
        // Still try to load leaderboard even if submission failed
        setTimeout(() => {
          this.loadLeaderboard();
        }, 500);
      }
    });
  }

  private getCentralTimeDate(): string {
    // Get current date in Central Time (America/Chicago)
    const now = new Date();
    
    // Format date in Central Time zone
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

  closeScoreModal() {
    this.showScoreModal.set(false);
    // When closing modal, ensure game answers are loaded if available
    if (this.hasPlayedToday() && this.storedGameAnswers().length === 0) {
      const today = this.getCentralTimeDate();
      this.loadGameAnswersForDisplay(today);
    }
  }

  getHeadshotSrc(playerData: RookiePlayer): string {
    // Use the photoName from the player data
    return `/assets/playerHeadshots/${encodeURIComponent(playerData.photoName)}.jpg`;
  }

  onPlayerNameChange(value: string) {
    this.playerName.set(value);
  }

  onStartGame() {
    // Check if user has already played today
    this.checkIfPlayedToday();
    
    if (this.hasPlayedToday()) {
      return; // Don't allow starting if already played today
    }
    
    const name = this.playerName().trim();
    if (name.length > 0) {
      this.gameStarted.set(true);
      // Reset timer
      this.timeRemaining.set(180);
      this.timeElapsed.set(0);
      this.loadDailyGame();
    }
  }

  private startTimer() {
    this.gameStartTime = Date.now();
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      
      this.timeElapsed.set(elapsed);
      this.timeRemaining.set(remaining);
      
      // If time runs out, end the game
      if (remaining === 0) {
        this.endGame();
      }
    }, 100); // Update every 100ms for smoother display
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    // Calculate final time elapsed
    if (this.gameStartTime > 0) {
      const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
      this.timeElapsed.set(Math.min(elapsed, 180)); // Cap at 3 minutes
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private loadLeaderboard() {
    this.isLoadingLeaderboard.set(true);
    const centralDate = this.getCentralTimeDate();

    this.bogleService.getScores(centralDate).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Sort by gameScore (descending), then by timeTaken (ascending) for ties
          const sorted = [...response.data].sort((a, b) => {
            if (b.gameScore !== a.gameScore) {
              return b.gameScore - a.gameScore; // Higher score first
            }
            return a.timeTaken - b.timeTaken; // Lower time first for ties
          });
          
          // Take top 10 for leaderboard display
          this.leaderboard.set(sorted.slice(0, 10));
          
          // Calculate most correct and most missed answers from all scores
          this.calculateAnswerStatistics(response.data);
        } else {
          // Reset statistics if no data
          this.mostCorrectAnswers.set([]);
          this.mostMissedAnswers.set([]);
        }
        
        // Also load game answers for display if not already loaded
        if (this.storedGameAnswers().length === 0) {
          this.loadGameAnswersForDisplay(centralDate);
        }
        
        this.isLoadingLeaderboard.set(false);
      },
      error: (err) => {
        console.error('Error loading leaderboard:', err);
        this.isLoadingLeaderboard.set(false);
        // Don't show error to user, just leave leaderboard empty
      }
    });
  }

  private calculateAnswerStatistics(scores: BogleScore[]) {
    // Count occurrences of each answer in answersCorrect and answersMissed arrays
    const correctCounts: { [playerName: string]: number } = {};
    const missedCounts: { [playerName: string]: number } = {};

    scores.forEach(score => {
      // Count correct answers (only if field exists)
      if (score.answersCorrect && Array.isArray(score.answersCorrect)) {
        score.answersCorrect.forEach(playerName => {
          correctCounts[playerName] = (correctCounts[playerName] || 0) + 1;
        });
      }

      // Count missed answers (only if field exists)
      if (score.answersMissed && Array.isArray(score.answersMissed)) {
        score.answersMissed.forEach(playerName => {
          missedCounts[playerName] = (missedCounts[playerName] || 0) + 1;
        });
      }
    });

    // Get top 3 most correct answers
    const topCorrect = Object.entries(correctCounts)
      .sort((a, b) => {
        // Sort by count (descending), then alphabetically (ascending) for ties
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map(([playerName]) => playerName);

    // Get top 3 most missed answers
    const topMissed = Object.entries(missedCounts)
      .sort((a, b) => {
        // Sort by count (descending), then alphabetically (ascending) for ties
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map(([playerName]) => playerName);

    this.mostCorrectAnswers.set(topCorrect);
    this.mostMissedAnswers.set(topMissed);
  }

  // Check if a player was answered correctly
  wasPlayerCorrect(playerRank: number): boolean {
    return this.storedUserCorrectRanks().includes(playerRank);
  }

  formatTimeForLeaderboard(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getStatHeaderName(): string {
    const statMap: { [key: string]: string } = {
      'ppg': 'PPG',
      'apg': 'APG',
      'rpg': 'RPG',
      'spg': 'SPG',
      'bpg': 'BPG'
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
      'bpg': player.bpg
    };
    
    const value = statMap[this.rankType];
    if (value == null || value === undefined) return null;
    
    // Format to 1 decimal place
    return value.toFixed(1);
  }
}

