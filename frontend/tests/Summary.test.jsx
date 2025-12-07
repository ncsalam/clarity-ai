import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AutomatedSummary from '../src/components/Summary';
import StructuredSummary from '../src/components/Summary';
import apiService from '../src/lib/api-service.js';
import { describe, test, vi, beforeEach, expect } from 'vitest';

vi.mock('../src/lib/api-service.js', () => ({
  default: { coreApi: vi.fn() },
}));

const mockSummary = {
  summary: JSON.stringify({
    summary: "Project completed successfully.",
    key_decisions: ["Decision 1", "Decision 2"],
    open_questions: ["Question 1"],
    action_items: [{ task: "Task 1", assignee: "Alice" }, { task: "Task 2" }]
  })
};

describe('AutomatedSummary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fetching & Loading', () => {
    test('renders loading state initially', async () => {
      apiService.coreApi.mockResolvedValueOnce(mockSummary);

      render(<AutomatedSummary refreshSignal={0} />);
      expect(screen.getByText(/Loading summary/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/Project completed successfully/i)).toBeInTheDocument();
      });
    });

    test('renders error message on fetch failure', async () => {
      apiService.coreApi.mockRejectedValueOnce(new Error('Network error'));

      render(<AutomatedSummary refreshSignal={0} />);
      await waitFor(() => {
        expect(screen.getByText(/No summary found/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Actions', () => {
    test('regenerates summary on button click', async () => {
      apiService.coreApi
        .mockResolvedValueOnce(mockSummary)
        .mockResolvedValueOnce({
          summary: JSON.stringify({ summary: "Updated summary" }),
        });

      render(<AutomatedSummary refreshSignal={0} />);
      await waitFor(() => screen.getByText(/Project completed successfully/i));

      const button = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/Updated summary/i)).toBeInTheDocument();
      });
    });
  });

  describe('StructuredSummary Rendering', () => {
    test('renders all sections correctly', async () => {
      render(
        <StructuredSummary summaryData={JSON.parse(mockSummary.summary)} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Project completed successfully/i)).toBeInTheDocument();
        expect(screen.getByText(/Key Decisions/i)).toBeInTheDocument();
        expect(screen.getByText(/Decision 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Open Questions/i)).toBeInTheDocument();
        expect(screen.getByText(/Question 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Action Items/i)).toBeInTheDocument();
        expect(screen.getByText(/Alice — Task 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Unassigned — Task 2/i)).toBeInTheDocument();
      });
    });
  });
});
