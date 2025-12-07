// import { describe, it, expect, beforeEach, vi } from 'vitest';
// import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// import AmbiguityHighlighter from '../AmbiguityHighlighter';

// describe('AmbiguityHighlighter - Text & Highlighting', () => {
//   const mockAnalysis = {
//     id: 'analysis_1',
//     ambiguous_terms: [
//       {
//         id: 'term_1',
//         term: 'fast',
//         start: 25,
//         end: 29,
//         confidence: 0.95,
//         context: 'The system should be fast and responsive'
//       },
//       {
//         id: 'term_2',
//         term: 'responsive',
//         start: 34,
//         end: 44,
//         confidence: 0.90,
//         context: 'The system should be fast and responsive'
//       }
//     ]
//   };

//   const mockText = 'The system should be fast and responsive to user inputs';

//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it('should render text with highlighted ambiguous terms', () => {
//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={mockAnalysis}
//       />
//     );

//     expect(container.textContent).toContain(mockText);
//     const highlights = container.querySelectorAll('mark, span[data-highlight="true"]');
//     expect(highlights.length).toBeGreaterThanOrEqual(2);
//   });

//   it('should apply correct highlighting style for ambiguous terms', () => {
//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={mockAnalysis}
//       />
//     );

//     const highlights = container.querySelectorAll('mark, span[data-highlight="true"]');
//     highlights.forEach((highlight) => {
//       expect(highlight.className).toContain('highlight');
//     });
//   });

//   it('should preserve text order and content', () => {
//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={mockAnalysis}
//       />
//     );

//     const textContent = container.textContent;
//     expect(textContent).toBe(mockText);
//   });

//   it('should handle overlapping terms gracefully', () => {
//     const overlappingAnalysis = {
//       ...mockAnalysis,
//       ambiguous_terms: [
//         {
//           id: 'term_1',
//           term: 'very fast',
//           start: 21,
//           end: 29,
//           confidence: 0.85
//         },
//         {
//           id: 'term_2',
//           term: 'fast',
//           start: 26,
//           end: 29,
//           confidence: 0.95
//         }
//       ]
//     };

//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={overlappingAnalysis}
//       />
//     );

//     expect(container.textContent).toContain(mockText);
//   });

//   it('should handle empty analysis', () => {
//     const emptyAnalysis = {
//       id: 'analysis_1',
//       ambiguous_terms: []
//     };

//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={emptyAnalysis}
//       />
//     );

//     expect(container.textContent).toBe(mockText);
//   });

//   it('should display confidence visual indicator', () => {
//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={mockAnalysis}
//         showConfidence={true}
//       />
//     );

//     // Check for confidence display (percentages or visual indicators)
//     expect(container.textContent).toMatch(/95|90/);
//   });

//   it('should call onClick handler when term is clicked', () => {
//     const onTermClick = vi.fn();

//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={mockAnalysis}
//         onTermClick={onTermClick}
//       />
//     );

//     const highlights = container.querySelectorAll('mark, span[data-highlight="true"]');
//     if (highlights.length > 0) {
//       fireEvent.click(highlights[0]);
//       expect(onTermClick).toHaveBeenCalled();
//     }
//   });

//   it('should support custom highlighting colors by confidence', () => {
//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//         analysis={mockAnalysis}
//         colorByConfidence={true}
//       />
//     );

//     const highlights = container.querySelectorAll('mark, span[data-highlight="true"]');
//     const highConfidenceHighlight = highlights[0];
//     expect(highConfidenceHighlight.getAttribute('data-confidence')).toBeTruthy();
//   });

//   it('should handle special characters in text', () => {
//     const specialText = 'The system should be "fast" & responsive. Really!';
//     const specialAnalysis = {
//       ...mockAnalysis,
//       ambiguous_terms: [
//         {
//           id: 'term_1',
//           term: 'fast',
//           start: 22,
//           end: 26,
//           confidence: 0.95
//         }
//       ]
//     };

//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={specialText}
//         analysis={specialAnalysis}
//       />
//     );

//     expect(container.textContent).toContain(specialText);
//   });

//   it('should not highlight with no analysis provided', () => {
//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={mockText}
//       />
//     );

//     const highlights = container.querySelectorAll('mark');
//     expect(highlights.length).toBe(0);
//   });

//   it('should handle long text with many terms', () => {
//     const longText = 'The system should be fast, responsive, efficient, scalable, robust, secure, reliable, stable, maintainable, modular, and extensible';
//     const manyTermsAnalysis = {
//       id: 'analysis_1',
//       ambiguous_terms: [
//         { id: '1', term: 'fast', start: 22, end: 26, confidence: 0.95 },
//         { id: '2', term: 'responsive', start: 28, end: 38, confidence: 0.90 },
//         { id: '3', term: 'efficient', start: 40, end: 49, confidence: 0.88 },
//         { id: '4', term: 'scalable', start: 51, end: 59, confidence: 0.92 },
//         { id: '5', term: 'robust', start: 61, end: 67, confidence: 0.91 },
//         { id: '6', term: 'secure', start: 69, end: 75, confidence: 0.93 }
//       ]
//     };

//     const { container } = render(
//       <AmbiguityHighlighter 
//         text={longText}
//         analysis={manyTermsAnalysis}
//       />
//     );

//     expect(container.textContent).toContain(longText);
//     const highlights = container.querySelectorAll('mark, span[data-highlight="true"]');
//     expect(highlights.length).toBe(6);
//   });
// });
