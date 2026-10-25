import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const NODE_WIDTH = 244
const NODE_HEIGHT = 84

function ProcedureNode({ data }) {
  return (
    <div className={`graph-node procedure-node ${data.active ? 'is-active' : ''} ${data.dimmed ? 'is-dimmed' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-symbol procedure-symbol" aria-hidden="true">P</span>
      <span className="node-copy">
        <span className="node-kind">PROCEDURE</span>
        <span className="node-name">{data.label}</span>
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function TableNode({ data }) {
  return (
    <div className={`graph-node table-node ${data.active ? 'is-active' : ''} ${data.dimmed ? 'is-dimmed' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-symbol table-symbol" aria-hidden="true">T</span>
      <span className="node-copy">
        <span className="node-kind">TABLE</span>
        <span className="node-name">{data.label}</span>
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function UncertainNode({ data }) {
  return (
    <div className={`graph-node uncertain-node ${data.active ? 'is-active' : ''} ${data.dimmed ? 'is-dimmed' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-symbol uncertain-symbol" aria-hidden="true">?</span>
      <span className="node-copy">
        <span className="node-kind">UNRESOLVED</span>
        <span className="node-name">{data.label}</span>
      </span>
    </div>
  )
}

const nodeTypes = { procedure: ProcedureNode, table: TableNode, uncertain: UncertainNode }

function makeGraph(result, selectedId) {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 58, marginx: 10, marginy: 10 })

  const reachable = selectedId
    ? new Set([selectedId, ...(result.downstream[selectedId] || [])])
    : null
  const procedures = result.procedures || []
  const proceduresById = new Map(procedures.map((procedure) => [procedure.id, procedure]))
  const nodes = []

  for (const procedure of procedures) {
    graph.setNode(procedure.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    nodes.push({
      id: procedure.id,
      type: 'procedure',
      position: { x: 0, y: 0 },
      data: {
        label: procedure.id.replace(/^dbo\./, ''),
        active: procedure.id === selectedId,
        dimmed: Boolean(reachable && !reachable.has(procedure.id)),
      },
    })
  }

  for (const table of result.tables || []) {
    const nodeId = `table:${table}`
    graph.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT })
    nodes.push({
      id: nodeId,
      type: 'table',
      position: { x: 0, y: 0 },
      data: {
        label: table,
        active: selectedId === table,
        dimmed: Boolean(reachable && !reachable.has(table)),
      },
    })
  }

  const edges = (result.edges || []).map((edge, index) => {
    const source = proceduresById.has(edge.from) ? edge.from : `table:${edge.from}`
    const target = edge.confidence === 'uncertain' ? `uncertain:${edge.to}` : proceduresById.has(edge.to) ? edge.to : `table:${edge.to}`
    if (edge.confidence === 'uncertain' && !graph.hasNode(target)) {
      graph.setNode(target, { width: NODE_WIDTH, height: NODE_HEIGHT })
      nodes.push({
        id: target,
        type: 'uncertain',
        position: { x: 0, y: 0 },
        data: {
          label: edge.to,
          active: selectedId === edge.to,
          dimmed: Boolean(reachable && !reachable.has(edge.to)),
        },
      })
    }
    graph.setEdge(source, target)
    const highlighted = Boolean(reachable && reachable.has(edge.from) && reachable.has(edge.to))
    const edgeColor = highlighted
      ? '#087b62'
      : edge.confidence === 'uncertain'
        ? '#bd6a3d'
        : edge.type === 'read'
          ? '#487f78'
          : '#708078'
    return {
      id: `edge-${index}`,
      source,
      target,
      label: edge.type === 'read' ? 'reads' : edge.type === 'write' ? 'writes' : 'uncertain',
      type: 'smoothstep',
      animated: edge.confidence === 'uncertain',
      style: {
        stroke: edgeColor,
        strokeWidth: highlighted ? 3 : 1.8,
        strokeDasharray: edge.confidence === 'uncertain' ? '6 5' : undefined,
        opacity: reachable && !highlighted ? 0.35 : 1,
      },
      labelStyle: { fill: highlighted ? '#075c4a' : '#58645e', fontSize: 12, fontWeight: 700 },
      labelBgStyle: { fill: '#f4f6f3', fillOpacity: 0.95 },
      markerEnd: { type: 'arrowclosed', color: edgeColor },
    }
  })

  dagre.layout(graph)
  for (const node of nodes) {
    const point = graph.node(node.id)
    node.position = { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 }
  }
  return { nodes, edges }
}

function publicNodeId(node) {
  if (node.type === 'table') return node.id.slice('table:'.length)
  if (node.type === 'uncertain') return node.id.slice('uncertain:'.length)
  return node.id
}

function GraphCanvas({ graph, result, selectedId, onNodeSelect }) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!selectedId) return
    const highlightedIds = new Set([selectedId, ...(result.downstream[selectedId] || [])])
    const highlightedNodes = graph.nodes
      .filter((node) => highlightedIds.has(publicNodeId(node)))
      .map(({ id }) => ({ id }))
    if (highlightedNodes.length) {
      fitView({
        nodes: highlightedNodes,
        padding: 0.12,
        duration: 450,
        minZoom: 0.45,
        maxZoom: 1.45,
      })
    }
  }, [fitView, graph.nodes, result.downstream, selectedId])

  return (
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onNodeSelect(
        node.type === 'table'
          ? node.id.slice('table:'.length)
          : node.type === 'uncertain'
            ? node.id.slice('uncertain:'.length)
            : node.id,
      )}
      fitView
      fitViewOptions={{ padding: 0.04, minZoom: 0.45, maxZoom: 1.1 }}
      minZoom={0.25}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background color="#dce2dc" gap={22} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

function App() {
  const [result, setResult] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadSample() {
      setLoading(true)
      setError('')
      try {
        const sampleResponse = await fetch(`${API_URL}/sample`)
        if (!sampleResponse.ok) {
          const failure = await sampleResponse.json()
          throw new Error(failure.detail || 'Could not load the bundled sample project.')
        }
        const sample = await sampleResponse.json()
        const analysisResponse = await fetch(`${API_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sample, source: 'sample' }),
        })
        if (!analysisResponse.ok) {
          const failure = await analysisResponse.json()
          throw new Error(failure.detail || 'The SQL analysis request did not complete.')
        }
        const analysis = await analysisResponse.json()
        if (!cancelled) {
          setResult(analysis)
          setSelectedId('dbo.load_invoices')
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'PipeLens could not connect to the backend.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadSample()
    return () => { cancelled = true }
  }, [])

  const graph = useMemo(
    () => result ? makeGraph(result, selectedId) : { nodes: [], edges: [] },
    [result, selectedId],
  )
  const procedure = result?.procedures.find((item) => item.id === selectedId)
  const uncertainSelection = Boolean(
    selectedId && result?.edges.some((edge) => edge.confidence === 'uncertain' && edge.to === selectedId),
  )
  const selectedLabel = uncertainSelection ? 'Unresolved dynamic dependency' : selectedId
  const downstream = selectedId ? result?.downstream[selectedId] || [] : []
  const procedureCount = result?.procedures.length || 0
  const tableCount = result?.tables.length || 0
  const uncertainCount = result?.edges.filter((edge) => edge.confidence === 'uncertain').length || 0

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PipeLens home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">PipeLens</span>
        </a>
        <div className="project-meta">
          <span className="live-dot" />
          <span>RETAIL BILLING</span>
          <span className="meta-divider" />
          <span>LOCAL SAMPLE</span>
        </div>
        <div className="topbar-right">
          <span className="status-label"><span className="status-check">✓</span> Parser connected</span>
        </div>
      </header>

      <section className="workspace" id="top">
        <div className="main-column">
          <div className="page-heading">
            <div>
              <p className="eyebrow">PIPELINE EXPLORER <span> / </span> OVERVIEW</p>
              <h1>See how the data moves.</h1>
              <p className="heading-subtitle">Follow a procedure to understand what it reads, changes, and affects next.</p>
            </div>
            <div className="pipeline-counts" aria-label="Pipeline inventory">
              <div><strong>{procedureCount.toString().padStart(2, '0')}</strong><span>procedures</span></div>
              <i />
              <div><strong>{tableCount.toString().padStart(2, '0')}</strong><span>tables</span></div>
            </div>
          </div>

          <div className="graph-toolbar">
            <div className="graph-title"><span className="grid-icon" aria-hidden="true">▦</span><strong>Dependency map</strong><span className="toolbar-divider" /><span>{procedureCount + tableCount} objects</span></div>
            <div className="graph-toolbar-right">
              {result?.accuracy && (
                <span
                  className="accuracy-badge"
                  title={`${result.accuracy.matched} of ${result.accuracy.expected} expected relationships matched; precision ${(result.accuracy.precision * 100).toFixed(0)}%, recall ${(result.accuracy.recall * 100).toFixed(0)}%.`}
                >
                  <span>GROUND TRUTH</span>
                  <strong>F1 {(result.accuracy.f1 * 100).toFixed(0)}%</strong>
                </span>
              )}
              <span className="layout-tag"><span className="layout-arrow">→</span> LEFT TO RIGHT</span>
            </div>
          </div>

          <div className="graph-frame" aria-label="SQL dependency graph">
            {loading && <div className="graph-state"><span className="loader" />Loading sample pipeline…</div>}
            {!loading && error && (
              <div className="graph-state error-state">
                <strong>Couldn’t load the pipeline</strong>
                <span>{error}</span>
                <span className="error-hint">Start the backend at http://127.0.0.1:8000, then refresh.</span>
              </div>
            )}
            {!loading && result && (
              <ReactFlowProvider>
                <GraphCanvas
                  graph={graph}
                  result={result}
                  selectedId={selectedId}
                  onNodeSelect={setSelectedId}
                />
              </ReactFlowProvider>
            )}
          </div>

          <div className="legend-bar">
            <div className="legend-items">
              <span className="legend-label">LEGEND</span>
              <span className="legend-item"><i className="legend-procedure">P</i> Procedure</span>
              <span className="legend-item"><i className="legend-table">T</i> Table</span>
              <span className="legend-separator" />
              <span className="legend-item"><i className="edge-swatch read-swatch" /> Reads</span>
              <span className="legend-item"><i className="edge-swatch write-swatch" /> Writes</span>
              <span className="legend-item"><i className="edge-swatch uncertain-swatch" /> Uncertain</span>
            </div>
            <span className="uncertain-note">{uncertainCount} uncertain {uncertainCount === 1 ? 'edge' : 'edges'}</span>
          </div>
        </div>

        <aside className="detail-panel" aria-label="Selection details">
          <div className="panel-heading">
            <span className="panel-kicker">SELECTION</span>
          </div>
          {selectedId && result ? (
            <>
              <div className="selected-entity">
                <span className={`selection-glyph ${procedure ? 'selection-procedure' : uncertainSelection ? 'selection-uncertain' : 'selection-table'}`}>{procedure ? 'P' : uncertainSelection ? '?' : 'T'}</span>
                <div>
                  <span className="selection-kind">{procedure ? 'PROCEDURE' : uncertainSelection ? 'UNRESOLVED' : 'TABLE'}</span>
                  <h2>{selectedLabel?.replace(/^dbo\./, '')}</h2>
                  {procedure && <span className="file-label">{procedure.file}</span>}
                </div>
              </div>

              <section className="detail-section">
                <div className="section-heading"><h3>Downstream impact</h3><span className="count-pill">{downstream.length}</span></div>
                <p className="section-helper">
                  {uncertainSelection
                    ? 'Objects reachable from this unresolved dependency.'
                    : `Reachable objects if this ${procedure ? 'procedure runs' : 'table changes'}.`}
                </p>
                <div className="impact-list">
                  {downstream.length ? downstream.map((item) => {
                    const table = result.tables.includes(item)
                    return (
                      <button
                        className="impact-row"
                        key={item}
                        onClick={() => setSelectedId(table ? `table:${item}` : item)}
                      >
                        <span className={`impact-glyph ${table ? 'mini-table' : 'mini-procedure'}`}>{table ? 'T' : 'P'}</span>
                        <span>{item.replace(/^dbo\./, '')}</span>
                        <span className="impact-arrow" aria-hidden="true">↗</span>
                      </button>
                    )
                  }) : <p className="empty-impact">Nothing downstream from this selection.</p>}
                </div>
              </section>

              {procedure && (
                <section className="detail-section io-section">
                  <div className="section-heading"><h3>Data touched</h3></div>
                  <div className="io-group">
                    <span className="io-label">READS</span>
                    {procedure.reads.length ? procedure.reads.map((table) => <span className="io-table" key={table}>{table}</span>) : <span className="io-empty">No parsed reads</span>}
                  </div>
                  <div className="io-group">
                    <span className="io-label">WRITES</span>
                    {procedure.writes.length ? procedure.writes.map((table) => <span className="io-table" key={table}>{table}</span>) : <span className="io-empty">No parsed writes</span>}
                  </div>
                </section>
              )}

              {procedure && (
                <>
                  {procedure.summary ? (
                    <section className="detail-section explanation-section">
                      <div className="section-heading">
                        <h3>What this procedure does</h3>
                        <span className="ai-insights-label">
                          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M8 1.5 9.65 6.35 14.5 8l-4.85 1.65L8 14.5 6.35 9.65 1.5 8l4.85-1.65L8 1.5Z" />
                            <path d="m12.5 1 .55 1.45L14.5 3l-1.45.55L12.5 5l-.55-1.45L10.5 3l1.45-.55L12.5 1Z" />
                          </svg>
                          AI INSIGHTS
                        </span>
                      </div>
                      <p className="procedure-summary">{procedure.summary}</p>
                      <h4>Steps</h4>
                      <ol className="procedure-steps">
                        {procedure.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
                      </ol>
                    </section>
                  ) : (
                    <div className="explanation-error">
                      <strong>Procedure guide not ready</strong>
                      <p>{result.explanation_error || 'The cached Gemini guide is not available for this procedure.'}</p>
                    </div>
                  )}
                  <section className="detail-section risks-section">
                    <div className="section-heading"><h3>Detected risks</h3><span className="count-pill">{procedure.risks.length}</span></div>
                    {procedure.risks.length ? (
                      <div className="risk-list">
                        {procedure.risks.map((risk) => (
                          <article className={`risk-card risk-${risk.severity}`} key={risk.code}>
                            <div className="risk-heading">
                              <span className={`risk-severity severity-${risk.severity}`}>{risk.severity}</span>
                              <strong>{risk.title}</strong>
                            </div>
                            <p>{risk.detail}</p>
                          </article>
                        ))}
                      </div>
                    ) : <p className="empty-impact">No configured risk patterns detected.</p>}
                  </section>
                  {procedure.uncertain_edges?.length > 0 && (
                    <div className="uncertain-callout"><strong>Unresolved dynamic SQL</strong><p>This procedure builds a dependency at runtime. The parser flags it as uncertain instead of guessing.</p></div>
                  )}
                </>
              )}
              {uncertainSelection && (
                <div className="uncertain-callout"><strong>Unresolved dependency</strong><p>The parser could not identify the referenced object from dynamic SQL, so this connection is shown as uncertain.</p></div>
              )}
            </>
          ) : (
            <div className="selection-empty"><span className="empty-crosshair">◎</span><strong>Select a node</strong><p>Choose a procedure or table to inspect its downstream impact.</p></div>
          )}
          <div className="panel-footnote"><span className="deterministic-mark">✓</span> Impact is calculated from parsed dependencies.</div>
        </aside>
      </section>

      <footer className="app-footer"><span>PIPELENS <i>·</i> SQL DEPENDENCY EXPLORER</span><span>LOCAL ANALYSIS <i>·</i> NO MODEL CALLS</span></footer>
    </main>
  )
}

export default App