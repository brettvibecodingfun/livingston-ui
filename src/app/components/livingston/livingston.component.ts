import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LivingstonService, QueryResponse, PlayerStatsRow } from '../../services/livingston.service';
import { Query } from '../../../lib/types';
import { environment } from '../../../environments/environment';
import { PlayerInfoModalComponent } from '../player-info/player-info-modal.component';

@Component({
  selector: 'app-livingston',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerInfoModalComponent],
  templateUrl: './livingston.component.html',
  styleUrl: './livingston.component.css'
})
export class LivingstonComponent {
  question = signal('');
  narrate = signal(false);
  isLoading = signal(false);
  results = signal<QueryResponse | null>(null);
  queryDebug = signal<Query | null>(null);
  error = signal<string | null>(null);
  isDebugMode = environment.DEBUG;
  showHelpModal = signal(false);
  showPlayerModal = signal(false);
  selectedPlayerName = signal<string>('');

  constructor(private livingstonService: LivingstonService) {}

  headshotErrorMap = new Set<string>();

  onSubmit() {
    if (!this.question().trim() || this.isLoading()) return;

    const questionText = this.question(); // Store the question before clearing
    this.isLoading.set(true);
    this.error.set(null);
    this.results.set(null);
    this.queryDebug.set(null);
    this.question.set(''); // Clear the input field

    this.livingstonService.askQuestion({ question: questionText, narrate: this.narrate() })
      .subscribe({
        next: (response) => {
          this.results.set(response);
          this.queryDebug.set(response.query);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('API Error:', err);
          this.error.set(err.message || 'An error occurred while processing your question');
          this.isLoading.set(false);
        }
      });
  }

  // Check if this is a comparison query (2 players)
  isComparison(): boolean {
    const query = this.results()?.query;
    return query?.task === 'compare' && 
           this.results()?.rows?.length === 2;
  }

  // Determine which columns to show based on the query metric
  getVisibleColumns(): string[] {
    const query = this.results()?.query;
    if (!query) return [];

    const columns: string[] = ['player', 'team', 'gp', 'minutes'];

    const hasPlayerFilter = Array.isArray(query.filters?.players) && query.filters!.players!.length > 0;
    if (hasPlayerFilter) {
      columns.push('ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'three_pct', 'ft_pct');
      return columns;
    }

    const metric = query.metric;

    // If metric is "all", show all stats
    if (metric === 'all') {
      columns.push('ppg', 'apg', 'rpg', 'fg_pct', 'three_pct', 'ft_pct');
      return columns;
    }

    // For PPG, show PPG + shooting percentages
    if (metric === 'ppg') {
      columns.push(metric);
      columns.push('fg_pct', 'three_pct', 'ft_pct');
    }
    // For APG or RPG, show the stat
    else if (metric === 'apg' || metric === 'rpg') {
      columns.push(metric);
    }
    // For steals or blocks, show only that stat
    else if (metric === 'spg' || metric === 'bpg') {
      columns.push(metric);
    }
    // For shooting percentages, show only that specific percentage
    else if (metric === 'fg_pct' || metric === 'three_pct' || metric === 'ft_pct') {
      columns.push(metric);
    }
    // For BPM, show PPG + shooting percentages (since PPG is shown)
    else if (metric === 'bpm') {
      columns.push('ppg'); // Show PPG as primary stat for BPM queries
      columns.push('fg_pct', 'three_pct', 'ft_pct');
    }

    return columns;
  }

  // Check if a column should be visible
  isColumnVisible(column: string): boolean {
    return this.getVisibleColumns().includes(column);
  }

  // Get display name for a column
  getColumnDisplayName(column: string): string {
    const displayNames: Record<string, string> = {
      'player': 'Player',
      'team': 'Team',
      'gp': 'GP',
      'minutes': 'Minutes',
      'ppg': 'PPG',
      'apg': 'APG',
      'rpg': 'RPG',
      'spg': 'SPG',
      'bpg': 'BPG',
      'fg_pct': 'FG%',
      'three_pct': '3P%',
      'ft_pct': 'FT%'
    };
    return displayNames[column] || column.toUpperCase();
  }

  // Get the value for a column from a player row
  getColumnValue(player: PlayerStatsRow, column: string): string {
    switch (column) {
      case 'player':
        return player.full_name || '';
      case 'team':
        return player.team || '';
      case 'gp':
        return (player.games_played || 0).toString();
      case 'minutes':
        return player.minutes != null ? player.minutes.toFixed(1) : '0.0';
      case 'ppg':
        return player.ppg != null ? player.ppg.toFixed(1) : '0.0';
      case 'apg':
        return player.apg != null ? player.apg.toFixed(1) : '0.0';
      case 'rpg':
        return player.rpg != null ? player.rpg.toFixed(1) : '0.0';
      case 'spg':
        return player.spg != null ? player.spg.toFixed(1) : '0.0';
      case 'bpg':
        return player.bpg != null ? player.bpg.toFixed(1) : '0.0';
      case 'fg_pct':
        return player.fg_pct != null ? ((player.fg_pct * 100).toFixed(1) + '%') : '0.0%';
      case 'three_pct':
        return player.three_pct != null ? ((player.three_pct * 100).toFixed(1) + '%') : '0.0%';
      case 'ft_pct':
        return player.ft_pct != null ? ((player.ft_pct * 100).toFixed(1) + '%') : '0.0%';
      default:
        return '';
    }
  }

  getHeadshotSrc(player: PlayerStatsRow): string {
    if (!player.full_name) {
      return '';
    }
    
    // Normalize name: replace spaces with underscores and remove special characters
    let name = player.full_name.replace(/ /g, '_');
    
    // Replace special characters with English equivalents
    name = name
      .replace(/č/g, 'c').replace(/ć/g, 'c')
      .replace(/š/g, 's').replace(/Š/g, 'S')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/ž/g, 'z').replace(/Ž/g, 'Z')
      .replace(/á/g, 'a').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/Á/g, 'A').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
      .replace(/ģ/g, 'g').replace(/Ģ/g, 'G')
      .replace(/ī/g, 'i').replace(/Ī/g, 'I')
      .replace(/ū/g, 'u').replace(/Ū/g, 'U')
      .replace(/ņ/g, 'n').replace(/Ņ/g, 'N')
      .replace(/é/g, 'e').replace(/É/g, 'E')
      .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
      .replace(/ë/g, 'e').replace(/Ë/g, 'E')
      .replace(/ä/g, 'a').replace(/Ä/g, 'A')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ô/g, 'o').replace(/Ô/g, 'O')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ê/g, 'e').replace(/Ê/g, 'E')
      .replace(/î/g, 'i').replace(/Î/g, 'I')
      .replace(/â/g, 'a').replace(/Â/g, 'A')
      .replace(/à/g, 'a').replace(/À/g, 'A')
      .replace(/è/g, 'e').replace(/È/g, 'E')
      .replace(/ì/g, 'i').replace(/Ì/g, 'I')
      .replace(/ò/g, 'o').replace(/Ò/g, 'O')
      .replace(/ù/g, 'u').replace(/Ù/g, 'U');
    
    if (this.headshotErrorMap.has(name)) {
      return '';
    }
    return `/assets/playerHeadshots/${encodeURIComponent(name)}.jpg`;
  }

  onHeadshotError(player: PlayerStatsRow, event: Event) {
    if (player.full_name) {
      this.headshotErrorMap.add(player.full_name);
    }
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  openHelpModal() {
    this.showHelpModal.set(true);
  }

  closeHelpModal() {
    this.showHelpModal.set(false);
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
