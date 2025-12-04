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
    const centerX = width / 2;
    const centerY = height / 2;

    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const tagToRequirements = new Map();
    const sourceToRequirements = new Map(); // filename -> [reqNodeId]

    // ---------------------------
    // Build Requirement Nodes
    // ---------------------------
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

      // populate source -> req mapping
      if (!sourceToRequirements.has(sourceFilename)) {
        sourceToRequirements.set(sourceFilename, []);
      }
      sourceToRequirements.get(sourceFilename).push(reqNodeId);

      // tags map
      req.tags?.forEach(tag => {
        if (!tagToRequirements.has(tag.name)) tagToRequirements.set(tag.name, []);
        tagToRequirements.get(tag.name).push(reqNodeId);
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
    // Build Requirement–Requirement Links (same source document)
    // ---------------------------
    // Create links between all requirements that came from the same source filename
    sourceToRequirements.forEach((reqIds, sourceFilename) => {
      for (let i = 0; i < reqIds.length; i++) {
        for (let j = i + 1; j < reqIds.length; j++) {
          links.push({
            source: reqIds[i],
            target: reqIds[j],
            type: 'same-source',
            sourceDocument: sourceFilename
          });
        }
      }
    });

    // ---------------------------
    // Prepare source centers (for clustering)
    // ---------------------------
    const uniqueSources = Array.from(sourceToRequirements.keys());
    const sourceCenters = new Map();
    // Arrange centers around a circle (deterministic)
    const clusterRadius = Math.min(width, height) * 0.28;
    uniqueSources.forEach((source, idx) => {
      const angle = (idx / Math.max(1, uniqueSources.length)) * Math.PI * 2;
      const sx = centerX + Math.cos(angle) * clusterRadius;
      const sy = centerY + Math.sin(angle) * clusterRadius;
      sourceCenters.set(source, { x: sx, y: sy });
    });

    // Precompute deterministic color per source (uses same utility for stable colors)
    const sourceColorMap = new Map();
    uniqueSources.forEach(src => {
      // use a prefix so that tags and sources don't collide color-wise in the cache
      sourceColorMap.set(src, getTagColor(`source:${src}`));
    });

    // ---------------------------
    // D3 Simulation
    // ---------------------------
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => (d.type === 'has-tag' ? 80 : 120)))
      .force('charge', d3.forceManyBody().strength(-250))
      // source clustering forces — pull requirement nodes toward their source center
      .force('x', d3.forceX().x(d => {
        if (d.type === 'requirement') {
          const c = sourceCenters.get(d.sourceDocument);
          return c ? c.x : centerX;
        }
        // tags are centered
        return centerX;
      }).strength(0.15))
      .force('y', d3.forceY().y(d => {
        if (d.type === 'requirement') {
          const c = sourceCenters.get(d.sourceDocument);
          return c ? c.y : centerY;
        }
        return centerY;
      }).strength(0.15))
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

    // ---------------------------
    // Zoom Support
    // ---------------------------
    svg.call(d3.zoom().scaleExtent([0.1, 4]).on('zoom', event => g.attr('transform', event.transform)));

    // ---------------------------
    // Link Drawing
    // ---------------------------
    const link = g.append('g')
      .attr('pointer-events', 'all')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => {
        if (d.type === 'has-tag') return '#999';
        if (d.type === 'same-source') return sourceColorMap.get(d.sourceDocument) || '#0d9488';
        return '#999';
      })
      .attr('stroke-opacity', d => d.type === 'has-tag' ? 0.6 : 0.45)
      .attr('stroke-width', d => d.type === 'has-tag' ? 2 : 2)
      .attr('stroke-dasharray', d => d.type === 'same-source' ? '5,5' : '0');

    // Tooltip for same-source links
    link.filter(d => d.type === 'same-source')
      .append('title')
      .text(d => `Same source: ${d.sourceDocument}`);

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
      .attr('stroke-width', d => selectedNode === d.id ? 4 : 2)
      .attr('stroke', '#000000aa');

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

    // ---------------------------
    // Hover behavior for same-source dashed links (Feature 2)
    // ---------------------------
    // Helper to highlight all requirements for a given source filename
    function highlightSource(sourceFilename) {
      // which node ids belong to this source
      const reqIds = new Set(sourceToRequirements.get(sourceFilename) || []);

      // highlight matching nodes, dim others
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

    // Add mouse events to same-source links
    link
      .on('mouseover', function (event, d) {
        if (d.type === 'same-source') {
          // dim links except this source's links
          link.attr('stroke-opacity', l => (l.type === 'same-source' && l.sourceDocument === d.sourceDocument ? 0.9 : (l.type === 'has-tag' ? 0.15 : 0.08)));
          // highlight nodes in the source
          highlightSource(d.sourceDocument);
        }
      })
      .on('mouseout', function (event, d) {
        // restore opacities and node styles
        link.attr('stroke-opacity', l => (l.type === 'has-tag' ? 0.6 : 0.45));
        resetHighlight();
      });

    // ---------------------------
    // Simulation tick
    // ---------------------------
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
  // Render Graph + Legend (including dashed-line legend item)
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

          {/* Legend: dashed-line meaning */}
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
