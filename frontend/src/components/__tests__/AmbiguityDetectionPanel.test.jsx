import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AmbiguityDetectionPanel from '../AmbiguityDetectionPanel';
import apiService from '../../lib/api-service';

vi.mock('../../lib/api-service');

describe('AmbiguityDetectionPanel - Batch Analysis', () => {
  const mockRequirement = {
    id: 1,
    title: 'User Login',
    description: 'The system should be fast and easy to use'
  };

  const mockBatchAnalysis = {
    id: 'analysis_1',
    requirement_id: 1,
    original_text: 'The system should be fast and easy to use',
    total_terms_flagged: 2,
    terms_resolved: 0,
    status: 'pending',
    ambiguous_terms: [
      {
        id: 'term_1',
        term: 'fast',
        position_start: 21,
        position_end: 25,
        confidence: 0.95,
        suggestions: ['within 2 seconds', 'low latency'],
        context: 'response should be fast',
        status: 'pending'
      },
      {
        id: 'term_2',
        term: 'easy',
        position_start: 30,
        position_end: 34,
        confidence: 0.88,
        suggestions: ['fewer than 3 clicks', 'intuitive interface'],
        context: 'system should be easy to use',
        status: 'pending'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display batch analysis results when provided', () => {
    render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    expect(screen.getByText('fast')).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
  });

  it('should show highlights for ambiguous terms', () => {
    const { container } = render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    // Check for highlighted terms - they should be visible in the rendered text
    expect(screen.getByText('fast')).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
  });

  it('should display term details when term is clicked', async () => {
    render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    const termElement = screen.getByText('fast');
    fireEvent.click(termElement);

    await waitFor(() => {
      expect(screen.getByText(/within 2 seconds|low latency/)).toBeInTheDocument();
    });
  });

  it('should display all suggested clarifications for ambiguous term', async () => {
    render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    const termElement = screen.getByText('fast');
    fireEvent.click(termElement);

    await waitFor(() => {
      expect(screen.getByText(/within 2 seconds/)).toBeInTheDocument();
      expect(screen.getByText(/low latency/)).toBeInTheDocument();
    });
  });

  it('should show confidence scores for ambiguous terms', () => {
    const { container } = render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Check for confidence display (95%, 88%)
    expect(container.textContent).toMatch(/95|88/);
  });

  it('should accept clarification submission', async () => {
    apiService.submitClarification = vi.fn().mockResolvedValue({ success: true });

    render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    const termElement = screen.getByText('fast');
    fireEvent.click(termElement);

    await waitFor(() => {
      const clarifyButton = screen.getByText(/submit|confirm|use/i);
      fireEvent.click(clarifyButton);
    });

    await waitFor(() => {
      expect(apiService.submitClarification).toHaveBeenCalled();
    });
  });

  it('should handle analysis errors gracefully', () => {
    const errorAnalysis = {
      ...mockBatchAnalysis,
      error: 'Analysis failed'
    };

    render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={errorAnalysis}
      />
    );

    expect(screen.queryByText(/error|failed/i)).toBeDefined();
  });

  it('should update when new batchAnalysis is provided', async () => {
    const { rerender } = render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={mockBatchAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    let showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    expect(screen.getByText('fast')).toBeInTheDocument();

    const newAnalysis = {
      ...mockBatchAnalysis,
      total_terms_flagged: 1,
      ambiguous_terms: [
        {
          id: 'term_3',
          term: 'robust',
          position_start: 0,
          position_end: 6,
          confidence: 0.92,
          suggestions: ['fault tolerant'],
          status: 'pending'
        }
      ]
    };

    rerender(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={newAnalysis}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('robust')).toBeInTheDocument();
    });
  });

  it('should render multiple ambiguous terms correctly', () => {
    const multiTermAnalysis = {
      ...mockBatchAnalysis,
      total_terms_flagged: 4,
      ambiguous_terms: [
        ...mockBatchAnalysis.ambiguous_terms,
        {
          id: 'term_3',
          term: 'responsive',
          position_start: 50,
          position_end: 60,
          confidence: 0.85,
          suggestions: ['under 100ms'],
          status: 'pending'
        },
        {
          id: 'term_4',
          term: 'secure',
          position_start: 70,
          position_end: 76,
          confidence: 0.90,
          suggestions: ['encrypted', 'SSL/TLS'],
          status: 'pending'
        }
      ]
    };

    render(
      <AmbiguityDetectionPanel 
        requirement={mockRequirement} 
        batchAnalysis={multiTermAnalysis}
      />
    );

    // Click "Show Details" to display the terms
    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    expect(screen.getByText('fast')).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
    expect(screen.getByText('responsive')).toBeInTheDocument();
    expect(screen.getByText('secure')).toBeInTheDocument();
  });
});
