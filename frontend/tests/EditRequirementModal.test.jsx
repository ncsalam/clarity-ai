import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, vi, expect } from 'vitest';
import EditRequirementModal from '../src/components/EditRequirementModal';

const mockRequirement = {
  req_id: 'REQ-123',
  title: 'Initial Title',
  description: 'Initial description',
  status: 'Draft',
  priority: 'Medium'
};

describe('EditRequirementModal', () => {
  it('renders with initial requirement data', () => {
    render(<EditRequirementModal requirement={mockRequirement} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByDisplayValue('Initial Title')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Initial description')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Draft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Medium')).toBeInTheDocument();
  });

  it('updates form data when inputs change', () => {
    render(<EditRequirementModal requirement={mockRequirement} onClose={() => {}} onSave={() => {}} />);
    
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Updated Title' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Updated description' } });
    
    expect(screen.getByDisplayValue('Updated Title')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Updated description')).toBeInTheDocument();
  });

  it('calls onSave with updated data on submit', () => {
    const onSave = vi.fn();
    render(<EditRequirementModal requirement={mockRequirement} onClose={() => {}} onSave={onSave} />);
    
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'New Title' } });
    fireEvent.click(screen.getByText(/Save Changes/i));
    
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }));
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<EditRequirementModal requirement={mockRequirement} onClose={onClose} onSave={() => {}} />);
    
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onClose).toHaveBeenCalled();
  });
});
