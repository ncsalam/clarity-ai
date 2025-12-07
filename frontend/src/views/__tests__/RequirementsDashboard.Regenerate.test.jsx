// import { describe, it, expect, beforeEach, vi } from 'vitest';
// import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// import RequirementsDashboard from '../../views/RequirementsDashboard';
// import apiService from '../../lib/api-service';

// vi.mock('../../lib/api-service');

// describe('RequirementsDashboard - Regenerate All Functionality', () => {
//   const mockRequirements = [
//     {
//       id: 1,
//       title: 'User Login',
//       description: 'Users should be able to login',
//       status: 'To Do',
//       priority: 'High'
//     },
//     {
//       id: 2,
//       title: 'User Profile',
//       description: 'Users should have a profile',
//       status: 'To Do',
//       priority: 'Medium'
//     }
//   ];

//   beforeEach(() => {
//     vi.clearAllMocks();
//     apiService.coreApi = vi.fn().mockResolvedValue(mockRequirements);
//     window.confirm = vi.fn().mockReturnValue(true);
//   });

//   it('should render Regenerate All button', async () => {
//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       expect(regenerateButton).toBeInTheDocument();
//     });
//   });

//   it('should show confirmation dialog when Regenerate All is clicked', async () => {
//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     expect(window.confirm).toHaveBeenCalledWith(
//       expect.stringContaining('re-analyze all documents')
//     );
//   });

//   it('should not regenerate if user cancels confirmation', async () => {
//     window.confirm.mockReturnValue(false);

//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Should NOT call the regenerate API
//     expect(apiService.coreApi).not.toHaveBeenCalledWith(
//       expect.stringContaining('/generate'),
//       expect.anything()
//     );
//   });

//   it('should call generate endpoint when confirmed', async () => {
//     apiService.coreApi = vi.fn()
//       .mockResolvedValueOnce(mockRequirements) // Initial fetch
//       .mockResolvedValueOnce({ success: true }) // Generate call
//       .mockResolvedValueOnce(mockRequirements); // Refresh fetch

//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     await waitFor(() => {
//       expect(apiService.coreApi).toHaveBeenCalledWith(
//         expect.stringContaining('/generate'),
//         expect.objectContaining({ method: 'POST' })
//       );
//     });
//   });

//   it('should reset batch analysis UI on Regenerate All', async () => {
//     const { container } = render(<RequirementsDashboard />);

//     // Simulate batch results showing
//     // (This would be set by batch analyze button first)
//     // Then click regenerate

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Should hide batch results banner/panel
//     await waitFor(() => {
//       expect(screen.queryByText(/batch analysis results/i)).not.toBeInTheDocument();
//     });
//   });

//   it('should reset contradiction panel on Regenerate All', async () => {
//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Contradiction panel should be cleared/reset
//     await waitFor(() => {
//       expect(screen.queryByText(/contradictions?/i)).not.toBeInTheDocument();
//     });
//   });

//   it('should preserve sidebar open/closed state on Regenerate All', async () => {
//     const { container } = render(<RequirementsDashboard />);

//     // Open sidebar
//     const sidebarToggle = screen.getByLabelText(/toggle sidebar|menu/i);
//     if (sidebarToggle) {
//       fireEvent.click(sidebarToggle);
//     }

//     const initialSidebarState = container.querySelector('.sidebar')?.classList.contains('open');

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Sidebar should maintain its state
//     const finalSidebarState = container.querySelector('.sidebar')?.classList.contains('open');
//     expect(finalSidebarState).toBe(initialSidebarState);
//   });

//   it('should preserve sidebar toggle state on Regenerate All', async () => {
//     const { container } = render(<RequirementsDashboard />);

//     // Toggle real-time analysis or contradiction detection
//     const toggles = container.querySelectorAll('input[type="checkbox"]');
//     const initialToggleStates = Array.from(toggles).map(t => t.checked);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Toggles should maintain their states
//     const finalToggleStates = Array.from(container.querySelectorAll('input[type="checkbox"]')).map(t => t.checked);
//     expect(finalToggleStates).toEqual(initialToggleStates);
//   });

//   it('should fetch fresh requirements after regeneration', async () => {
//     apiService.coreApi = vi.fn()
//       .mockResolvedValueOnce(mockRequirements) // Initial fetch
//       .mockResolvedValueOnce({ success: true }) // Generate call
//       .mockResolvedValueOnce(mockRequirements); // Refresh fetch

//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Should fetch requirements again
//     await waitFor(() => {
//       expect(apiService.coreApi).toHaveBeenCalledWith('/api/requirements');
//     });
//   });

//   it('should show loading state during regeneration', async () => {
//     apiService.coreApi = vi.fn()
//       .mockImplementationOnce(() => Promise.resolve(mockRequirements))
//       .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 500)))
//       .mockImplementationOnce(() => Promise.resolve(mockRequirements));

//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Check for loading indicator
//     await waitFor(() => {
//       expect(screen.getByText(/generating|analyzing|processing/i)).toBeInTheDocument();
//     });
//   });

//   it('should display error message if regeneration fails', async () => {
//     apiService.coreApi = vi.fn()
//       .mockResolvedValueOnce(mockRequirements)
//       .mockRejectedValueOnce(new Error('Generation failed'));

//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     await waitFor(() => {
//       expect(screen.getByText(/failed to generate|error/i)).toBeInTheDocument();
//     });
//   });

//   it('should hide banner when Regenerate All is triggered', async () => {
//     render(<RequirementsDashboard />);

//     // Simulate banner appearing (from batch analysis)
//     // Then click regenerate

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Banner should be hidden
//     expect(screen.queryByRole('banner')).not.toBeInTheDocument();
//   });

//   it('should revert banner to initial state (not show analyzed count)', async () => {
//     render(<RequirementsDashboard />);

//     await waitFor(() => {
//       const regenerateButton = screen.getByText(/regenerate all|re-analyze/i);
//       fireEvent.click(regenerateButton);
//     });

//     // Should not show batch analysis summary
//     expect(screen.queryByText(/\d+ requirements analyzed/i)).not.toBeInTheDocument();
//   });
// });
