import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StandingsService, ConferenceStandings } from '../services/standings.service';

@Component({
  selector: 'app-standings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './standings.component.html',
  styleUrl: './standings.component.css'
})
export class StandingsComponent implements OnInit {
  eastStandings = signal<ConferenceStandings[]>([]);
  westStandings = signal<ConferenceStandings[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  constructor(private standingsService: StandingsService) {}

  ngOnInit() {
    this.loadStandings();
  }

  loadStandings() {
    this.isLoading.set(true);
    this.error.set(null);

    this.standingsService.getStandings(2025).subscribe({
      next: (response) => {
        this.eastStandings.set(response.east);
        this.westStandings.set(response.west);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading standings:', err);
        this.error.set(err.message || 'Failed to load standings');
        this.isLoading.set(false);
      }
    });
  }

  calculateGamesBack(wins: number, losses: number, leaderWins: number, leaderLosses: number): string {
    const gamesBack = ((leaderWins - wins) + (losses - leaderLosses)) / 2;
    if (gamesBack === 0) return '-';
    return gamesBack.toFixed(1);
  }
}

