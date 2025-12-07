import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Notification from '../src/components/Notification.jsx';

vi.useFakeTimers();

describe('Notification', () => {
  const message = 'Test message';
  const onClose = vi.fn();

  afterEach(() => {
    vi.clearAllTimers();
    onClose.mockReset();
  });

  it('does not render when isVisible=false', () => {
    render(<Notification message={message} isVisible={false} />);
    expect(screen.queryByText(message)).toBeNull();
  });

  it('manual close button calls onClose', () => {
    render(<Notification message={message} isVisible={true} onClose={onClose} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('autoClose triggers onClose after duration', () => {
    render(
      <Notification
        message={message}
        isVisible={true}
        onClose={onClose}
        autoClose={true}
        duration={5000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('autoClose=false does not trigger onClose automatically', () => {
    render(
      <Notification
        message={message}
        isVisible={true}
        onClose={onClose}
        autoClose={false}
        duration={5000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
