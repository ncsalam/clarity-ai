import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingSpinner from '../src/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders spinner with text', () => {
    render(<LoadingSpinner text="Loading..." />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it('renders full screen spinner', () => {
    render(<LoadingSpinner fullScreen text="Please wait..." />);
    expect(screen.getByText(/Please wait.../i)).toBeInTheDocument();
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument();
  });

  it('applies size and color classes', () => {
    render(<LoadingSpinner size="lg" color="red" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-8 w-8');
    expect(spinner).toHaveClass('border-red-600');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="my-custom-class" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toHaveClass('my-custom-class');
  });
});
