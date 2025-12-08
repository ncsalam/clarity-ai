// tests/RequirementsGraph.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import RequirementsGraph from '../src/components/RequirementsGraph';
import * as tagColors from '../src/util/tagColors';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// -------------------------
// Mock getTagColor
// -------------------------
vi.mock('../src/util/tagColors', () => ({
  getTagColor: vi.fn(name => {
    const colors = { UI: '#ff0000', Backend: '#00ff00', 'source:doc1': '#0000ff' };
    return colors[name] || '#cccccc';
  }),
}));

// -------------------------
// Full D3 Mock
// -------------------------
vi.mock('d3', () => {
  const callbacks = {};
  const simulationNodes = [];

  const chainable = () => ({
    select: vi.fn(() => chainable()),
    selectAll: vi.fn(() => chainable()),
    append: vi.fn(() => chainable()),
    attr: vi.fn(() => chainable()),
    style: vi.fn(() => chainable()),
    text: vi.fn(() => chainable()),
    call: vi.fn(() => chainable()),
    on: vi.fn((event, cb) => {
      callbacks[event] = cb;
      return chainable();
    }),
    remove: vi.fn(),
    data: vi.fn(() => ({
      join: vi.fn(() => chainable()),
      enter: vi.fn(() => chainable()),
      exit: vi.fn(() => chainable()),
    })),
    nodes: vi.fn(() => []),
    node: vi.fn(() => document.createElement('div')),
    filter: vi.fn(() => chainable()), // important for your link.filter() calls
  });

  const mockSimulation = {
    nodes: vi.fn(() => simulationNodes),
    force: vi.fn().mockReturnThis(),
    alphaTarget: vi.fn().mockReturnThis(),
    restart: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    on: vi.fn((event, cb) => {
      callbacks[event] = cb;
      return mockSimulation;
    }),
  };

  const d3Mock = {
    ...chainable(),
    select: vi.fn(() => chainable()),
    selectAll: vi.fn(() => chainable()),
    forceSimulation: vi.fn((nodes) => {
      if (nodes) simulationNodes.push(...nodes);
      return mockSimulation;
    }),
    forceLink: vi.fn(() => ({
      id: vi.fn().mockReturnThis(),
      distance: vi.fn().mockReturnThis(),
      links: vi.fn().mockReturnThis(),
    })),
    forceManyBody: vi.fn(() => ({ strength: vi.fn().mockReturnThis() })),
    forceX: vi.fn(() => ({ x: vi.fn().mockReturnThis(), strength: vi.fn().mockReturnThis() })),
    forceY: vi.fn(() => ({ y: vi.fn().mockReturnThis(), strength: vi.fn().mockReturnThis() })),
    forceCenter: vi.fn(() => d3Mock.forceCenter),
    forceCollide: vi.fn(() => ({ radius: vi.fn().mockReturnThis(), strength: vi.fn().mockReturnThis(), iterations: vi.fn().mockReturnThis() })),
    zoom: vi.fn(() => ({ scaleExtent: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis() })),
    drag: vi.fn(() => ({ on: vi.fn((event, cb) => { callbacks[`drag_${event}`] = cb; return chainable(); }) })),
    zoomIdentity: { k: 1, x: 0, y: 0 },
    __callbacks: callbacks,
    __simulation: mockSimulation,
    __simulationNodes: simulationNodes,
  };

  return { default: d3Mock, ...d3Mock };
});

// -------------------------
// Mock Requirements Data
// -------------------------
const mockRequirements = [
  { req_id: 'R1', title: 'First requirement', tags: [{ name: 'UI' }, { name: 'Backend' }], source_document_filename: 'doc1' },
  { req_id: 'R2', title: 'Second requirement', tags: [{ name: 'Backend' }], source_document_filename: 'doc1' },
  { req_id: 'R3', title: 'Third requirement', tags: [{ name: 'UI' }], source_document_filename: 'doc2' },
];

const mockRequirementsNoTags = [
  { req_id: 'R1', title: 'No tags requirement', tags: [], source_document_filename: 'doc1' },
];

// -------------------------
// Tests
// -------------------------
describe('RequirementsGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------- Basic Rendering --------
  describe('Basic Rendering', () => {
    it('renders SVG when requirements are provided', () => {
      const { container } = render(<RequirementsGraph requirements={mockRequirements} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders all unique tags in the legend', () => {
      render(<RequirementsGraph requirements={mockRequirements} />);
      expect(screen.getByText('UI')).toBeInTheDocument();
      expect(screen.getByText('Backend')).toBeInTheDocument();
    });


    it('does not duplicate tags in the legend', () => {
      render(<RequirementsGraph requirements={mockRequirements} />);
      const backendTags = screen.getAllByText('Backend');
      expect(backendTags).toHaveLength(1);
    });

    it('handles requirements with no tags gracefully', () => {
      const { container } = render(<RequirementsGraph requirements={mockRequirementsNoTags} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
      expect(screen.queryByText(/No requirements to visualize/i)).not.toBeInTheDocument();
    });
  });

  // -------- Tag Colors --------
  describe('Tag Colors', () => {
    it('applies correct colors for tags', () => {
      render(<RequirementsGraph requirements={mockRequirements} />);
      expect(tagColors.getTagColor).toHaveBeenCalledWith('UI');
      expect(tagColors.getTagColor).toHaveBeenCalledWith('Backend');
      expect(tagColors.getTagColor).toHaveBeenCalledWith('source:doc1');
      expect(tagColors.getTagColor).toHaveBeenCalledWith('source:doc2');
    });


    it('applies fallback color for unmapped tags', () => {
      const customReqs = [
        { req_id: 'R4', title: 'Custom', tags: [{ name: 'UnknownTag' }], source_document_filename: 'doc3' },
      ];
      render(<RequirementsGraph requirements={customReqs} />);
      expect(tagColors.getTagColor).toHaveBeenCalledWith('UnknownTag');
    });
  });
});
