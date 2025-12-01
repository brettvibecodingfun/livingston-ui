import { Query } from './types';
import { METRIC_COL_MAP } from './constants';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

export async function summarizeAnswer(query: Query, rows: any[]): Promise<string> {
  // If no results, return helpful message
  if (rows.length === 0) {
    return "No qualified players matched your filters.";
  }

  // Take top 5 rows for summarization
  const topRows = rows.slice(0, 5);
  
  // Get the metric column name for display
  const metricColumn = query.metric === 'all' ? null : METRIC_COL_MAP[query.metric];
  
  // Include full stat line for compare tasks or when metric is 'all'
  const includeFullStatLine = query.task === 'compare' || query.metric === 'all';

  // Format the data for the prompt
  const formattedRows = topRows
    .map((row, index) => {
      if (includeFullStatLine) {
        const formatNumber = (value: number | null | undefined) =>
          value != null ? value.toFixed(1) : '0.0';
        const formatPct = (value: number | null | undefined) =>
          value != null ? `${(value * 100).toFixed(1)}%` : '0.0%';

        return `${index + 1}. ${row.full_name} (${row.team || 'N/A'}) — PPG: ${formatNumber(
          row.ppg,
        )}, APG: ${formatNumber(row.apg)}, RPG: ${formatNumber(row.rpg)}, SPG: ${formatNumber(
          row.spg,
        )}, BPG: ${formatNumber(row.bpg)}, FG%: ${formatPct(row.fg_pct)}, 3P%: ${formatPct(
          row.three_pct,
        )}, FT%: ${formatPct(row.ft_pct)}`;
      }

      // For 'all' metric, this code path shouldn't be reached due to includeFullStatLine check above
      // But handle it safely just in case
      if (query.metric === 'all') {
        const formatNumber = (value: number | null | undefined) =>
          value != null ? value.toFixed(1) : '0.0';
        const formatPct = (value: number | null | undefined) =>
          value != null ? `${(value * 100).toFixed(1)}%` : '0.0%';
        return `${index + 1}. ${row.full_name} (${row.team || 'N/A'}) — PPG: ${formatNumber(
          row.ppg,
        )}, APG: ${formatNumber(row.apg)}, RPG: ${formatNumber(row.rpg)}, SPG: ${formatNumber(
          row.spg,
        )}, BPG: ${formatNumber(row.bpg)}, FG%: ${formatPct(row.fg_pct)}, 3P%: ${formatPct(
          row.three_pct,
        )}, FT%: ${formatPct(row.ft_pct)}`;
      }
      
      const metricValue = row[query.metric] || (metricColumn ? row[metricColumn] : null);
      let displayValue = metricValue;
      if (query.metric.includes('_pct')) {
        displayValue = `${(metricValue * 100).toFixed(1)}%`;
      } else {
        displayValue = metricValue?.toFixed(1) || '0.0';
      }

      return `${index + 1}. ${row.full_name} (${row.team || 'N/A'}) - ${displayValue}`;
    })
    .join('\n');

  // Build context for the summary
  const metricName = query.metric === 'all' ? 'overall stats' : query.metric.replace('_', ' ').toUpperCase();
  const season = query.season || 'current';
  const filters = [];
  if (query.team) filters.push(`team: ${query.team}`);
  if (query.position) filters.push(`position: ${query.position}`);
  if (query.filters?.players?.length) filters.push(`players: ${query.filters.players.join(', ')}`);
  
  const context = filters.length > 0 ? ` with filters: ${filters.join(', ')}` : '';

  const comparisonInstruction =
    query.task === 'compare' || query.metric === 'all'
      ? `Compare these players and determine who is having the better ${season} season overall. Consider all provided metrics (points, assists, rebounds, steals, blocks, shooting percentages) and briefly explain your reasoning without inventing stats (With a max of 300 tokens).`
      : `Summarize these ${metricName} results for the ${season} season${context}. Highlight the top performers in 1-2 sentences.(With a max of 300 tokens)`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that analyzes NBA statistics in a concise and engaging way. Base every conclusion strictly on the provided numbers. Reply in plain text without using Markdown formatting, bold, italics, or asterisks. (With a max of 300 tokens)',
        },
        {
          role: 'user',
          content: `${comparisonInstruction}\n\n${formattedRows}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (summary) {
      return summary;
    }
    
    // Fallback if no content returned
    return generateSimpleSummary(query, topRows, formattedRows);
    
  } catch (error) {
    console.error('OpenAI summary generation error:', error);
    // Fallback to simple summary
    return generateSimpleSummary(query, topRows, formattedRows);
  }
}

function generateSimpleSummary(query: Query, topRows: any[], formattedRows: string): string {
  const topPlayer = topRows[0];
  
  // Handle 'all' metric specially
  if (query.metric === 'all') {
    const formatNumber = (value: number | null | undefined) =>
      value != null ? value.toFixed(1) : '0.0';
    const formatPct = (value: number | null | undefined) =>
      value != null ? `${(value * 100).toFixed(1)}%` : '0.0%';
    
    if (topRows.length === 1) {
      return `${topPlayer.full_name} (${topPlayer.team || 'N/A'}) leads with ${formatNumber(topPlayer.ppg)} PPG, ${formatNumber(topPlayer.apg)} APG, ${formatNumber(topPlayer.rpg)} RPG.`;
    } else {
      const secondPlayer = topRows[1];
      return `${topPlayer.full_name} (${topPlayer.team || 'N/A'}) leads with ${formatNumber(topPlayer.ppg)} PPG, followed by ${secondPlayer.full_name} (${secondPlayer.team || 'N/A'}) at ${formatNumber(secondPlayer.ppg)} PPG.`;
    }
  }
  
  const metricValue = topPlayer[query.metric] || topPlayer[METRIC_COL_MAP[query.metric]];
  
  let displayValue = metricValue;
  if (query.metric.includes('_pct')) {
    displayValue = `${(metricValue * 100).toFixed(1)}%`;
  } else {
    displayValue = metricValue?.toFixed(1) || '0.0';
  }

  // Generate contextual summary based on query type
  if (query.task === 'leaders' || query.task === 'rank') {
    if (topRows.length === 1) {
      return `${topPlayer.full_name} (${topPlayer.team || 'N/A'}) leads the ${query.season} season with ${displayValue} ${query.metric}.`;
    } else {
      const secondPlayer = topRows[1];
      const secondMetricValue = secondPlayer[query.metric] || secondPlayer[METRIC_COL_MAP[query.metric]];
      const secondValue = query.metric.includes('_pct') 
        ? `${(secondMetricValue * 100).toFixed(1)}%`
        : secondMetricValue?.toFixed(1) || '0.0';
      
      return `${topPlayer.full_name} (${topPlayer.team || 'N/A'}) leads with ${displayValue} ${query.metric}, followed by ${secondPlayer.full_name} (${secondPlayer.team || 'N/A'}) at ${secondValue}.`;
    }
  } else if (query.task === 'compare') {
    const opponent = topRows[1];
    if (opponent) {
      const opponentMetricValue = opponent[query.metric] || opponent[METRIC_COL_MAP[query.metric]];
      const opponentDisplay = query.metric.includes('_pct')
        ? `${(opponentMetricValue * 100).toFixed(1)}%`
        : opponentMetricValue?.toFixed(1) || '0.0';
      return `${topPlayer.full_name} (${topPlayer.team || 'N/A'}) edges ${opponent.full_name} (${opponent.team || 'N/A'}) with ${displayValue} vs ${opponentDisplay} in ${query.metric}.`;
    }
    return `Comparing ${query.metric} performance: ${topPlayer.full_name} (${topPlayer.team || 'N/A'}) leads with ${displayValue}.`;
  } else {
    return `Top ${query.metric} performers: ${topPlayer.full_name} (${topPlayer.team || 'N/A'}) with ${displayValue}.`;
  }
}

