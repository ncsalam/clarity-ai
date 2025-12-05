import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { getTagColor } from '../util/tagColors';

const RequirementsGraph = ({ requirements }) => {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [tagColorMap, setTagColorMap] = useState(new Map());

  useEffect(() => {
    if (!requirements || requirements.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();

    const rect = svgRef.current.getBoundingClientRect();
    const width = rect.width || 928;
    const height = rect.height || 600;
    const centerX = width / 2;
    const centerY = height / 2;

    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const tagToRequirements = new Map();
    const sourceToRequirements = new Map();

    // Build requirement nodes
    requirements.forEach(req => {
      const reqNodeId = `req:${req.req_id}`;
      const sourceFilename = req.source_document_filename ?? 'unknown-source';
      const reqNode = {
        id: reqNodeId,
        type: 'requirement',
        label: req.req_id,
        title: req.title,
        fullData: req,
        sourceDocument: sourceFilename
      };
      nodes.push(reqNode);
      nodeMap.set(reqNode.id, reqNode);

      if (!sourceToRequirements.has(sourceFilename)) sourceToRequirements.set(sourceFilename, []);
      sourceToRequirements.get(sourceFilename).push(reqNodeId);

      req.tags?.forEach(tag => {
        if (!tagToRequirements.has(tag.name)) tagToRequirements.set(tag.name, []);
        tagToRequirements.get(tag.name).push(reqNodeId);
      });
    });

    const allTagsList = Array.from(tagToRequirements.keys());
    setAllTags(allTagsList);

    const sharedTagColorMap = new Map();
    allTagsList.forEach(tagName => sharedTagColorMap.set(tagName, getTagColor(tagName)));
    setTagColorMap(sharedTagColorMap);

    // Tag nodes and links
    requirements.forEach(req => {
      req.tags?.forEach(tag => {
        const tagId = `tag:${tag.name}`;
        if (!nodeMap.has(tagId)) {
          nodes.push({ id: tagId, type: 'tag', label: tag.name, color: sharedTagColorMap.get(tag.name) });
          nodeMap.set(tagId, nodes[nodes.length - 1]);
        }
        links.push({ source: `req:${req.req_id}`, target: tagId, type: 'has-tag' });
      });
    });

    // Requirement-requirement links
    sourceToRequirements.forEach((reqIds, sourceFilename) => {
      for (let i = 0; i < reqIds.length; i++) {
        for (let j = i + 1; j < reqIds.length; j++) {
          links.push({ source: reqIds[i], target: reqIds[j], type: 'same-source', sourceDocument: sourceFilename });
        }
      }
    });

    const uniqueSources = Array.from(sourceToRequirements.keys());
    const sourceCenters = new Map();
    const clusterRadius = Math.min(width, height) * 0.28;
    uniqueSources.forEach((source, idx) => {
      const angle = (idx / Math.max(1, uniqueSources.length)) * Math.PI * 2;
      sourceCenters.set(source, { x: centerX + Math.cos(angle) * clusterRadius, y: centerY + Math.sin(angle) * clusterRadius });
    });

    const sourceColorMap = new Map();
    uniqueSources.forEach(src => sourceColorMap.set(src, getTagColor(`source:${src}`)));

    // D3 Simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => (d.type === 'has-tag' ? 80 : 120)))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('x', d3.forceX().x(d => (d.type === 'requirement' ? sourceCenters.get(d.sourceDocument)?.x || centerX : centerX)).strength(0.15))
      .force('y', d3.forceY().y(d => (d.type === 'requirement' ? sourceCenters.get(d.sourceDocument)?.y || centerY : centerY)).strength(0.15))
      .force('collision', d3.forceCollide().radius(d => d.type === 'requirement' ? 28 : 36));

    simulationRef.current = simulation;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [0, 0, width, height])
      .attr('width', width)
      .attr('height', height)
      .style('max-width', '100%')
      .style('height', 'auto')
      .style('font', '12px sans-serif')
      .style('background-color', '#fff');

    const g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.1, 4]).on('zoom', event => g.attr('transform', event.transform)));

    // Links
    const link = g.append('g')
      .attr('pointer-events', 'all')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => (d.type === 'has-tag' ? '#999' : sourceColorMap.get(d.sourceDocument) || '#0d9488'))
      .attr('stroke-opacity', d => (d.type === 'has-tag' ? 0.6 : 0.45))
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => (d.type === 'same-source' ? '5,5' : '0'));

    link.filter(d => d.type === 'same-source').append('title').text(d => `Same source: ${d.sourceDocument}`);

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(drag(simulation));

    // Highlight circle only shows when tag is selected
    node.append('circle')
      .attr('class', 'highlight-circle')
      .attr('r', d => d.type === 'requirement' ? 12 : 14)
      .attr('fill', 'none')
      .attr('stroke-width', 0)
      .attr('stroke', 'none')
      .attr('pointer-events', 'none');

    node.append('circle')
      .attr('r', d => d.type === 'requirement' ? 8 : 10)
      .attr('fill', d => (d.type === 'requirement' ? '#000000ff' : d.color))
      .attr('stroke-width', d => (selectedNode === d.id ? 4 : 2))
      .attr('stroke', '#000000aa');

    node.append('text')
      .attr('x', 12)
      .attr('y', '0.31em')
      .text(d => d.label)
      .attr('font-size', d => (d.type === 'requirement' ? '11px' : '12px'))
      .attr('font-weight', d => (d.type === 'requirement' ? '600' : 'bold'))
      .attr('fill', '#000');

    node.append('title')
      .text(d => (d.type === 'requirement' ? `${d.label}: ${d.title}` : `Tag: ${d.label}`));

    // Click handler
    node.on('click', (_, d) => {
      if (d.type === 'tag') {
        setSelectedTag(prev => (prev === d.id ? null : d.id));
        setSelectedNode(null);
      }
    });

    // Hover behavior for same-source links
    function highlightSource(sourceFilename) {
      const reqIds = new Set(sourceToRequirements.get(sourceFilename) || []);
      node.select('circle')
        .attr('opacity', n => (n.type === 'requirement' ? (reqIds.has(n.id) ? 1 : 0.25) : 0.25))
        .attr('stroke', n => (n.type === 'requirement' && reqIds.has(n.id) ? sourceColorMap.get(sourceFilename) : '#000000aa'))
        .attr('stroke-width', n => (n.type === 'requirement' && reqIds.has(n.id) ? 3 : 1));
    }

    function resetHighlight() {
      node.select('circle')
        .attr('opacity', 1)
        .attr('stroke', '#000000aa')
        .attr('stroke-width', d => (selectedNode === d.id ? 4 : 2));
    }

    link.on('mouseover', function (event, d) {
      if (d.type === 'same-source') {
        link.attr('stroke-opacity', l => (l.type === 'same-source' && l.sourceDocument === d.sourceDocument ? 0.9 : (l.type === 'has-tag' ? 0.15 : 0.08)));
        highlightSource(d.sourceDocument);
      }
    }).on('mouseout', function () {
      link.attr('stroke-opacity', l => (l.type === 'has-tag' ? 0.6 : 0.45));
      resetHighlight();
    });

    // Simulation tick
    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function drag(sim) {
      function dragstarted(event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      }
      function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
      function dragended(event, d) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      }
      return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
    }

    return () => simulation.stop();
  }, [requirements]);

  // Update visuals for selectedTag / selectedNode
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg) return;

    const node = svg.selectAll('g').selectAll('g');
    const link = svg.selectAll('g').selectAll('line');

    // Update links
    link.attr('stroke', d => {
      if (d.type === 'has-tag') {
        return selectedTag && d.target.id === selectedTag ? d.target.color : '#999';
      }
      return d.type === 'same-source' ? d.sourceDocument ? getTagColor(`source:${d.sourceDocument}`) : '#0d9488' : '#999';
    })
    .attr('stroke-width', d => d.type === 'has-tag' ? (selectedTag && d.target.id === selectedTag ? 4 : 2) : 2);

    // Update highlight circles
    node.select('.highlight-circle')
      .attr('stroke-width', d => {
        if (selectedTag && d.type === 'requirement') {
          return link.data().some(l => l.source.id === d.id && l.target.id === selectedTag) ? 4 : 0;
        }
        return 0;
      })
      .attr('stroke', d => {
        if (selectedTag && d.type === 'requirement') {
          return link.data().some(l => l.source.id === d.id && l.target.id === selectedTag) ? getTagColor(selectedTag.replace('tag:', '')) : 'none';
        }
        return 'none';
      });
  }, [selectedTag, selectedNode]);

  // Empty state
  if (!requirements || requirements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500 text-lg">No requirements to visualize</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">Requirements & Tags Network</h2>

        <div className="text-sm text-gray-800 space-y-1">
          <div className="flex flex-wrap gap-2">
            {allTags.map(tagName => (
              <div key={tagName} className="flex items-center space-x-1">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: getTagColor(tagName) }}></span>
                <span className="text-black text-sm">{tagName}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <svg width="80" height="14" className="inline-block align-middle">
              <line x1="0" y1="8" x2="70" y2="8" stroke="#0d9488" strokeWidth="3" strokeDasharray="5,5" strokeLinecap="round" />
            </svg>
            <span className="text-sm text-gray-700">Dashed line = same source document</span>
          </div>

          <div className="text-gray-600 mt-2">
            💡 Drag nodes to rearrange • Scroll to zoom • Hover dashed lines to highlight source • Click nodes to select
          </div>
        </div>
      </div>

      <svg ref={svgRef} className="border border-gray-200 rounded-lg w-full h-[600px]"></svg>
    </div>
  );
};

export default RequirementsGraph;
