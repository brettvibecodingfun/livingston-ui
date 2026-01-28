import { Component, signal, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LivingstonService, QueryResponse, PlayerStatsRow, TeamData } from '../../services/livingston.service';
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
export class LivingstonComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sampleQuestionsContainer', { static: false }) sampleQuestionsContainer!: ElementRef<HTMLDivElement>;
  
  question = signal('');
  submittedQuestion = signal<string | null>(null);
  narrate = signal(false);
  isLoading = signal(false);
  results = signal<QueryResponse | null>(null);
  queryDebug = signal<Query | null>(null);
  error = signal<string | null>(null);
  errorSuggestions = signal<string[]>([]);
  isDebugMode = environment.DEBUG;
  showHelpModal = signal(false);
  showPlayerModal = signal(false);
  selectedPlayerName = signal<string>('');
  
  sampleQuestions = [
    "Find me a historical comparison for Cooper Flagg.",
    "Who are the top scoring rookies in the NBA this year?",
    "Who leads the NBA in NET Rating this year?",
    "Who are the best Duke players in the NBA?",
    "Of players who shoot more than 7 threes per game, who has the best percentage?",
    "Compare Stephen Curry and Cade Cunningham"
  ];
  
  private animationFrameId: number | null = null;
  private isAutoScrolling = true;
  private hasUserClicked = false; // Track if user has clicked a chip
  private isUserInteracting = false; // Track if user is manually scrolling
  private resumeTimeout: any = null;
  private boundHandleUserInteraction: () => void;
  private boundHandleUserInteractionEnd: () => void;

  constructor(private livingstonService: LivingstonService) {
    // Bind event handlers once in constructor so we can properly remove them
    this.boundHandleUserInteraction = this.handleUserInteraction.bind(this);
    this.boundHandleUserInteractionEnd = this.handleUserInteractionEnd.bind(this);
  }
  
  ngOnInit() {
    // Component initialization
  }
  
  ngAfterViewInit() {
    // Start auto-scroll after view is initialized (ViewChild is available)
    setTimeout(() => {
      this.startAutoScroll();
      this.setupTouchHandlers();
    }, 100);
  }
  
  ngOnDestroy() {
    this.stopAutoScroll();
    this.removeTouchHandlers();
  }
  
  setupTouchHandlers() {
    const container = this.sampleQuestionsContainer?.nativeElement;
    if (!container) return;
    
    // Pause scrolling when user touches/interacts
    container.addEventListener('touchstart', this.boundHandleUserInteraction, { passive: true });
    container.addEventListener('mousedown', this.boundHandleUserInteraction);
    container.addEventListener('wheel', this.boundHandleUserInteraction, { passive: true });
    
    // Resume scrolling after user stops interacting
    container.addEventListener('touchend', this.boundHandleUserInteractionEnd, { passive: true });
    container.addEventListener('mouseup', this.boundHandleUserInteractionEnd);
    container.addEventListener('mouseleave', this.boundHandleUserInteractionEnd);
  }
  
  removeTouchHandlers() {
    const container = this.sampleQuestionsContainer?.nativeElement;
    if (!container) return;
    
    container.removeEventListener('touchstart', this.boundHandleUserInteraction);
    container.removeEventListener('mousedown', this.boundHandleUserInteraction);
    container.removeEventListener('wheel', this.boundHandleUserInteraction);
    container.removeEventListener('touchend', this.boundHandleUserInteractionEnd);
    container.removeEventListener('mouseup', this.boundHandleUserInteractionEnd);
    container.removeEventListener('mouseleave', this.boundHandleUserInteractionEnd);
  }
  
  handleUserInteraction() {
    this.isUserInteracting = true;
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
    }
  }
  
  handleUserInteractionEnd() {
    // Resume scrolling after 2 seconds of no interaction
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
    }
    this.resumeTimeout = setTimeout(() => {
      this.isUserInteracting = false;
    }, 2000);
  }
  
  startAutoScroll() {
    if (this.animationFrameId !== null || this.hasUserClicked) return;
    
    this.isAutoScrolling = true;
    const scroll = () => {
      if (!this.isAutoScrolling || this.hasUserClicked || this.isUserInteracting) {
        this.animationFrameId = requestAnimationFrame(scroll);
        return;
      }
      
      const container = this.sampleQuestionsContainer?.nativeElement;
      if (!container) {
        this.animationFrameId = requestAnimationFrame(scroll);
        return;
      }
      
      const scrollWidth = container.scrollWidth;
      const singleSetWidth = scrollWidth / 2;
      const currentScroll = container.scrollLeft;
      
      // If we've scrolled past the first set, reset seamlessly
      if (currentScroll >= singleSetWidth - 1) {
        // Reset to the beginning of the first set without animation
        container.scrollLeft = currentScroll - singleSetWidth;
      } else {
        // Smoothly scroll forward
        container.scrollLeft = currentScroll + 0.5; // Slower, smoother scroll
      }
      
      this.animationFrameId = requestAnimationFrame(scroll);
    };
    
    this.animationFrameId = requestAnimationFrame(scroll);
  }
  
  stopAutoScroll() {
    this.isAutoScrolling = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }
  }
  
  onSampleQuestionClick(questionText: string) {
    this.hasUserClicked = true; // Permanently stop auto-scroll
    this.stopAutoScroll();
    this.question.set(questionText);
    this.onSubmit();
  }

  headshotErrorMap = new Set<string>();

  onSubmit() {
    if (!this.question().trim() || this.isLoading()) return;

    const questionText = this.question(); // Store the question before clearing
    this.submittedQuestion.set(questionText); // Store the submitted question
    this.isLoading.set(true);
    this.error.set(null);
    this.errorSuggestions.set([]);
    this.results.set(null);
    this.queryDebug.set(null);
    this.question.set(''); // Clear the input field

    this.livingstonService.askQuestion({ question: questionText, narrate: this.narrate() })
      .subscribe({
        next: (response) => {
          // Check if there's an error in the response
          if (response.error) {
            this.error.set(response.error);
            this.errorSuggestions.set(response.suggestions || []);
            this.isLoading.set(false);
          } else {
            this.results.set(response);
            this.queryDebug.set(response.query);
            this.isLoading.set(false);
          }
        },
        error: (err) => {
          console.error('API Error:', err);
          // Try to extract error message and suggestions from error response
          if (err.error?.error) {
            this.error.set(err.error.error);
            this.errorSuggestions.set(err.error.suggestions || []);
          } else {
            this.error.set(err.message || 'An error occurred while processing your question');
          }
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

  isTeamQuery(): boolean {
    const query = this.results()?.query;
    return query?.task === 'team';
  }

  isTeamStatsQuery(): boolean {
    const query = this.results()?.query;
    return !!(query?.task === 'team' && query?.metric && query.metric.startsWith('team_'));
  }

  getTeamStatColumn(): string | null {
    const query = this.results()?.query;
    if (query?.task === 'team' && query?.metric && query.metric.startsWith('team_')) {
      return query.metric;
    }
    return null;
  }

  getTeamStatDisplayName(metric: string): string {
    const displayNames: Record<string, string> = {
      'team_ppg': 'PPG',
      'team_fgm': 'FGM',
      'team_fga': 'FGA',
      'team_fg_pct': 'FG%',
      'team_fta': 'FTA',
      'team_ftm': 'FTM',
      'team_ft_pct': 'FT%',
      'team_fg3a': '3PA',
      'team_fg3m': '3PM',
      'team_fg3_pct': '3P%',
      'team_pace': 'Pace',
      'team_efg_pct': 'eFG%',
      'team_ts_pct': 'TS%',
      'team_def_rating': 'Def Rating',
      'team_off_rating': 'Off Rating',
      'team_net_rating': 'Net Rating',
    };
    return displayNames[metric] || metric;
  }

  getTeamStatValue(team: any, metric: string): string {
    const valueMap: Record<string, keyof typeof team> = {
      'team_ppg': 'points',
      'team_fgm': 'fgm',
      'team_fga': 'fga',
      'team_fg_pct': 'fgPct',
      'team_fta': 'fta',
      'team_ftm': 'ftm',
      'team_ft_pct': 'ftPct',
      'team_fg3a': 'fg3a',
      'team_fg3m': 'fg3m',
      'team_fg3_pct': 'fg3Pct',
      'team_pace': 'pace',
      'team_efg_pct': 'efgPct',
      'team_ts_pct': 'tsPct',
      'team_def_rating': 'defensiveRating',
      'team_off_rating': 'offensiveRating',
      'team_net_rating': 'netRating',
    };
    const field = valueMap[metric];
    if (!field || team[field] == null) return 'N/A';
    
    const value = team[field];
    // Format percentages - multiply by 100 and add % sign
    if (metric.includes('_pct')) {
      return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'N/A';
    } else {
      // Format rating metrics (not percentages, just numbers) - remove trailing zeros
      if (typeof value !== 'number') return 'N/A';
      // Remove trailing zeros by using parseFloat which automatically removes them
      return parseFloat(value.toFixed(1)).toString();
    }
  }

  getTeamData(): TeamData[] {
    return this.results()?.teams || [];
  }

  isSingleTeam(): boolean {
    return this.getTeamData().length === 1;
  }

  isHistoricalComparison(): boolean {
    return !!this.results()?.historicalComparison;
  }

  getHistoricalComparison() {
    return this.results()?.historicalComparison;
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
    // For three pointers made/attempts and free throws made/attempts, show only that stat
    else if (metric === 'tpm' || metric === 'tpa' || metric === 'ftm' || metric === 'fta') {
      columns.push(metric);
    }
    // For BPM, show PPG + shooting percentages (since PPG is shown)
    else if (metric === 'bpm') {
      columns.push('ppg'); // Show PPG as primary stat for BPM queries
      columns.push('fg_pct', 'three_pct', 'ft_pct');
    }
    // For offensive rating, defensive rating, net rating, or PIE, show only that stat
    else if (metric === 'off_rating' || metric === 'def_rating' || metric === 'net_rating' || metric === 'pie') {
      columns.push(metric);
    }
    // For advanced stats, show only that stat
    else if (metric === 'e_pace' || metric === 'fga_pg' || metric === 'fgm_pg' || 
             metric === 'ts_pct' || metric === 'ast_pct' || metric === 'efg_pct' || 
             metric === 'reb_pct' || metric === 'usg_pct' || metric === 'dreb_pct' || 
             metric === 'oreb_pct' || metric === 'ast_ratio' || metric === 'e_tov_pct' || 
             metric === 'e_usg_pct') {
      columns.push(metric);
    }

    // If filtering by a different metric than the one being ranked, add the filter metric to the table
    const filterByMetric = query.filters?.filter_by_metric;
    if (filterByMetric && metric && filterByMetric !== metric && !columns.includes(filterByMetric)) {
      // Insert the filter metric right before the ranking metric, or at the end if not found
      const metricIndex = columns.indexOf(metric);
      if (metricIndex !== -1) {
        columns.splice(metricIndex, 0, filterByMetric);
      } else {
        columns.push(filterByMetric);
      }
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
      'ft_pct': 'FT%',
      'tpm': '3PM',
      'tpa': '3PA',
      'ftm': 'FTM',
      'fta': 'FTA',
      'off_rating': 'Off Rtg',
      'def_rating': 'Def Rtg',
      'net_rating': 'Net Rtg',
      'pie': 'PIE',
      'e_pace': 'E Pace',
      'fga_pg': 'FGA/G',
      'fgm_pg': 'FGM/G',
      'ts_pct': 'TS%',
      'ast_pct': 'AST%',
      'efg_pct': 'eFG%',
      'reb_pct': 'REB%',
      'usg_pct': 'USG%',
      'dreb_pct': 'DREB%',
      'oreb_pct': 'OREB%',
      'ast_ratio': 'AST Ratio',
      'e_tov_pct': 'E TOV%',
      'e_usg_pct': 'E USG%'
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
      case 'tpm':
        return player.tpm != null ? player.tpm.toFixed(1) : '0.0';
      case 'tpa':
        return player.tpa != null ? player.tpa.toFixed(1) : '0.0';
      case 'ftm':
        return player.ftm != null ? player.ftm.toFixed(1) : '0.0';
      case 'fta':
        return player.fta != null ? player.fta.toFixed(1) : '0.0';
      case 'off_rating':
        return player.off_rating != null ? player.off_rating.toFixed(1) : '';
      case 'def_rating':
        return player.def_rating != null ? player.def_rating.toFixed(1) : '';
      case 'net_rating':
        return player.net_rating != null ? player.net_rating.toFixed(1) : '';
      case 'pie':
        return player.pie != null ? player.pie.toFixed(3) : '';
      case 'e_pace':
        return player.e_pace != null ? player.e_pace.toFixed(1) : '';
      case 'fga_pg':
        return player.fga_pg != null ? player.fga_pg.toFixed(1) : '';
      case 'fgm_pg':
        return player.fgm_pg != null ? player.fgm_pg.toFixed(1) : '';
      case 'ts_pct':
        return player.ts_pct != null ? (player.ts_pct * 100).toFixed(1) + '%' : '';
      case 'ast_pct':
        return player.ast_pct != null ? (player.ast_pct * 100).toFixed(1) + '%' : '';
      case 'efg_pct':
        return player.efg_pct != null ? (player.efg_pct * 100).toFixed(1) + '%' : '';
      case 'reb_pct':
        return player.reb_pct != null ? (player.reb_pct * 100).toFixed(1) + '%' : '';
      case 'usg_pct':
        return player.usg_pct != null ? (player.usg_pct * 100).toFixed(1) + '%' : '';
      case 'dreb_pct':
        return player.dreb_pct != null ? (player.dreb_pct * 100).toFixed(1) + '%' : '';
      case 'oreb_pct':
        return player.oreb_pct != null ? (player.oreb_pct * 100).toFixed(1) + '%' : '';
      case 'ast_ratio':
        return player.ast_ratio != null ? player.ast_ratio.toFixed(2) : '';
      case 'e_tov_pct':
        return player.e_tov_pct != null ? (player.e_tov_pct * 100).toFixed(1) + '%' : '';
      case 'e_usg_pct':
        return player.e_usg_pct != null ? (player.e_usg_pct * 100).toFixed(1) + '%' : '';
      default:
        return '';
    }
  }

  /**
   * Normalizes a player name for use in file paths by replacing spaces with underscores
   * and converting special characters to English equivalents.
   */
  private normalizePlayerName(fullName: string): string {
    if (!fullName) {
      return '';
    }
    
    // Normalize name: replace spaces with underscores
    let name = fullName.replace(/ /g, '_');
    
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
    
    return name;
  }

  /**
   * Gets the headshot image source path for a player name.
   * Works with either a PlayerStatsRow object or a string name.
   */
  getHeadshotSrc(playerOrName: PlayerStatsRow | string): string {
    const fullName = typeof playerOrName === 'string' ? playerOrName : playerOrName.full_name;
    
    if (!fullName) {
      return '';
    }
    
    const normalizedName = this.normalizePlayerName(fullName);
    
    if (this.headshotErrorMap.has(normalizedName)) {
      return '';
    }
    
    return `/assets/playerHeadshots/${encodeURIComponent(normalizedName)}.jpg`;
  }

  /**
   * Gets the headshot image source path for a player name string.
   * @deprecated Use getHeadshotSrc instead - it now accepts both PlayerStatsRow and string
   */
  getHeadshotSrcForName(fullName: string): string {
    return this.getHeadshotSrc(fullName);
  }

  /**
   * Handles headshot image load errors by adding the player to the error map and hiding the image.
   * Works with either a PlayerStatsRow object or a string name.
   */
  onHeadshotError(playerOrName: PlayerStatsRow | string, event: Event) {
    const fullName = typeof playerOrName === 'string' ? playerOrName : playerOrName.full_name;
    
    if (fullName) {
      const normalizedName = this.normalizePlayerName(fullName);
      this.headshotErrorMap.add(normalizedName);
    }
    
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  /**
   * Handles headshot image load errors for a player name string.
   * @deprecated Use onHeadshotError instead - it now accepts both PlayerStatsRow and string
   */
  onHeadshotErrorForName(fullName: string, event: Event) {
    this.onHeadshotError(fullName, event);
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
