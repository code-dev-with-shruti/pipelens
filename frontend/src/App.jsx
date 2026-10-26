import { useEffect, useMemo, useRef, useState } from 'react'
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
const MAX_UPLOAD_BATCH = 15
const MAX_SQL_CHARACTERS = 20_000

async function requestAnalysis(files, source, onBackendResponse) {
  let response
  try {
    response = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        files: files.map(({ name, sql, isSample }) => ({
          name,
          sql,
          use_cached_explanation: Boolean(isSample),
        })),
      }),
    })
  } catch (error) {
    onBackendResponse(false)
    throw error
  }
  onBackendResponse(true)
  if (!response.ok) {
    onBackendResponse(false)
    const failure = await response.json()
    throw new Error(failure.detail || 'The SQL analysis request did not complete.')
  }
  return response.json()
}

async function requestExplanations(files, onBackendResponse) {
  let response
  try {
    response = await fetch(`${API_URL}/explanations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: files.map(({ name, sql }) => ({ name, sql })),
      }),
    })
  } catch (error) {
    onBackendResponse(false)
    throw error
  }
  onBackendResponse(true)
  if (!response.ok) {
    onBackendResponse(false)
    const failure = await response.json()
    throw new Error(failure.detail || 'AI insights could not be generated.')
  }
  return response.json()
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function mermaidEscape(value) {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('"', "'")
    .replaceAll('[', '(')
    .replaceAll(']', ')')
    .replaceAll('|', '/')
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function firstSentence(summary) {
  const sentence = String(summary || '').trim().match(/^.*?[.!?](?=\s|$)/)
  return sentence ? sentence[0] : String(summary || '').trim()
}

function deterministicProcedureCaption(procedure) {
  const reads = procedure.reads?.length || 0
  const writes = procedure.writes?.length || 0
  return `Reads ${reads} ${reads === 1 ? 'table' : 'tables'}, writes ${writes} ${writes === 1 ? 'table' : 'tables'}.`
}

function procedureCaption(procedure) {
  const purpose = procedure.summary
    ? firstSentence(procedure.summary)
    : deterministicProcedureCaption(procedure)
  const usesDynamicSql = procedure.has_dynamic_sql
    || procedure.uncertain_edges?.length > 0
  return usesDynamicSql
    ? `${purpose} Uses dynamic SQL, so some dependencies are unknown.`
    : purpose
}

function tableCaptions(result) {
  const captions = new Map()
  for (const table of result.tables || []) {
    const writers = [...new Set((result.edges || [])
      .filter((edge) => edge.type === 'write' && edge.to === table)
      .map((edge) => edge.from))].sort()
    const readers = [...new Set((result.edges || [])
      .filter((edge) => edge.type === 'read' && edge.from === table)
      .map((edge) => edge.to))].sort()
    const writerCaption = writers.length
      ? `Written by ${writers.join(', ')}.`
      : 'Source table: not written by any procedure.'
    const readerCaption = readers.length
      ? `Read by ${readers.join(', ')}.`
      : 'Not read by any procedure.'
    captions.set(table, `${writerCaption} ${readerCaption}`)
  }
  return captions
}

function dependencyGraphSvg(result, selectedId) {
  const { nodes, edges } = makeGraph(result, null)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const procedureIds = new Set(result.procedure_nodes || result.procedures.map((item) => item.id))
  const tableIds = new Set(result.tables || [])
  const proceduresById = new Map(result.procedures.map((procedure) => [procedure.id, procedure]))
  const captionsByTable = tableCaptions(result)
  const downstream = selectedId ? result.downstream?.[selectedId] || [] : []
  const highlightedIds = new Set(selectedId ? [selectedId, ...downstream] : [])
  const nodePublicId = (node) => publicNodeId(node)
  const left = Math.min(...nodes.map((node) => node.position.x))
  const top = Math.min(...nodes.map((node) => node.position.y))
  const right = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH))
  const bottom = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT))
  const padding = 44
  const legendHeight = 54
  const width = Math.max(right - left + padding * 2, 6 * 138 + padding * 2)
  const height = bottom - top + padding * 2 + legendHeight
  const offsetX = padding - left
  const offsetY = padding - top
  const colors = {
    read: '#487f78',
    write: '#708078',
    call: '#718c42',
    uncertain: '#bd6a3d',
    accent: '#087b62',
  }

  const markerDefs = edges.map((edge, index) => {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    const sourceRelevant = source && highlightedIds.has(nodePublicId(source))
    const targetRelevant = target && highlightedIds.has(nodePublicId(target))
    const color = sourceRelevant && targetRelevant ? colors.accent : colors[edge.data.edgeType]
    return `<marker id="arrow-${index}" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L9 4 L0 8 Z" fill="${color}"/></marker>`
  }).join('')

  const edgeMarkup = edges.map((edge, index) => {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return ''
    const sourcePublicId = nodePublicId(source)
    const targetPublicId = nodePublicId(target)
    const highlighted = highlightedIds.has(sourcePublicId) && highlightedIds.has(targetPublicId)
    const color = highlighted ? colors.accent : colors[edge.data.edgeType]
    const x1 = source.position.x + NODE_WIDTH + offsetX
    const y1 = source.position.y + NODE_HEIGHT / 2 + offsetY
    const x2 = target.position.x + offsetX
    const y2 = target.position.y + NODE_HEIGHT / 2 + offsetY
    const control = Math.max(36, (x2 - x1) / 2)
    const label = edge.label
    return `<g><path d="M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${highlighted ? 3 : 1.8}"${edge.data.dashed ? ' stroke-dasharray="7 5"' : ''} marker-end="url(#arrow-${index})"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" class="edge-label">${xmlEscape(label)}</text></g>`
  }).join('')

  const nodeMarkup = nodes.map((node) => {
    const x = node.position.x + offsetX
    const y = node.position.y + offsetY
    const publicId = nodePublicId(node)
    const highlighted = highlightedIds.has(publicId)
    const selected = selectedId === publicId
    const type = node.type === 'procedure' ? 'PROCEDURE' : node.type === 'table' ? 'TABLE' : 'UNRESOLVED'
    const fill = node.type === 'procedure' ? '#fbfdfb' : node.type === 'table' ? '#f5f9f6' : '#fff8f3'
    const stroke = highlighted ? colors.accent : node.type === 'uncertain' ? colors.uncertain : '#d1ded4'
    const lines = String(node.data.label).match(/.{1,25}/g) || [String(node.data.label)]
    const labelMarkup = lines.slice(0, 2).map((line, index) => (
      `<tspan x="${x + 50}" dy="${index === 0 ? 0 : 17}">${xmlEscape(line.trim())}</tspan>`
    )).join('')
    const caption = node.type === 'procedure'
      ? procedureCaption(proceduresById.get(publicId) || { reads: [], writes: [] })
      : node.type === 'table' ? captionsByTable.get(publicId) : node.data.label
    return `<g><title>${xmlEscape(caption || `${type}: ${node.data.label}`)}</title><rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${selected ? 3.5 : highlighted ? 2.6 : 1.4}"/><circle cx="${x + 25}" cy="${y + 42}" r="13" fill="${node.type === 'procedure' ? '#e5f1eb' : node.type === 'table' ? '#edf2e8' : '#fbf0e8'}"/><text x="${x + 25}" y="${y + 46}" text-anchor="middle" class="node-symbol">${node.type === 'procedure' ? 'P' : node.type === 'table' ? 'T' : '?'}</text><text x="${x + 50}" y="${y + 30}" class="node-kind">${type}</text><text x="${x + 50}" y="${y + 50}" class="node-label">${labelMarkup}</text></g>`
  }).join('')

  const legendY = bottom + offsetY + 27
  const legendMarkup = [
    ['Procedure', '#fbfdfb', '#d1ded4'],
    ['Table', '#f5f9f6', '#d1ded4'],
    ['Reads', 'none', colors.read],
    ['Writes', 'none', colors.write],
    ['Calls', 'none', colors.call],
    ['Uncertain', 'none', colors.uncertain],
  ].map(([label, fill, stroke], index) => {
    const x = padding + index * 138
    const symbol = fill === 'none'
      ? `<line x1="${x}" y1="${legendY}" x2="${x + 22}" y2="${legendY}" stroke="${stroke}" stroke-width="2"${label === 'Uncertain' ? ' stroke-dasharray="5 4"' : ''}/>`
      : `<rect x="${x}" y="${legendY - 8}" width="19" height="16" rx="3" fill="${fill}" stroke="${stroke}"/>`
    return `${symbol}<text x="${x + 27}" y="${legendY + 4}" class="legend-label">${label}</text>`
  }).join('')

  const mermaidIds = new Map(nodes.map((node, index) => [node.id, `N${index}`]))
  const mermaidNodes = nodes.map((node) => (
    `${mermaidIds.get(node.id)}["${mermaidEscape(`${node.type}: ${node.data.label}`)}"]`
  ))
  const mermaidEdges = edges.map((edge) => {
    const label = edge.label
    const connector = edge.data.dashed ? '-.->' : '-->'
    return `${mermaidIds.get(edge.source)} ${connector}|${mermaidEscape(label)}| ${mermaidIds.get(edge.target)}`
  })
  const defs = `<defs>${markerDefs}</defs>`
  const style = `<style>.node-kind{font:500 8px Arial,sans-serif;fill:#849088;letter-spacing:1px}.node-label{font:600 12px Arial,sans-serif;fill:#26362e}.node-symbol{font:700 12px Arial,sans-serif;fill:#35634e}.edge-label{font:600 10px Arial,sans-serif;fill:#536259;paint-order:stroke;stroke:#f8faf7;stroke-width:4px;stroke-linejoin:round}.legend-label{font:10px Arial,sans-serif;fill:#536259}</style>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Full SQL dependency graph">${defs}${style}<rect width="100%" height="100%" fill="#f8faf7"/>${edgeMarkup}${nodeMarkup}<line x1="${padding}" y1="${legendY + 21}" x2="${width - padding}" y2="${legendY + 21}" stroke="#dfe5df"/>${legendMarkup}</svg>`
  return { svg, mermaidNodes, mermaidEdges, procedureIds, tableIds }
}

function downloadOnboardingMarkdown(result, selectedId) {
  if (!result) return
  const procedures = result.procedures || []
  const { svg, mermaidNodes, mermaidEdges, procedureIds, tableIds } = dependencyGraphSvg(result, selectedId)
  const riskLevels = ['high', 'medium', 'low']
  const downstreamFor = (procedureId) => result.downstream?.[procedureId] || []
  const startProcedure = [...procedures].sort((left, right) => (
    downstreamFor(right.id).length - downstreamFor(left.id).length || left.id.localeCompare(right.id)
  ))[0]
  const startImpact = startProcedure ? downstreamFor(startProcedure.id) : []
  const captionsByTable = tableCaptions(result)
  const lines = [
    '# Pipeline onboarding overview',
    '',
    `- Procedures: ${procedures.length}`,
    `- Tables: ${(result.tables || []).length}`,
    `- Uncertain edges: ${(result.edges || []).filter((edge) => edge.confidence === 'uncertain').length}`,
    '',
    '## Risk summary',
    '',
    '| Severity | Count | Affected procedures |',
    '|---|---:|---|',
    ...riskLevels.map((severity) => {
      const affected = procedures.filter((procedure) => (
        procedure.risks.some((risk) => risk.severity === severity)
      ))
      const count = procedures.reduce(
        (total, procedure) => total + procedure.risks.filter((risk) => risk.severity === severity).length,
        0,
      )
      return `| ${severity.toUpperCase()} | ${count} | ${affected.length ? affected.map((item) => `\`${item.id}\``).join(', ') : 'None'} |`
    }),
    '',
    startProcedure
      ? `**Start here:** \`${startProcedure.id}\` has the largest downstream impact (${startImpact.filter((id) => procedureIds.has(id)).length} procedures and ${startImpact.filter((id) => tableIds.has(id)).length} tables).`
      : '**Start here:** No procedures are loaded.',
    '',
    '## Uncertain dependency',
    '',
    ...(result.edges.some((edge) => edge.confidence === 'uncertain')
      ? [...new Set(result.edges.filter((edge) => edge.confidence === 'uncertain').map((edge) => edge.from))]
        .map((id) => `\`${id}\` uses dynamic SQL, so its runtime target cannot be resolved statically and is shown as an unknown dependency.`)
      : ['No uncertain dependencies were detected.']),
    '',
  ]

  lines.push(
    '## Object index',
    '',
    '| Table | Caption |',
    '|---|---|',
    ...(result.tables || []).map((table) => `| \`${table}\` | ${captionsByTable.get(table)} |`),
    '',
    '## Procedures',
    '',
  )

  for (const procedure of procedures) {
    const downstream = downstreamFor(procedure.id)
    const downstreamProcedures = downstream.filter((id) => procedureIds.has(id))
    const downstreamTables = downstream.filter((id) => tableIds.has(id))
    lines.push(
      `### ${procedure.id}`,
      '',
      `**Purpose:** ${procedureCaption(procedure)}`,
      '',
      `**Summary:** ${procedure.summary || 'AI summary is unavailable.'}`,
      '',
      `**If this fails:** Blocks ${downstreamProcedures.length} ${downstreamProcedures.length === 1 ? 'procedure' : 'procedures'} and ${downstreamTables.length} ${downstreamTables.length === 1 ? 'table' : 'tables'}.`,
      '',
      '**Steps:**',
      ...(procedure.steps?.length
        ? procedure.steps.map((step, index) => `${index + 1}. ${step}`)
        : ['1. No steps available.']),
      '',
      '**Reads:**',
      ...(procedure.reads?.length ? procedure.reads.map((table) => `- ${table}`) : ['- None']),
      '',
      '**Writes:**',
      ...(procedure.writes?.length ? procedure.writes.map((table) => `- ${table}`) : ['- None']),
      '',
      '**Detected risks:**',
      ...(procedure.risks?.length
        ? procedure.risks.map((risk) => `- **${risk.severity.toUpperCase()} — ${risk.title}:** ${risk.detail}`)
        : ['- None detected.']),
      '',
      '**Downstream procedures:**',
      ...(downstreamProcedures.length ? downstreamProcedures.map((item) => `- ${item}`) : ['- None']),
      '',
      '**Downstream tables:**',
      ...(downstreamTables.length ? downstreamTables.map((item) => `- ${item}`) : ['- None']),
      '',
    )
  }

  lines.push(
    '## Dependency graph',
    '',
    '```mermaid',
    'flowchart LR',
    ...mermaidNodes.map((line) => `  ${line}`),
    ...mermaidEdges.map((line) => `  ${line}`),
    '```',
    '',
  )
  downloadBlob('pipelens-onboarding.md', new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }))
  downloadBlob('pipelens-dependency-graph.svg', new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
}

function ProcedureNode({ data }) {
  return (
    <div className={`graph-node procedure-node ${data.active ? 'is-active' : ''} ${data.dimmed ? 'is-dimmed' : ''}`} title={data.caption}>
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
    <div className={`graph-node table-node ${data.active ? 'is-active' : ''} ${data.dimmed ? 'is-dimmed' : ''}`} title={data.caption}>
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
  const captionsByTable = tableCaptions(result)
  const procedureNodeIds = new Set(
    result.procedure_nodes
      || [...procedures.map((procedure) => procedure.id), ...(result.edges || [])
        .filter((edge) => edge.type === 'call')
        .map((edge) => edge.to)],
  )
  const nodes = []

  for (const procedure of procedures) {
    const caption = procedureCaption(procedure)
    graph.setNode(procedure.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    nodes.push({
      id: procedure.id,
      type: 'procedure',
      position: { x: 0, y: 0 },
      data: {
        label: procedure.id.replace(/^dbo\./, ''),
        caption,
        active: procedure.id === selectedId,
        dimmed: Boolean(reachable && !reachable.has(procedure.id)),
      },
    })
  }

  for (const procedureId of procedureNodeIds) {
    if (proceduresById.has(procedureId)) continue
    graph.setNode(procedureId, { width: NODE_WIDTH, height: NODE_HEIGHT })
    nodes.push({
      id: procedureId,
      type: 'procedure',
      position: { x: 0, y: 0 },
      data: {
        label: procedureId.replace(/^dbo\./, ''),
        caption: `Reads 0 tables, writes 0 tables.`,
        active: procedureId === selectedId,
        dimmed: Boolean(reachable && !reachable.has(procedureId)),
      },
    })
  }

  for (const table of result.tables || []) {
    const nodeId = `table:${table}`
    const caption = captionsByTable.get(table) || ''
    graph.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT })
    nodes.push({
      id: nodeId,
      type: 'table',
      position: { x: 0, y: 0 },
      data: {
        label: table,
        caption,
        active: selectedId === table,
        dimmed: Boolean(reachable && !reachable.has(table)),
      },
    })
  }

  const edges = (result.edges || []).map((edge, index) => {
    const source = procedureNodeIds.has(edge.from) ? edge.from : `table:${edge.from}`
    const target = edge.confidence === 'uncertain'
      ? `uncertain:${edge.to}`
      : procedureNodeIds.has(edge.to)
        ? edge.to
        : `table:${edge.to}`
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
          : edge.type === 'call'
            ? '#718c42'
          : '#708078'
    return {
      id: `edge-${index}`,
      source,
      target,
      label: edge.type === 'read'
        ? 'reads'
        : edge.type === 'write'
          ? 'writes'
          : edge.type === 'call'
            ? 'calls'
            : 'uncertain',
      type: 'smoothstep',
      animated: edge.confidence === 'uncertain',
      data: { edgeType: edge.confidence === 'uncertain' ? 'uncertain' : edge.type, dashed: edge.confidence === 'uncertain' },
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
  const [workingFiles, setWorkingFiles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [backendReachable, setBackendReachable] = useState(true)
  const [fileIssues, setFileIssues] = useState([])
  const [fileNotices, setFileNotices] = useState([])
  const analysisSequence = useRef(0)

  async function analyzeFileSet(
    files,
    source = 'upload',
    defaultSelection = null,
    initialNotices = [],
    initialIssues = [],
  ) {
    const sequence = ++analysisSequence.current
    setLoading(true)
    setError('')
    try {
      const analysis = await requestAnalysis(files, source, setBackendReachable)
      if (sequence !== analysisSequence.current) return false
      const invalidNames = new Set((analysis.file_errors || []).map((item) => item.name))
      setWorkingFiles(files.filter((file) => !invalidNames.has(file.name)))
      setResult(analysis)
      if (analysis.explanation_pending?.length) {
        const pending = new Set(analysis.explanation_pending)
        const pendingFiles = analysis.procedures
          .filter((procedure) => pending.has(procedure.id))
          .map((procedure) => files.find((file) => !file.isSample && file.name === procedure.file))
          .filter(Boolean)
        void requestExplanations(pendingFiles, setBackendReachable)
          .then(({ procedures: generated }) => {
            if (sequence !== analysisSequence.current) return
            setResult((current) => current && ({
              ...current,
              procedures: current.procedures.map((procedure) => (
                generated[procedure.id]
                  ? { ...procedure, ...generated[procedure.id] }
                  : procedure
              )),
              explanation_pending: [],
            }))
          })
          .catch((explanationError) => {
            if (sequence !== analysisSequence.current) return
            setResult((current) => current && ({
              ...current,
              explanation_pending: [],
              explanation_error: explanationError.message || 'AI insights could not be generated.',
            }))
          })
      }
      setFileIssues([...initialIssues, ...(analysis.file_errors || [])])
      setFileNotices([...initialNotices, ...(analysis.warnings || [])])
      setSelectedId((current) => {
        if (current && Object.hasOwn(analysis.downstream, current)) return current
        return defaultSelection && Object.hasOwn(analysis.downstream, defaultSelection)
          ? defaultSelection
          : null
      })
      return true
    } catch (requestError) {
      if (sequence === analysisSequence.current) {
        setBackendReachable(false)
        setError(requestError.message || 'PipeLens could not connect to the backend.')
      }
      return false
    } finally {
      if (sequence === analysisSequence.current) setLoading(false)
    }
  }

  async function loadSample() {
    const sequence = ++analysisSequence.current
    setLoading(true)
    setError('')
    setFileIssues([])
    setFileNotices([])
    try {
      let response
      try {
        response = await fetch(`${API_URL}/sample`)
      } catch (requestError) {
        setBackendReachable(false)
        throw requestError
      }
      setBackendReachable(true)
      if (!response.ok) {
        setBackendReachable(false)
        const failure = await response.json()
        throw new Error(failure.detail || 'Could not load the bundled sample project.')
      }
      const sample = await response.json()
      const sampleFiles = sample.files.map((file) => ({ ...file, isSample: true }))
      const analysis = await requestAnalysis(sampleFiles, 'sample', setBackendReachable)
      if (sequence !== analysisSequence.current) return
      setWorkingFiles(sampleFiles)
      setResult(analysis)
      setSelectedId('dbo.load_invoices')
      setFileIssues(analysis.file_errors || [])
      setFileNotices(analysis.warnings || [])
    } catch (requestError) {
      if (sequence === analysisSequence.current) {
        setBackendReachable(false)
        setError(requestError.message || 'PipeLens could not connect to the backend.')
      }
    } finally {
      if (sequence === analysisSequence.current) setLoading(false)
    }
  }

  async function handleUpload(event) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return
    setLoading(true)
    setError('')

    const issues = []
    const notices = []
    const acceptedFiles = []
    for (const [index, file] of selectedFiles.entries()) {
      if (index >= MAX_UPLOAD_BATCH) {
        issues.push({ name: file.name, message: `Select no more than ${MAX_UPLOAD_BATCH} files at a time.` })
        continue
      }
      if (!file.name.toLowerCase().endsWith('.sql')) {
        issues.push({ name: file.name, message: 'Only .sql files are supported.' })
        continue
      }
      try {
        const sql = await file.text()
        if (!sql.trim()) {
          issues.push({ name: file.name, message: 'The file is empty.' })
          continue
        }
        if (sql.length > MAX_SQL_CHARACTERS) {
          issues.push({ name: file.name, message: 'The file exceeds the 20,000-character limit.' })
          continue
        }
        if (!/(?:CREATE(?:\s+OR\s+ALTER)?|ALTER)\s+PROCEDURE\b/i.test(sql)) {
          issues.push({ name: file.name, message: 'No supported stored procedure declaration was found.' })
          continue
        }
        acceptedFiles.push({ name: file.name, sql, isSample: false })
      } catch {
        issues.push({ name: file.name, message: 'This file could not be read.' })
      }
    }

    const mergedFiles = new Map(workingFiles.map((file) => [file.name, file]))
    for (const file of acceptedFiles) {
      if (mergedFiles.has(file.name)) {
        notices.push(`${file.name} replaced the file with the same name in this analysis.`)
        mergedFiles.delete(file.name)
      }
      mergedFiles.set(file.name, file)
    }
    if (acceptedFiles.length) {
      await analyzeFileSet(Array.from(mergedFiles.values()), 'upload', null, notices, issues)
    } else {
      setFileIssues(issues)
      setFileNotices(notices)
      setLoading(false)
    }
  }

  async function removeWorkingFile(name) {
    const remainingFiles = workingFiles.filter((file) => file.name !== name)
    setFileIssues([])
    const notice = `${name} was removed from this analysis only; the file on disk was not changed.`
    if (remainingFiles.length) {
      await analyzeFileSet(remainingFiles, 'upload', null, [notice])
    } else {
      analysisSequence.current += 1
      setWorkingFiles([])
      setResult(null)
      setSelectedId(null)
      setFileNotices([notice])
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSample()
  }, [])

  const graph = useMemo(
    () => result ? makeGraph(result, selectedId) : { nodes: [], edges: [] },
    [result, selectedId],
  )
  const procedure = result?.procedures.find((item) => item.id === selectedId)
  const selectedCaption = procedure
    ? procedureCaption(procedure)
    : result?.tables.includes(selectedId)
      ? tableCaptions(result).get(selectedId)
      : null
  const uncertainSelection = Boolean(
    selectedId && result?.edges.some((edge) => edge.confidence === 'uncertain' && edge.to === selectedId),
  )
  const selectedLabel = uncertainSelection ? 'Unresolved dynamic dependency' : selectedId
  const downstream = selectedId ? result?.downstream[selectedId] || [] : []
  const procedureCount = result?.procedures.length || 0
  const tableCount = result?.tables.length || 0
  const uncertainCount = result?.edges.filter((edge) => edge.confidence === 'uncertain').length || 0
  const verifiedSample = Boolean(
    result?.accuracy && workingFiles.length === 7 && workingFiles.every((file) => file.isSample),
  )
  const procedureIds = new Set(result?.procedure_nodes || result?.procedures.map((item) => item.id) || [])
  const tableIds = new Set(result?.tables || [])
  const downstreamProcedureCount = downstream.filter((id) => procedureIds.has(id)).length
  const downstreamTableCount = downstream.filter((id) => tableIds.has(id)).length

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PipeLens home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">PipeLens</span>
        </a>
        <div className="project-meta">
          <span className="live-dot" />
          <span>
            {workingFiles.some((file) => file.isSample)
              ? workingFiles.every((file) => file.isSample) ? 'RETAIL BILLING' : 'SAMPLE + UPLOADS'
              : 'CUSTOM ANALYSIS'}
          </span>
          <span className="meta-divider" />
          <span>{workingFiles.length ? 'IN-MEMORY SET' : 'EMPTY ANALYSIS'}</span>
        </div>
        <div className="topbar-right">
          <button
            className="export-button"
            type="button"
            disabled={!workingFiles.length || !result}
            onClick={() => downloadOnboardingMarkdown(result, selectedId)}
          >
            Export
          </button>
          <span
            className={`backend-status${backendReachable === true ? ' is-connected' : backendReachable === false ? ' is-unreachable' : ''}`}
            title={backendReachable === false ? 'Backend unreachable' : 'Parser connected'}
            aria-label={backendReachable === false ? 'Backend unreachable' : 'Parser connected'}
            role="img"
          />
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

          <section className="file-manager" aria-label="Files in this analysis">
            <div className="files-toolbar">
              <div className="files-heading">
                <strong>Files in this analysis</strong>
                <span>{workingFiles.length} {workingFiles.length === 1 ? 'file' : 'files'}</span>
              </div>
              <div className="file-actions">
                <label className={`file-action${loading ? ' is-disabled' : ''}`}>
                  Add SQL files
                  <input
                    type="file"
                    accept=".sql"
                    multiple
                    disabled={loading}
                    onChange={handleUpload}
                    aria-label="Add SQL files to this analysis"
                  />
                </label>
                <button className="reset-action" type="button" onClick={loadSample} disabled={loading}>
                  Reset to sample
                </button>
              </div>
            </div>
            {workingFiles.length > 0 ? (
              <ul className="working-file-list">
                {workingFiles.map((file) => (
                  <li className="working-file" key={file.name}>
                    <span className="file-name" title={file.name}>{file.name}</span>
                    {file.isSample && <span className="sample-file-tag">SAMPLE</span>}
                    <button
                      className="remove-file"
                      type="button"
                      aria-label={`Remove ${file.name} from this analysis`}
                      title="Remove from this analysis only"
                      disabled={loading}
                      onClick={() => removeWorkingFile(file.name)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="files-empty">No files loaded. Add .sql files or reset to the sample project.</p>
            )}
            {(fileIssues.length > 0 || fileNotices.length > 0) && (
              <div className="file-feedback">
                {fileIssues.map((issue, index) => (
                  <p className="file-feedback-error" key={`issue-${index}`}>
                    <strong>{issue.name}:</strong> {issue.message}
                  </p>
                ))}
                {fileNotices.map((notice, index) => (
                  <p className="file-feedback-notice" key={`notice-${index}`}>{notice}</p>
                ))}
              </div>
            )}
          </section>

          <div className="graph-toolbar">
            <div className="graph-toolbar-main">
              <div className="graph-title"><span className="grid-icon" aria-hidden="true">▦</span><strong>Dependency map</strong><span className="toolbar-divider" /><span>{procedureCount + tableCount} objects</span></div>
              <span className="graph-instructions">Hover for purpose; click for details and downstream impact.</span>
            </div>
            <div className="graph-toolbar-right">
              {verifiedSample && (
                <span
                  className="accuracy-badge"
                  title={`${result.accuracy.matched} of ${result.accuracy.expected} expected relationships matched; precision ${(result.accuracy.precision * 100).toFixed(0)}%, recall ${(result.accuracy.recall * 100).toFixed(0)}%.`}
                >
                  <strong>Verified on sample project: F1 {(result.accuracy.f1 * 100).toFixed(0)}%</strong>
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
            {!loading && !error && workingFiles.length === 0 && (
              <div className="graph-state empty-files-state">
                <strong>No SQL files in this analysis</strong>
                <span>Add supported .sql stored procedures or reset to the sample.</span>
              </div>
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
                  {selectedCaption && <p className="object-caption">{selectedCaption}</p>}
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
                      <strong>
                        {result.explanation_pending?.includes(procedure.id)
                          ? 'AI insights are being generated'
                          : 'AI insights unavailable'}
                      </strong>
                      <p>
                        {result.explanation_error
                          || (result.explanation_pending?.includes(procedure.id)
                            ? 'The graph and detected risks are ready while the procedure summary is generated.'
                            : 'No cached explanation is available for this procedure.')}
                      </p>
                    </div>
                  )}
                  <p className="failure-impact">
                    <strong>If this fails:</strong> Blocks {downstreamProcedureCount} {downstreamProcedureCount === 1 ? 'procedure' : 'procedures'} and {downstreamTableCount} {downstreamTableCount === 1 ? 'table' : 'tables'} downstream.
                  </p>
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

      <footer className="app-footer"><span>PIPELENS <i>·</i> SQL DEPENDENCY EXPLORER</span><span>LOCAL GRAPH <i>·</i> AI ONLY SUMMARIZES</span></footer>
    </main>
  )
}

export default App