// ContradictionPanel.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContradictionPanel from '../src/components/ContradictionPanel';
import { describe, it, beforeEach, vi, expect } from 'vitest';

const mockOnConflictSelect = vi.fn();

const defaultProps = {
  onConflictSelect: mockOnConflictSelect,
  isLoading: false
};

describe('ContradictionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    render(<ContradictionPanel {...defaultProps} isLoading={true} />);
    expect(screen.getByText(/Analyzing.../i)).toBeInTheDocument();
  });

  it('renders no report / no conflicts message', () => {
    render(<ContradictionPanel {...defaultProps} report={{ status: 'no_conflicts' }} />);
    const messages = screen.getAllByText(/No Contradictions Found/i);
    expect(messages).toHaveLength(1);
  });

  it('renders pending analysis panel', () => {
    render(<ContradictionPanel {...defaultProps} report={{ status: 'pending' }} />);
    expect(screen.getByText(/Analysis Pending/i)).toBeInTheDocument();
  });

  it('renders complete analysis with no unresolved conflicts', () => {
    const report = {
      status: 'complete',
      conflicts: [{ id: 1, status: 'resolved', conflict_id: 'C-001', reason: 'Test', conflicting_requirement_ids: ['R1', 'R2'] }]
    };
    render(<ContradictionPanel {...defaultProps} report={report} />);
    expect(screen.getByText(/Analysis Complete/i)).toBeInTheDocument();
  });

  it('renders unresolved conflicts correctly', () => {
    const report = {
      status: 'complete',
      conflicts: [
        { id: 1, status: 'pending', conflict_id: 'C-001', reason: 'Conflict reason', conflicting_requirement_ids: ['R1','R2'] },
        { id: 2, status: 'pending', conflict_id: 'C-002', reason: 'Another reason', conflicting_requirement_ids: ['R3','R4'] }
      ]
    };
    render(<ContradictionPanel {...defaultProps} report={report} />);

    expect(screen.getByText(/2 Critical Contradictions Found/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflict 1: C-001/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflict 2: C-002/i)).toBeInTheDocument();

    // Click on conflict triggers handler
    fireEvent.click(screen.getByText(/Conflict 1: C-001/i).closest('div'));
    expect(mockOnConflictSelect).toHaveBeenCalledWith(['R1','R2']);
  });
});
