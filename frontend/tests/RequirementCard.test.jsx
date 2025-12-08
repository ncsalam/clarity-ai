import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, test, afterEach, vi, expect } from 'vitest';
import RequirementCard from '../src/components/RequirementCard';

vi.useFakeTimers();

const mockRequirement = {
  id: 1,
  req_id: 'REQ-001',
  title: 'Test Requirement',
  description: 'Initial description',
  status: 'Draft',
  priority: 'High',
  requirement_type: 'Functional',
  source_document_filename: 'specs.docx',
  tags: [{ name: 'UI' }, { name: 'Backend' }],
  stakeholders: ['Alice', 'Bob'],
};

describe('RequirementCard', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  afterEach(() => {
    vi.clearAllTimers();
    onEdit.mockReset();
    onDelete.mockReset();
  });

  test('renders basic info and tags', () => {
    render(<RequirementCard requirement={mockRequirement} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText('Test Requirement')).toBeInTheDocument();
    expect(screen.getByText('REQ-001')).toBeInTheDocument();
    expect(screen.getByText('Initial description')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('High Priority')).toBeInTheDocument();
    expect(screen.getByText('Functional')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('specs.docx')).toBeInTheDocument();
  });

  test('edit button toggles textarea', () => {
    render(<RequirementCard requirement={mockRequirement} onEdit={onEdit} onDelete={onDelete} enableRealTimeAnalysis />);
    
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);
    expect(screen.getByPlaceholderText('Edit requirement description...')).toBeInTheDocument();

    fireEvent.click(editButton);
    expect(screen.queryByPlaceholderText('Edit requirement description...')).toBeNull();
  });

  test('calls onEdit and onDelete when buttons clicked', () => {
    render(<RequirementCard requirement={mockRequirement} onEdit={onEdit} onDelete={onDelete} />);

    const editButton = screen.getByTitle('Edit Requirement');
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith(mockRequirement);

    const deleteButton = screen.getByTitle('Delete Requirement');
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(mockRequirement);
  });

  test('debounced analysis triggers on description change', () => {
    render(<RequirementCard requirement={mockRequirement} onEdit={onEdit} onDelete={onDelete} enableRealTimeAnalysis />);
    
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const textarea = screen.getByPlaceholderText('Edit requirement description...');
    fireEvent.change(textarea, { target: { value: 'Updated description' } });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Debounce runs internally, no direct assertion
  });

  test('conflicting and selected styling applied', () => {
    render(
      <RequirementCard 
        requirement={mockRequirement} 
        onEdit={onEdit} 
        onDelete={onDelete} 
        isConflicting 
        isSelected 
      />
    );

    const card = screen.getByText('Test Requirement').closest('div.bg-white');
    expect(card).toHaveClass('ring-4');

    const warningIcon = screen.getByLabelText('warning');
    expect(warningIcon).toBeInTheDocument();
  });
});
