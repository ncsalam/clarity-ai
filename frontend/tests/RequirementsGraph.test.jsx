// RequirementsGraph.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RequirementsGraph from '../components/RequirementsGraph';
import * as tagColors from '../util/tagColors';
import * as d3 from 'd3';

// Mock getTagColor
jest.mock('../util/tagColors', () => ({
  getTagColor: jest.fn(name => {
    const colors = { UI: '#ff0000', Backend: '#00ff00', 'source:doc1': '#0000ff' };
    return colors[name] || '#cccccc';
  }),
}));

// Mock D3
const mockTickHandlers = {};
const mockSimulation = {
  force: jest.fn().mockReturnThis(),
  on: jest.fn((event, cb) => {
    if (event === 'tick') mockTickHandlers.tick = cb;
    return mockSimulation;
  }),
  alphaTarget: jest.fn().mockReturnThis(),
  restart: jest.fn().mockReturnThis(),
  stop: jest.fn(),
};
jest.mock('d3', () => {
  const original = jest.requireActual('d3');
  return {
    ...original,
    forceSimulation: jest.fn(() => mockSimulation),
    drag: jest.fn(() => ({ on: jest.fn().mockReturnThis() })),
    select: jest.fn(() => ({
      selectAll: jest.fn(() => ({
        remove: jest.fn(),
        data: jest.fn(() => ({ join: jest.fn(() => ({ call: jest.fn(), append: jest.fn().mockReturnThis() })) })),
      })),
      append: jest.fn(() => ({ attr: jest.fn().mockReturnThis(), call: jest.fn(), selectAll: jest.fn().mockReturnThis() })),
      call: jest.fn(),
    })),
    zoom: jest.fn(() => ({ scaleExtent: jest.fn().mockReturnThis(), on: jest.fn().mockReturnThis() })),
  };
});

const mockRequirements = [
  {
    req_id: 'R1',
    title: 'First requirement',
    tags: [{ name: 'UI' }, { name: 'Backend' }],
    source_document_filename: 'doc1',
  },
  {
    req_id: 'R2',
    title: 'Second requirement',
    tags: [{ name: 'Backend' }],
    source_document_filename: 'doc1',
  },
];

describe('RequirementsGraph', () => {
  it('renders empty state when no requirements are provided', () => {
    render(<RequirementsGraph requirements={[]} />);
    expect(screen.getByText(/No requirements to visualize/i)).toBeInTheDocument();
  });

  it('renders SVG and tags when requirements are provided', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    expect(document.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('UI')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('applies correct colors for tags', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    const colorSpan = screen.getByText('UI').previousSibling;
    expect(colorSpan).toHaveStyle(`background-color: #ff0000`);
  });

  it('handles tag click to select and highlight', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    const uiTag = screen.getByText('UI');
    fireEvent.click(uiTag); // select
    fireEvent.click(uiTag); // deselect
  });

  it('renders dashed line legend and instructions', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    expect(screen.getByText(/Dashed line = same source document/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag nodes to rearrange/i)).toBeInTheDocument();
  });

  it('should call getTagColor for each tag', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    expect(tagColors.getTagColor).toHaveBeenCalledWith('UI');
    expect(tagColors.getTagColor).toHaveBeenCalledWith('Backend');
    expect(tagColors.getTagColor).toHaveBeenCalledWith('source:doc1');
  });

  it('simulates hover over same-source link to trigger highlight', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    
    const mockLink = { type: 'same-source', sourceDocument: 'doc1', source: { id: 'req:R1' }, target: { id: 'req:R2' } };
    const linkMock = { attr: jest.fn().mockReturnThis(), on: jest.fn() };
    d3.select.mockReturnValueOnce({ selectAll: jest.fn(() => linkMock), append: jest.fn(() => linkMock), call: jest.fn() });

    const mouseOverHandler = linkMock.on.mock.calls.find(call => call[0] === 'mouseover')[1];
    mouseOverHandler({}, mockLink);
    const mouseOutHandler = linkMock.on.mock.calls.find(call => call[0] === 'mouseout')[1];
    mouseOutHandler();

    expect(linkMock.attr).toHaveBeenCalled();
  });

  it('triggers simulation tick to update node/link positions', () => {
    render(<RequirementsGraph requirements={mockRequirements} />);
    expect(mockSimulation.on).toHaveBeenCalledWith('tick', expect.any(Function));

    // Manually invoke the tick callback
    if (mockTickHandlers.tick) {
      mockTickHandlers.tick();
    }
  });

  it('stops simulation on unmount', () => {
    const { unmount } = render(<RequirementsGraph requirements={mockRequirements} />);
    unmount();
    expect(mockSimulation.stop).toHaveBeenCalled();
  });
});
