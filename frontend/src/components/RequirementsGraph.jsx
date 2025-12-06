import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { getTagColor } from '../util/tagColors';

const RequirementsGraph = ({ requirements }) => {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [tagColorMap, setTagColorMap] = useState(new Map());

  useEffect(() => {
    if (!requirements || requirements.length === 0) return;

    // Clear previous graph
    d3.select(svgRef.current).selectAll('*').remove();

    // Responsive size
    const rect = svgRef.current.getBoundingClientRect();
    const width = rect.width || 928;
    const height = rect.height || 600;

    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const tagToRequirements = new Map();

    // ---------------------------
    // Build Requirement Nodes
    // ---------------------------
    requirements.forEach(req => {
      const reqNode = {
        id: `req:${req.req_id}`,
        type: 'requirement',
        label: req.req_id,
        title: req.title,
        fullData: req
      };
      nodes.push(reqNode);
      nodeMap.set(reqNode.id, reqNode);

      req.tags?.forEach(tag => {
        if (!tagToRequirements.has(tag.name)) tagToRequirements.set(tag.name, []);
        tagToRequirements.get(tag.name).push(reqNode.id);
      });
    });

    // Collect all tag names
    const allTagsList = Array.from(tagToRequirements.keys());
    setAllTags(allTagsList);

    // Build Tag → Color map using shared utility
    const sharedTagColorMap = new Map();
    allTagsList.forEach(tagName => {
      sharedTagColorMap.set(tagName, getTagColor(tagName));
    });
    setTagColorMap(sharedTagColorMap);

    // ---------------------------
    // Tag Nodes + Tag Links
    // ---------------------------
    requirements.forEach(req => {
      req.tags?.forEach(tag => {
        const tagId = `tag:${tag.name}`;
        if (!nodeMap.has(tagId)) {
          const tagNode = {
            id: tagId,
            type: 'tag',
            label: tag.name,
            color: sharedTagColorMap.get(tag.name)
          };
          nodes.push(tagNode);
          nodeMap.set(tagId, tagNode);
        }
        links.push({ source: `req:${req.req_id}`, target: tagId, type: 'has-tag' });
      });
    });

    // ---------------------------
    // Build Requirement–Requirement Links (shared tags)
    // ---------------------------
    tagToRequirements.forEach((reqIds, tagName) => {
      for (let i = 0; i < reqIds.length; i++) {
        for (let j = i + 1; j < reqIds.length; j++) {
          const exists = links.some(
            l =>
              (l.source === reqIds[i] && l.target === reqIds[j]) ||
              (l.source === reqIds[j] && l.target === reqIds[i])
          );
          if (!exists) {
            links.push({
              source: reqIds[i],
              target: reqIds[j],
              type: 'shared-tag',
              sharedTag: tagName
            });
          }
        }
      }
    });

    // ---------------------------
    // D3 Simulation
    // ---------------------------
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => d.type === 'has-tag' ? 80 : 150))
      .force('charge', d3.forceManyBody().strength(-125))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.type === 'requirement' ? 25 : 35));

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

    // ---------------------------
    // Zoom Support
    // ---------------------------
    svg.call(d3.zoom().scaleExtent([0.1, 4]).on('zoom', event => g.attr('transform', event.transform)));

    // ---------------------------
    // Link Drawing
    // ---------------------------
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => d.type === 'has-tag' ? '#999' : '#4f46e5')
      .attr('stroke-opacity', d => d.type === 'has-tag' ? 0.6 : 0.3)
      .attr('stroke-width', d => d.type === 'has-tag' ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'shared-tag' ? '5,5' : '0');

    link.filter(d => d.type === 'shared-tag')
      .append('title')
      .text(d => `Connected via: ${d.sharedTag}`);

    // ---------------------------
    // Node Drawing
    // ---------------------------
    const node = g.append('g')
      .attr('stroke', '#000000ff')
      .attr('stroke-width', 0)
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(drag(simulation));

    node.append('circle')
      .attr('r', d => d.type === 'requirement' ? 8 : 10)
      .attr('fill', d => d.type === 'requirement' ? '#000000ff' : d.color)
      .attr('stroke-width', d => selectedNode === d.id ? 4 : 2);

    node.append('text')
      .attr('x', 12)
      .attr('y', '0.31em')
      .text(d => d.label)
      .attr('font-size', d => d.type === 'requirement' ? '11px' : '12px')
      .attr('font-weight', d => d.type === 'requirement' ? '600' : 'bold')
      .attr('fill', '#000');

    node.append('title')
      .text(d => d.type === 'requirement' ? `${d.label}: ${d.title}` : `Tag: ${d.label}`);

    node.on('click', (_, d) =>
      setSelectedNode(prev => (prev === d.id ? null : d.id))
    );

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function drag(sim) {
      function dragstarted(event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      function dragended(event, d) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    return () => simulation.stop();
  }, [requirements, selectedNode]);

  // ---------------------------
  // Empty State
  // ---------------------------
  if (!requirements || requirements.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500 text-lg">No requirements to visualize</p>
      </div>
    );
  }

  // ---------------------------
  // Render Graph + Legend
  // ---------------------------
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">Requirements & Tags Network</h2>

        <div className="text-sm text-gray-800 space-y-1">
          <div className="flex flex-wrap gap-2">
            {allTags.map(tagName => {
              const color = getTagColor(tagName);
              return (
                <div key={tagName} className="flex items-center space-x-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  ></span>
                  <span className="text-black text-sm">{tagName}</span>
                </div>
              );
            })}
          </div>

          <div className="text-gray-600 mt-2">
            💡 Drag nodes to rearrange • Scroll to zoom • Hover for details • Click to highlight
          </div>
        </div>
      </div>

      <svg ref={svgRef} className="border border-gray-200 rounded-lg w-full h-[600px]"></svg>
    </div>
  );
};

export default RequirementsGraph;
