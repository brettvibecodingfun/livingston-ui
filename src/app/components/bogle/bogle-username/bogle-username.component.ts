import { Component, signal, OnInit, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bogle-username',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bogle-username.component.html',
  styleUrl: './bogle-username.component.css'
})
export class BogleUsernameComponent implements OnInit {
  hasPlayedToday = input.required<boolean>();
  
  playerName = signal('');
  showUsernameInput = signal(false);
  showStartGameButton = signal(false);
  
  startGame = output<string>();
  
  private readonly USERNAME_STORAGE_KEY = 'bogle_username';

  ngOnInit() {
    // Load username from localStorage if it exists
    const savedUsername = localStorage.getItem(this.USERNAME_STORAGE_KEY);
    if (savedUsername) {
      this.playerName.set(savedUsername);
      this.showStartGameButton.set(true);
    } else {
      this.showUsernameInput.set(true);
    }
  }

  onPlayerNameChange(value: string) {
    this.playerName.set(value);
  }

  onUsernameSubmit() {
    const name = this.playerName().trim();
    if (name.length > 0) {
      // Save username to localStorage
      localStorage.setItem(this.USERNAME_STORAGE_KEY, name);
      // Hide username input and show start game button
      this.showUsernameInput.set(false);
      this.showStartGameButton.set(true);
    }
  }

  onStartGame() {
    if (this.hasPlayedToday()) {
      return; // Don't allow starting if already played today
    }
    
    const name = this.playerName().trim();
    if (name.length > 0) {
      this.startGame.emit(name);
    }
  }
}
