import { Component, signal } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LivingstonComponent } from './components/livingston/livingston.component';
import { BoxScoresComponent } from './components/box-scores/box-scores.component';
import { StandingsComponent } from './components/standings/standings.component';
import { GuessPlayerComponent } from './components/guess-player/guess-player.component';

type TabType = 'chat' | 'standings' | 'boxscores' | 'guess';

@Component({
  selector: 'app-root',
  imports: [HttpClientModule, FormsModule, CommonModule, LivingstonComponent, BoxScoresComponent, StandingsComponent, GuessPlayerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('livingston-ui');
  activeTab = signal<TabType>('chat');

  setActiveTab(tab: TabType) {
    this.activeTab.set(tab);
  }
}
