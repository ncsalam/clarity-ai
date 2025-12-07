// ConfirmDialog.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from '../src/components/ConfirmDialog';
import { describe, it, beforeEach, vi, expect } from 'vitest';

// Mock LoadingSpinner for Vitest
vi.mock('../src/components/LoadingSpinner', () => ({
  default: ({ size, color }) => <div data-testid="spinner" />
}));

describe('ConfirmDialog', () => {
  const props = {
    isOpen: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    confirmText: 'Yes',
    cancelText: 'No',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    loading: false,
    type: 'warning'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<ConfirmDialog {...props} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, message, and buttons', () => {
    render(<ConfirmDialog {...props} />);
    expect(screen.getByText(props.title)).toBeInTheDocument();
    expect(screen.getByText(props.message)).toBeInTheDocument();
    expect(screen.getByText(props.confirmText)).toBeInTheDocument();
    expect(screen.getByText(props.cancelText)).toBeInTheDocument();
  });

  it('calls onConfirm and onCancel when buttons are clicked', () => {
    render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByText(props.confirmText));
    fireEvent.click(screen.getByText(props.cancelText));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
