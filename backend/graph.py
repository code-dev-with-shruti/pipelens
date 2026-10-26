from typing import Any

import networkx as nx


def build_pipeline_graph(procedures: list[dict[str, Any]]) -> tuple[nx.DiGraph, list[dict[str, str]]]:
    graph = nx.DiGraph()
    edges: list[dict[str, str]] = []

    for procedure in procedures:
        procedure_id = procedure["id"]
        graph.add_node(procedure_id, kind="procedure")

        for table in procedure["reads"]:
            table_id = f"table:{table}"
            graph.add_node(table_id, kind="table", name=table)
            graph.add_edge(table_id, procedure_id, type="read", confidence="parsed")
            edges.append({"from": table, "to": procedure_id, "type": "read", "confidence": "parsed"})

        for table in procedure["writes"]:
            table_id = f"table:{table}"
            graph.add_node(table_id, kind="table", name=table)
            graph.add_edge(procedure_id, table_id, type="write", confidence="parsed")
            edges.append({"from": procedure_id, "to": table, "type": "write", "confidence": "parsed"})

        for called_procedure in procedure.get("called_procedures", []):
            graph.add_node(called_procedure, kind="procedure")
            graph.add_edge(procedure_id, called_procedure, type="call", confidence="parsed")
            edges.append({
                "from": procedure_id,
                "to": called_procedure,
                "type": "call",
                "confidence": "parsed",
            })

        for uncertain_edge in procedure["uncertain_edges"]:
            target = uncertain_edge["to"]
            target_id = f"uncertain:{target}"
            graph.add_node(target_id, kind="uncertain", name=target)
            graph.add_edge(procedure_id, target_id, type="unknown", confidence="uncertain")
            edges.append({
                "from": procedure_id,
                "to": target,
                "type": "unknown",
                "confidence": "uncertain",
            })

    return graph, edges


def downstream_by_node(graph: nx.DiGraph) -> dict[str, list[str]]:
    downstream: dict[str, list[str]] = {}
    for node in sorted(graph.nodes):
        reachable = nx.descendants(graph, node)
        reachable.discard(node)
        public_id = _public_node_id(graph, node)
        downstream[public_id] = sorted(_public_node_id(graph, reachable_node) for reachable_node in reachable)
    return downstream


def _public_node_id(graph: nx.DiGraph, node: str) -> str:
    node_data = graph.nodes[node]
    if node_data["kind"] == "table":
        return node_data["name"]
    if node_data["kind"] == "uncertain":
        return node_data["name"]
    return node