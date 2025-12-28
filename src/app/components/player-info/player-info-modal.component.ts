import { Component, signal, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerInfoService, PlayerInfo } from '../../services/player-info.service';

@Component({
  selector: 'app-player-info-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-info-modal.component.html',
  styleUrl: './player-info-modal.component.css'
})
export class PlayerInfoModalComponent {
  playerName = input.required<string>();
  isOpen = input.required<boolean>();
  closeModal = output<void>();

  playerInfo = signal<PlayerInfo | null>(null);
  isLoading = signal(false);
  error = signal<string | null>(null);
  headshotError = signal(false);

  constructor(private playerInfoService: PlayerInfoService) {
    // Watch for changes to isOpen and playerName
    effect(() => {
      if (this.isOpen() && this.playerName()) {
        this.loadPlayerInfo();
      } else if (!this.isOpen()) {
        // Reset when modal closes
        this.playerInfo.set(null);
        this.error.set(null);
        this.headshotError.set(false);
      }
    });
  }

  loadPlayerInfo() {
    if (!this.playerName()) return;
    
    this.isLoading.set(true);
    this.error.set(null);
    this.playerInfo.set(null);

    this.playerInfoService.getPlayerInfo(this.playerName()).subscribe({
      next: (info) => {
        this.playerInfo.set(info);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading player info:', err);
        this.error.set(err.message || 'Failed to load player information');
        this.isLoading.set(false);
      }
    });
  }

  onClose() {
    this.closeModal.emit();
  }

  getHeadshotSrc(): string {
    if (!this.playerName() || this.headshotError()) {
      return '';
    }
    
    // Normalize name: replace spaces with underscores and remove special characters
    let name = this.playerName().replace(/ /g, '_');
    
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
    
    return `/assets/playerHeadshots/${encodeURIComponent(name)}.jpg`;
  }

  onHeadshotError(event: Event) {
    this.headshotError.set(true);
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  formatPercentage(value: number | null): string {
    if (value == null) return 'N/A';
    return (value * 100).toFixed(1) + '%';
  }

  formatStat(value: number | null): string {
    if (value == null) return 'N/A';
    return value.toFixed(1);
  }

  formatSalary(value: number | null): string {
    if (value == null) return 'N/A';
    // Format as currency in millions (e.g., 30000000 -> $30.0M)
    const millions = value / 1000000;
    return '$' + millions.toFixed(1) + 'M';
  }
}

