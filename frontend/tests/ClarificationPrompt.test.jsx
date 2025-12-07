// ClarificationPrompt.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ClarificationPrompt from '../src/components/ClarificationPrompt';
import apiService from '../src/lib/api-service';
import { describe, it, beforeEach, vi, expect } from 'vitest';

vi.mock('../src/lib/api-service');

describe('ClarificationPrompt', () => {
  const term = {
    id: '123',
    term: 'Ambiguous Term',
    sentence_context: 'This is the sentence context.',
    clarification_prompt: 'Please clarify this term',
    suggested_replacements: ['Suggestion1', 'Suggestion2']
  };

  const onSubmit = vi.fn();
  const onSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with term and context', async () => {
    apiService.getSuggestions.mockResolvedValue({ suggestions: [], prompt: '' });

    await act(async () => {
      render(<ClarificationPrompt term={term} onSubmit={onSubmit} onSkip={onSkip} />);
    });

    expect(screen.getByText(/Clarify Ambiguous Term/i)).toBeInTheDocument();
    expect(screen.getByText(term.term)).toBeInTheDocument();
    expect(screen.getByText(term.sentence_context)).toBeInTheDocument();
    await waitFor(() => expect(apiService.getSuggestions).toHaveBeenCalledWith(term.id));
  });

  it('renders suggestions from API and allows selection', async () => {
    apiService.getSuggestions.mockResolvedValue({
      suggestions: ['Suggestion A', 'Suggestion B'],
      prompt: 'What does this mean?'
    });

    await act(async () => {
      render(<ClarificationPrompt term={term} onSubmit={onSubmit} onSkip={onSkip} />);
    });

    expect(await screen.findByText('Suggestion A')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Suggestion A'));
    });
    expect(screen.getByDisplayValue('Suggestion A')).toBeInTheDocument();
  });

  it('calls onSubmit with clarifiedText and action', async () => {
    apiService.getSuggestions.mockResolvedValue({ suggestions: [], prompt: '' });

    await act(async () => {
      render(<ClarificationPrompt term={term} onSubmit={onSubmit} onSkip={onSkip} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Enter a more specific/i), {
        target: { value: 'My Clarification' }
      });
      fireEvent.click(screen.getByText(/Submit Clarification/i));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('My Clarification', 'replace'));
  });

  it('calls onSkip when skip button clicked', async () => {
    apiService.getSuggestions.mockResolvedValue({ suggestions: [], prompt: '' });

    await act(async () => {
      render(<ClarificationPrompt term={term} onSubmit={onSubmit} onSkip={onSkip} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Skip/i));
    });

    expect(onSkip).toHaveBeenCalled();
  });


  it('displays error if onSubmit throws', async () => {
    apiService.getSuggestions.mockResolvedValue({ suggestions: [], prompt: '' });
    onSubmit.mockRejectedValue(new Error('Submission failed'));

    await act(async () => {
      render(<ClarificationPrompt term={term} onSubmit={onSubmit} onSkip={onSkip} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Enter a more specific/i), {
        target: { value: 'Test Clarification' }
      });
      fireEvent.click(screen.getByText(/Submit Clarification/i));
    });

    expect(await screen.findByText(/Submission failed/i)).toBeInTheDocument();
  });
});
