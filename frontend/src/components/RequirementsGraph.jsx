import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const RequirementsGraph = ({ requirements }) => {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);

  useEffect(() => {
    if (!requirements || requirements.length === 0) return;

    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    // Transform requirements data into nodes and links
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const tagToRequirements = new Map(); // Track which requirements have which tags

    // Create nodes for requirements
    requirements.forEach(req => {
      const reqNode = {
        id: req.req_id,
        type: 'requirement',
        label: req.req_id,
        title: req.title,
        fullData: req
      };
      nodes.push(reqNode);
      nodeMap.set(req.req_id, reqNode);

      // Track requirements by tag for connections
      if (req.tags && req.tags.length > 0) {
        req.tags.forEach(tag => {
          if (!tagToRequirements.has(tag.name)) {
            tagToRequirements.set(tag.name, []);
          }
          tagToRequirements.get(tag.name).push(req.req_id);
        });
      }
    });

    // Create a color scale for tags
    const allTags = Array.from(new Set(
      requirements.flatMap(req => req.tags ? req.tags.map(t => t.name) : [])
    ));
    
    const tagColorScale = d3.scaleOrdinal()
      .domain(allTags)
      .range(d3.schemeCategory10);

    // Create nodes for tags and links between requirements and tags
    requirements.forEach(req => {
      if (req.tags && req.tags.length > 0) {
        req.tags.forEach(tag => {
          // Add tag node if not already added
          if (!nodeMap.has(tag.name)) {
            const tagNode = {
              id: tag.name,
              type: 'tag',
              label: tag.name,
              color: tag.color || tagColorScale(tag.name)
            };
            nodes.push(tagNode);
            nodeMap.set(tag.name, tagNode);
          }

          // Create link between requirement and tag
          links.push({
            source: req.req_id,
            target: tag.name,
            type: 'has-tag'
          });
        });
      }
    });

    // Create links between requirements that share tags
    tagToRequirements.forEach((reqIds, tagName) => {
      // Connect each pair of requirements that share this tag
      for (let i = 0; i < reqIds.length; i++) {
        for (let j = i + 1; j < reqIds.length; j++) {
          // Check if link already exists
          const linkExists = links.some(
            link => 
              (link.source === reqIds[i] && link.target === reqIds[j]) ||
              (link.source === reqIds[j] && link.target === reqIds[i])
          );
          
          if (!linkExists) {
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

    // D3 Force Graph Setup
    const width = 928;
    const height = 600;

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.type === 'has-tag' ? 80 : 150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(35));

    simulationRef.current = simulation;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height)
      .attr("style", "max-width: 100%; height: auto; font: 12px sans-serif;");

    // Add zoom behavior
    const g = svg.append("g");
    
    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      }));

    // Create links with different styles
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", d => d.type === 'has-tag' ? '#999' : '#4f46e5')
      .attr("stroke-opacity", d => d.type === 'has-tag' ? 0.6 : 0.3)
      .attr("stroke-width", d => d.type === 'has-tag' ? 2 : 1)
      .attr("stroke-dasharray", d => d.type === 'shared-tag' ? "5,5" : "0");

    // Add title (tooltip) to shared-tag links
    link.append("title")
      .text(d => d.type === 'shared-tag' ? `Connected via: ${d.sharedTag}` : '');

    // Create nodes
    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(drag(simulation));

    // Add circles to nodes
    node.append("circle")
      .attr("r", d => d.type === 'requirement' ? 8 : 10)
      .attr("fill", d => d.type === 'requirement' ? '#4f46e5' : d.color);

    // Add labels to nodes - positioned to the right
    node.append("text")
      .attr("x", 12)
      .attr("y", "0.31em")
      .text(d => d.label)
      .attr("font-size", d => d.type === 'requirement' ? '11px' : '12px')
      .attr("font-weight", d => d.type === 'requirement' ? '600' : 'bold')
      .attr("fill", d => d.type === 'requirement' ? '#1f2937' : '#000')
      .clone(true).lower()
      .attr("fill", "none")
      .attr("stroke", "white")
      .attr("stroke-width", 3);

    // Add title (tooltip) to nodes
    node.append("title")
      .text(d => d.type === 'requirement' ? `${d.id}: ${d.title}` : `Tag: ${d.label}`);

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Drag behavior
    function drag(simulation) {
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [requirements]);

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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Requirements & Tags Network</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <div>
            <span className="inline-block w-3 h-3 rounded-full bg-indigo-600 mr-2"></span>
            Requirements
            <span className="ml-4 text-gray-500">• Connected by shared tags (dashed lines)</span>
          </div>
          <div>
            <span className="inline-block w-3 h-3 rounded-full bg-green-600 mr-2"></span>
            Tags
            <span className="ml-4 text-gray-500">• Color-coded by tag type</span>
          </div>
          <div className="text-gray-500 mt-2">
            💡 Drag nodes to rearrange • Scroll to zoom • Hover for details
          </div>
        </div>
      </div>
      <svg ref={svgRef} className="border border-gray-200 rounded-lg"></svg>
    </div>
  );
};

export default RequirementsGraph;