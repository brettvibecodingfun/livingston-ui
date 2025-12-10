import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoxScoresService, Game, BoxScorePlayer } from '../../services/box-scores.service';
import { PlayerInfoModalComponent } from '../player-info/player-info-modal.component';

@Component({
  selector: 'app-box-scores',
  standalone: true,
  imports: [CommonModule, PlayerInfoModalComponent],
  templateUrl: './box-scores.component.html',
  styleUrl: './box-scores.component.css'
})
export class BoxScoresComponent implements OnInit {
  games = signal<Game[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  selectedGame = signal<Game | null>(null);
  isModalOpen = signal(false);
  showPlayerModal = signal(false);
  selectedPlayerName = signal<string>('');

  constructor(private boxScoresService: BoxScoresService) {}

  ngOnInit() {
    this.loadGames();
  }

  loadGames() {
    this.isLoading.set(true);
    this.error.set(null);

    this.boxScoresService.getPreviousNightGames().subscribe({
      next: (response) => {
        this.games.set(response.games);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading games:', err);
        this.error.set(err.message || 'Failed to load games');
        this.isLoading.set(false);
      }
    });
  }

  openModal(game: Game) {
    this.selectedGame.set(game);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedGame.set(null);
  }

  getBoxScoresByTeam(game: Game, teamAbbr: string): BoxScorePlayer[] {
    return game.boxScores
      .filter(bs => bs.team_abbr === teamAbbr)
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  }

  calculateFGPercentage(fgm: number | null, fga: number | null): string {
    if (!fga || fga === 0) return '0.0%';
    const pct = ((fgm || 0) / fga) * 100;
    return pct.toFixed(1) + '%';
  }

  calculate3PPercentage(tpm: number | null, tpa: number | null): string {
    if (!tpa || tpa === 0) return '0.0%';
    const pct = ((tpm || 0) / tpa) * 100;
    return pct.toFixed(1) + '%';
  }

  calculateFTPercentage(ftm: number | null, fta: number | null): string {
    if (!fta || fta === 0) return '0.0%';
    const pct = ((ftm || 0) / fta) * 100;
    return pct.toFixed(1) + '%';
  }

  formatMinutes(minutes: number | null): string {
    if (!minutes) return '0:00';
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  openPlayerModal(playerName: string) {
    this.selectedPlayerName.set(playerName);
    this.showPlayerModal.set(true);
  }

  closePlayerModal() {
    this.showPlayerModal.set(false);
    this.selectedPlayerName.set('');
  }
}

