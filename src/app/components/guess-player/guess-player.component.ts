import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuessPlayerService, PlayerForGuess, PlayerFilters, GuessLeaderboardEntry } from '../../services/guess-player.service';

@Component({
  selector: 'app-guess-player',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './guess-player.component.html',
  styleUrl: './guess-player.component.css'
})
export class GuessPlayerComponent implements OnInit {
  private readonly USERNAME_STORAGE_KEY = 'guess_player_username';
  
  username = signal<string>('');
  hasUsername = signal(false);
  player = signal<PlayerForGuess | null>(null);
  isLoading = signal(false);
  error = signal<string | null>(null);
  showResult = signal(false);
  score = signal<number | null>(null);
  comparisonText = signal<string>('');
  comparisonStats = signal<Array<{label: string, guess: string, actual: string}>>([]);
  showFilters = signal(false);
  leaderboard = signal<GuessLeaderboardEntry[]>([]);
  isLoadingLeaderboard = signal(false);

  // Input values
  ppg = signal<string>('');
  rpg = signal<string>('');
  apg = signal<string>('');
  spg = signal<string>('');
  bpg = signal<string>('');
  fg = signal<string>('');
  threeP = signal<string>('');
  ft = signal<string>('');

  // Filter values
  filterPpgMin = signal<string>('');
  filterPpgMax = signal<string>('');
  filterApgMin = signal<string>('');
  filterApgMax = signal<string>('');
  filterRpgMin = signal<string>('');
  filterRpgMax = signal<string>('');
  filterAgeMin = signal<string>('');
  filterAgeMax = signal<string>('');
  filterTeam = signal<string>('');

  headshotErrorMap = new Set<string>();

  constructor(private guessPlayerService: GuessPlayerService) {}

  ngOnInit() {
    // Load username from localStorage
    const storedUsername = localStorage.getItem(this.USERNAME_STORAGE_KEY);
    if (storedUsername) {
      this.username.set(storedUsername);
      this.hasUsername.set(true);
    }
    
    // Only load player if username is set
    if (this.hasUsername()) {
      this.loadRandomPlayer();
    }
  }

  onUsernameSubmit() {
    const usernameValue = this.username().trim();
    if (!usernameValue) {
      this.error.set('Please enter a username');
      return;
    }
    
    // Save to localStorage
    localStorage.setItem(this.USERNAME_STORAGE_KEY, usernameValue);
    this.hasUsername.set(true);
    this.error.set(null);
    
    // Load a random player after username is set
    this.loadRandomPlayer();
  }

  getCentralTimeDate(): string {
    const now = new Date();
    const centralFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = centralFormatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  }

  loadLeaderboard(playerId: number) {
    const playerIdSeason = `${playerId}-2026`;
    this.isLoadingLeaderboard.set(true);
    
    this.guessPlayerService.getPlayerLeaderboard(playerIdSeason).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Ensure all scores are numbers (convert string to number if needed)
          // Don't round - preserve the exact decimal value from the API
          const processedData: GuessLeaderboardEntry[] = response.data.map(entry => ({
            ...entry,
            score: typeof entry.score === 'string' ? parseFloat(entry.score) : (entry.score as number)
          }));
          this.leaderboard.set(processedData);
        } else {
          this.leaderboard.set([]);
        }
        this.isLoadingLeaderboard.set(false);
      },
      error: (err) => {
        console.error('Error loading leaderboard:', err);
        this.leaderboard.set([]);
        this.isLoadingLeaderboard.set(false);
      }
    });
  }

  loadRandomPlayer() {
    this.isLoading.set(true);
    this.error.set(null);
    this.showResult.set(false);
    this.score.set(null);
    this.comparisonText.set('');
    this.comparisonStats.set([]);

    // Clear inputs
    this.ppg.set('');
    this.rpg.set('');
    this.apg.set('');
    this.spg.set('');
    this.bpg.set('');
    this.fg.set('');
    this.threeP.set('');
    this.ft.set('');

    // Build filters object
    const filters: PlayerFilters = {};
    
    const ppgMinStr = String(this.filterPpgMin() ?? '').trim();
    if (ppgMinStr) {
      const val = parseFloat(ppgMinStr);
      if (!isNaN(val)) filters.ppgMin = val;
    }
    
    const ppgMaxStr = String(this.filterPpgMax() ?? '').trim();
    if (ppgMaxStr) {
      const val = parseFloat(ppgMaxStr);
      if (!isNaN(val)) filters.ppgMax = val;
    }
    
    const apgMinStr = String(this.filterApgMin() ?? '').trim();
    if (apgMinStr) {
      const val = parseFloat(apgMinStr);
      if (!isNaN(val)) filters.apgMin = val;
    }
    
    const apgMaxStr = String(this.filterApgMax() ?? '').trim();
    if (apgMaxStr) {
      const val = parseFloat(apgMaxStr);
      if (!isNaN(val)) filters.apgMax = val;
    }
    
    const rpgMinStr = String(this.filterRpgMin() ?? '').trim();
    if (rpgMinStr) {
      const val = parseFloat(rpgMinStr);
      if (!isNaN(val)) filters.rpgMin = val;
    }
    
    const rpgMaxStr = String(this.filterRpgMax() ?? '').trim();
    if (rpgMaxStr) {
      const val = parseFloat(rpgMaxStr);
      if (!isNaN(val)) filters.rpgMax = val;
    }
    
    const ageMinStr = String(this.filterAgeMin() ?? '').trim();
    if (ageMinStr) {
      const val = parseInt(ageMinStr);
      if (!isNaN(val)) filters.ageMin = val;
    }
    
    const ageMaxStr = String(this.filterAgeMax() ?? '').trim();
    if (ageMaxStr) {
      const val = parseInt(ageMaxStr);
      if (!isNaN(val)) filters.ageMax = val;
    }
    
    const teamStr = String(this.filterTeam() ?? '').trim();
    if (teamStr) {
      filters.team = teamStr.toUpperCase();
    }

    const hasFilters = Object.keys(filters).length > 0;
    this.guessPlayerService.getRandomPlayer(hasFilters ? filters : undefined).subscribe({
      next: (player) => {
        this.player.set(player);
        this.isLoading.set(false);
        this.error.set(null); // Clear any previous errors
        
        // Load leaderboard for this player
        if (player.player_id) {
          this.loadLeaderboard(player.player_id);
        }
      },
      error: (err) => {
        console.error('Error loading player:', err);
        // Check if the error is about no players matching filters
        const errorMessage = err.error?.error || err.message || 'Failed to load player';
        if (errorMessage.includes('No players found matching the filters') || 
            errorMessage.includes('No players found')) {
          this.error.set('No players exist with those filters, please readjust your filter selections.');
        } else {
          this.error.set(errorMessage);
        }
        this.isLoading.set(false);
        this.player.set(null); // Clear player on error
      }
    });
  }

  toggleFilters() {
    this.showFilters.set(!this.showFilters());
  }

  clearFilters() {
    this.filterPpgMin.set('');
    this.filterPpgMax.set('');
    this.filterApgMin.set('');
    this.filterApgMax.set('');
    this.filterRpgMin.set('');
    this.filterRpgMax.set('');
    this.filterAgeMin.set('');
    this.filterAgeMax.set('');
    this.filterTeam.set('');
    this.error.set(null); // Clear any error when filters are cleared
  }

  onSubmit() {
    const playerData = this.player();
    if (!playerData) return;

    // Validate all inputs
    const inputs = [
      { value: this.ppg(), name: 'PPG' },
      { value: this.rpg(), name: 'RBG' },
      { value: this.apg(), name: 'APG' },
      { value: this.spg(), name: 'SPG' },
      { value: this.bpg(), name: 'BPG' },
      { value: this.fg(), name: 'FG%' },
      { value: this.threeP(), name: '3P%' },
      { value: this.ft(), name: 'FT%' }
    ];

    const invalidInputs = inputs.filter(input => {
      // Convert to string first to handle both string and number types
      // Accept "0" as a valid input; only reject if input is truly blank, non-numeric, or less than 0
      const valueStr = String(input.value ?? '').trim();
      const numValue = parseFloat(valueStr);
      return valueStr === '' || isNaN(numValue) || numValue < 0;
    });


    if (invalidInputs.length > 0) {
      this.error.set('Please enter valid numbers in all fields before submitting');
      return;
    } else {
      // Clear any previous error if the inputs are now valid
      this.error.set('');
    }

    // Calculate score using the same algorithm as the original
    // Convert to string first to handle both string and number types from ngModel
    // Use nullish coalescing (??) instead of || to preserve 0 values
    const ppgGuess = parseFloat(String(this.ppg() ?? ''));
    const rpgGuess = parseFloat(String(this.rpg() ?? ''));
    const apgGuess = parseFloat(String(this.apg() ?? ''));
    const spgGuess = parseFloat(String(this.spg() ?? ''));
    const bpgGuess = parseFloat(String(this.bpg() ?? ''));
    const fgGuess = parseFloat(String(this.fg() ?? ''));
    const threePGuess = parseFloat(String(this.threeP() ?? ''));
    const ftGuess = parseFloat(String(this.ft() ?? ''));

    const actualPPG = playerData.ppg ?? 0;
    const actualRPG = playerData.rpg ?? 0;
    const actualAPG = playerData.apg ?? 0;
    const actualSPG = playerData.spg ?? 0;
    const actualBPG = playerData.bpg ?? 0;
    const actualFG = (playerData.fg_pct ?? 0) * 100;
    const actualThreeP = (playerData.three_pct ?? 0) * 100;
    const actualFT = (playerData.ft_pct ?? 0) * 100;

    const percentage = (
      this.getStatPercentage(ppgGuess, actualPPG) * 15 +
      this.getStatPercentage(rpgGuess, actualRPG) * 15 +
      this.getStatPercentage(apgGuess, actualAPG) * 15 +
      this.getStatPercentage(spgGuess, actualSPG) * 5 +
      this.getStatPercentage(bpgGuess, actualBPG) * 5 +
      this.getStatPercentage(fgGuess, actualFG) * 15 +
      this.getStatPercentage(threePGuess, actualThreeP) * 15 +
      this.getStatPercentage(ftGuess, actualFT) * 15
    );

    // Calculate final score with 1 decimal place precision
    // Round percentage to 1 decimal place first
    const roundedPercentage = Math.round(percentage * 10) / 10;
    const finalScore = 100 - roundedPercentage;
    // Round final score to 1 decimal place to avoid floating point precision issues
    // Use Number() to ensure proper decimal precision without additional rounding
    const finalScoreRounded = Number(finalScore.toFixed(1));
    this.score.set(finalScoreRounded);

    // Create comparison text (for desktop/pre view)
    const comparison = `
Stats Comparison for ${playerData.full_name}:

PPG:    Your Guess: ${ppgGuess.toFixed(1).padEnd(8, ' ')}    Actual: ${actualPPG.toFixed(1)}
RBG:    Your Guess: ${rpgGuess.toFixed(1).padEnd(8, ' ')}    Actual: ${actualRPG.toFixed(1)}
APG:    Your Guess: ${apgGuess.toFixed(1).padEnd(8, ' ')}    Actual: ${actualAPG.toFixed(1)}
SPG:    Your Guess: ${spgGuess.toFixed(1).padEnd(8, ' ')}    Actual: ${actualSPG.toFixed(1)}
BPG:    Your Guess: ${bpgGuess.toFixed(1).padEnd(8, ' ')}    Actual: ${actualBPG.toFixed(1)}
FG%:    Your Guess: ${(fgGuess.toFixed(1) + '%').padEnd(8, ' ')}    Actual: ${actualFG.toFixed(1)}%
3P%:    Your Guess: ${(threePGuess.toFixed(1) + '%').padEnd(8, ' ')}    Actual: ${actualThreeP.toFixed(1)}%
FT%:    Your Guess: ${(ftGuess.toFixed(1) + '%').padEnd(8, ' ')}    Actual: ${actualFT.toFixed(1)}%
    `;

    // Create structured comparison data for mobile-friendly display
    const stats = [
      { label: 'PPG', guess: ppgGuess.toFixed(1), actual: actualPPG.toFixed(1) },
      { label: 'RBG', guess: rpgGuess.toFixed(1), actual: actualRPG.toFixed(1) },
      { label: 'APG', guess: apgGuess.toFixed(1), actual: actualAPG.toFixed(1) },
      { label: 'SPG', guess: spgGuess.toFixed(1), actual: actualSPG.toFixed(1) },
      { label: 'BPG', guess: bpgGuess.toFixed(1), actual: actualBPG.toFixed(1) },
      { label: 'FG%', guess: fgGuess.toFixed(1) + '%', actual: actualFG.toFixed(1) + '%' },
      { label: '3P%', guess: threePGuess.toFixed(1) + '%', actual: actualThreeP.toFixed(1) + '%' },
      { label: 'FT%', guess: ftGuess.toFixed(1) + '%', actual: actualFT.toFixed(1) + '%' }
    ];

    this.comparisonText.set(comparison);
    this.comparisonStats.set(stats);
    this.showResult.set(true);

    // Submit score to leaderboard
    const currentPlayer = this.player();
    if (currentPlayer && currentPlayer.player_id) {
      const gameDate = this.getCentralTimeDate();
      const playerIdSeason = `${currentPlayer.player_id}-2026`;
      
      // Use the exact same score value shown in the modal
      // This ensures the POST value matches what's displayed
      const scoreToSubmit = this.score() ?? finalScoreRounded;
      
      const guessData = {
        userName: this.username(),
        score: scoreToSubmit,
        gameDate: gameDate,
        playerIdSeason: playerIdSeason
      };
      
      this.guessPlayerService.submitGuess(guessData).subscribe({
        next: (response) => {
          console.log('Guess submitted successfully:', response);
          // Reload leaderboard after submission
          if (currentPlayer.player_id) {
            this.loadLeaderboard(currentPlayer.player_id);
          }
        },
        error: (err) => {
          console.error('Error submitting guess:', err);
          // Don't show error to user as the game result is already displayed
        }
      });
    }

    // Clear all input fields after submission
    this.ppg.set('');
    this.rpg.set('');
    this.apg.set('');
    this.spg.set('');
    this.bpg.set('');
    this.fg.set('');
    this.threeP.set('');
    this.ft.set('');
  }

  getStatPercentage(guess: number, real: number): number {
    // Handle case where both are 0 - perfect match
    if (real === 0 && guess === 0) {
      return 0;
    }
    
    // Handle case where real is 0 but guess is not
    if (real === 0) {
      return guess / 100.0;
    }
    
    // Handle case where guess is 0 but real is not
    if (guess === 0) {
      // If the actual value is 0, we already handled that above
      // So real must be non-zero, meaning the guess is completely wrong
      return 1.0; // 100% error
    }
    
    // Normal case: both are non-zero
    // Use the larger value as denominator to avoid division by zero
    if (guess >= real) {
      return (guess - real) / guess;
    } else {
      return Math.abs(real - guess) / real;
    }
  }

  closeModal() {
    this.showResult.set(false);
  }

  getHeadshotSrc(player: PlayerForGuess | null): string {
    if (!player) return '';
    const name = player.full_name.replace(/\s+/g, '_');
    return `/assets/playerHeadshots/${name}.jpg`;
  }

  onHeadshotError(player: PlayerForGuess | null, event: Event) {
    if (!player) return;
    const name = player.full_name.replace(/\s+/g, '_');
    if (!this.headshotErrorMap.has(name)) {
      this.headshotErrorMap.add(name);
      const img = event.target as HTMLImageElement;
      img.style.display = 'none';
    }
  }
}

