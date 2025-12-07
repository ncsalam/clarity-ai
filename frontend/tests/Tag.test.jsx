import { render, screen } from '@testing-library/react';
import Tag from '../src/components/Tag.jsx';
import * as tagColors from '../src/util/tagColors';
import { describe, test, vi, beforeEach, expect } from 'vitest';

describe('Tag component', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); // reset mocks before each test
  });

  describe('Basic Rendering', () => {
    test('renders tag name', () => {
      render(<Tag name="High Priority" />);
      expect(screen.getByText('High Priority')).toBeInTheDocument();
    });
  });

  describe('Color Logic', () => {
    test('applies default background color from getTagColor', () => {
      vi.spyOn(tagColors, 'getTagColor').mockReturnValue('#123456');
      render(<Tag name="CustomTag" />);
      const tag = screen.getByText('CustomTag');
      expect(tag).toHaveStyle('background-color: #123456');
      expect(tag).toHaveStyle('color: #fff'); // default dark text logic
    });

    test('overrides color for status type Draft', () => {
      render(<Tag name="Draft" type="status" />);
      const tag = screen.getByText('Draft');
      expect(tag).toHaveStyle('background-color: #d1d5db');
      expect(tag).toHaveStyle('color: #fff');
    });

    test('overrides color for status type non-Draft', () => {
      render(<Tag name="In Review" type="status" />);
      const tag = screen.getByText('In Review');
      expect(tag).toHaveStyle('background-color: #fed7aa');
      expect(tag).toHaveStyle('color: #fff');
    });

    test('applies dark text color for specific bg colors', () => {
      vi.spyOn(tagColors, 'getTagColor').mockReturnValue('#facc15'); // yellow
      render(<Tag name="WarningTag" />);
      const tag = screen.getByText('WarningTag');
      expect(tag).toHaveStyle('color: #000');
    });
  });
});
