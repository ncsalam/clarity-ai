// AmbiguityHighlighter.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AmbiguityHighlighter from '../src/components/AmbiguityHighlighter';

describe('AmbiguityHighlighter', () => {
  const text = 'This is a test requirement';
  const terms = [
    { id: '1', term: 'test', position_start: 10, position_end: 14, confidence: 0.9, status: 'pending' },
    { id: '2', term: 'requirement', position_start: 15, position_end: 26, confidence: 0.6, status: 'clarified' },
  ];

  it('applies correct classes based on confidence and status', () => {
    render(<AmbiguityHighlighter text={text} ambiguousTerms={terms} />);

    const highConfidenceTerm = screen.getByText('test');
    expect(highConfidenceTerm.className).toContain('bg-red-200');

    const clarifiedTerm = screen.getByText('requirement');
    expect(clarifiedTerm.className).toContain('line-through');
    expect(clarifiedTerm.className).toContain('bg-green-200');
  });

  it('calls onTermClick when a pending term is clicked', () => {
    const handleClick = vi.fn(); // <-- vitest function
    render(<AmbiguityHighlighter text={text} ambiguousTerms={terms} onTermClick={handleClick} />);
    
    fireEvent.click(screen.getByText('test'));
    expect(handleClick).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));

    // Clarified term should NOT trigger onTermClick
    fireEvent.click(screen.getByText('requirement'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows tooltip on hover and hides on mouse leave', () => {
    render(<AmbiguityHighlighter text={text} ambiguousTerms={terms} />);

    const termSpan = screen.getByText('test');
    fireEvent.mouseEnter(termSpan);
    expect(screen.getByText(/Term:/i)).toBeInTheDocument();
    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();

    fireEvent.mouseLeave(termSpan);
    expect(screen.queryByText(/Term:/i)).not.toBeInTheDocument();
  });

  it('renders legend with all confidence levels', () => {
    render(<AmbiguityHighlighter text={text} ambiguousTerms={terms} />);
    expect(screen.getByText(/High confidence \(80%\+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Medium confidence \(50-80%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Low confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Clarified/i)).toBeInTheDocument();
  });

  it('renders plain text if no ambiguous terms', () => {
    render(<AmbiguityHighlighter text={text} ambiguousTerms={[]} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
