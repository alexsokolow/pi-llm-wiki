import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

interface GraphNode {
  id: string
  label: string
  path: string
  type: 'source' | 'entity' | 'concept' | 'synthesis' | 'unknown'
  wordCount: number
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: {
    totalPages: number
    totalLinks: number
    sources: number
    entities: number
    concepts: number
    syntheses: number
  }
}

const TYPE_COLORS: Record<string, string> = {
  source: '#58a6ff',
  entity: '#3fb950',
  concept: '#79c0ff',
  synthesis: '#f47067',
  unknown: '#484f58',
}

const TYPE_LABELS: Record<string, string> = {
  source: 'Sources',
  entity: 'Entities',
  concept: 'Concepts',
  synthesis: 'Syntheses',
  unknown: 'Other',
}

export default function WikiGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((d) => setData(d))
  }, [])

  useEffect(() => {
    if (!data || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = containerRef.current?.clientWidth || 800
    const height = containerRef.current?.clientHeight || 600

    // Filter nodes
    let nodes = data.nodes
    if (filter !== 'all') {
      nodes = nodes.filter((n) => n.type === filter)
    }
    const nodeIds = new Set(nodes.map((n) => n.id))
    let edges = data.edges.filter(
      (e) =>
        typeof e.source === 'string'
          ? nodeIds.has(e.source) && nodeIds.has(e.target as string)
          : nodeIds.has(e.source.id) && nodeIds.has((e.target as GraphNode).id)
    )

    // Create D3 simulation data (mutable copies)
    const simNodes: (GraphNode & { x?: number; y?: number; vx?: number; vy?: number })[] =
      nodes.map((n) => ({ ...n }))
    const simLinks = edges.map((e) => ({
      source:
        typeof e.source === 'string'
          ? simNodes.find((n) => n.id === e.source)!
          : simNodes.find((n) => n.id === (e.source as GraphNode).id)!,
      target:
        typeof e.target === 'string'
          ? simNodes.find((n) => n.id === e.target)!
          : simNodes.find((n) => n.id === (e.target as GraphNode).id)!,
    }))

    // Size nodes by word count
    const sizeScale = d3
      .scaleSqrt()
      .domain(d3.extent(simNodes, (d) => d.wordCount) as [number, number])
      .range([4, 18])

    const g = svg.append('g')

    // Zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom as any)

    // Force simulation
    const simulation = d3
      .forceSimulation(simNodes as any)
      .force(
        'link',
        d3
          .forceLink(simLinks as any)
          .id((d: any) => d.id)
          .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => sizeScale(d.wordCount) + 3))

    // Links
    const link = g
      .append('g')
      .attr('stroke', '#30363d')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke-width', 1)

    // Nodes
    const node = g
      .append('g')
      .selectAll('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => sizeScale(d.wordCount))
      .attr('fill', (d) => TYPE_COLORS[d.type] || '#484f58')
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGCircleElement, any>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as any
      )
      .on('click', (_event, d) => {
        setSelectedNode(d)
      })
      .on('mouseover', function () {
        d3.select(this).attr('stroke', '#ff9d00').attr('stroke-width', 2.5)
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke', '#0d1117').attr('stroke-width', 1.5)
      })

    // Labels (only for larger nodes or when zoomed)
    const label = g
      .append('g')
      .selectAll('text')
      .data(simNodes)
      .join('text')
      .text((d) => d.label)
      .attr('font-size', '10px')
      .attr('font-family', 'VT323, monospace')
      .attr('fill', '#c9d1d9')
      .attr('dx', (d) => sizeScale(d.wordCount) + 4)
      .attr('dy', 3)
      .style('pointer-events', 'none')
      .style('opacity', (d) => (sizeScale(d.wordCount) > 8 ? 0.85 : 0))

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)

      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => {
      simulation.stop()
    }
  }, [data, filter])

  if (!data) {
    return (
      <div className="graph-view">
        <div className="empty">loading graph...</div>
      </div>
    )
  }

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-stats">
          <span>{data.stats.totalPages} pages</span>
          <span>{data.stats.totalLinks} links</span>
        </div>
        <div className="graph-filters">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            all
          </button>
          {['source', 'entity', 'concept', 'synthesis'].map((t) => (
            <button
              key={t}
              className={`filter-btn ${filter === t ? 'active' : ''}`}
              onClick={() => setFilter(t)}
              style={{ '--filter-color': TYPE_COLORS[t] } as React.CSSProperties}
            >
              <span className="filter-dot" style={{ background: TYPE_COLORS[t] }} />
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="graph-canvas">
        <svg ref={svgRef} width="100%" height="100%" />
      </div>
      {selectedNode && (
        <div className="graph-panel">
          <div className="panel-title">&gt; {selectedNode.label}</div>
          <div className="graph-node-meta">
            <span className="graph-node-type" style={{ color: TYPE_COLORS[selectedNode.type] }}>
              {selectedNode.type}
            </span>
            <span className="graph-node-words">{selectedNode.wordCount} words</span>
          </div>
          <div className="graph-node-path">{selectedNode.path}</div>
          <button
            className="btn"
            onClick={() => {
              window.location.href = `/#/page/${encodeURIComponent(selectedNode.path)}`
            }}
          >
            OPEN PAGE
          </button>
        </div>
      )}
    </div>
  )
}
