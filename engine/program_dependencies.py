"""Read-only dependency preflight for local UDT, DB, FB, FC and Instance DB drafts.

This is a dependency inventory, not a TIA compilation or import plan.
No Openness adapter calls or program writes occur here.
"""
from __future__ import annotations

from engine.project import ProjectSpecification
from engine.instance_db import InstanceDbSnapshot
from engine.tia.type_registry import is_builtin_type


def _declarations(members, prefix=""):
    for member in members:
        path = prefix + "." + member.name if prefix else member.name
        if member.data_type.casefold() == "struct":
            yield from _declarations(member.struct_members or [], path)
        else:
            declared_type = (member.array_element_type if member.data_type.casefold() == "array"
                             else member.data_type)
            yield path, declared_type


def report_program_dependencies(project: ProjectSpecification) -> dict:
    """Order known dependencies; preserve uncertainty for external TIA objects."""
    udts = {x.name.casefold(): x for x in project.udts}
    fbs = {x.name.casefold(): x for x in project.fbs}
    nodes, edges, unresolved = [], [], []
    unresolved_keys = set()

    def add_unresolved(object_name, reason):
        """Keep the report readable when the same declaration is visited twice."""
        key = (object_name.casefold(), reason)
        if key not in unresolved_keys:
            unresolved_keys.add(key)
            unresolved.append({"object": object_name, "reason": reason})
    for kind, objects in (("UDT", project.udts), ("DB", project.dbs),
                          ("FB", project.fbs), ("FC", project.fcs),
                          ("Instance DB", project.instance_dbs)):
        for obj in objects:
            nodes.append({"kind": kind, "name": obj.name})

    def add_edges(kind, obj):
        if kind == "UDT":
            sections = (("Static", obj.fields),)
        elif kind == "DB":
            sections = (("Static", obj.members),)
        else:
            names = ("input", "output", "inout", "static", "temp", "constant") if kind == "FB" else (
                "input", "output", "inout", "temp", "constant")
            sections = ((section, getattr(obj, section).members) for section in names)
        for section, members in sections:
            section_label = section[:1].upper() + section[1:]
            for path, data_type in _declarations(members):
                if not data_type:
                    continue
                key = data_type.casefold()
                if key in udts:
                    edges.append({"dependency": udts[key].name, "dependent": obj.name,
                                  "dependent_kind": kind, "member": section_label + "." + path,
                                  "relation": "uses UDT", "status": "local declaration"})
                elif key in fbs and kind == "FB" and section.casefold() == "static":
                    edges.append({"dependency": fbs[key].name, "dependent": obj.name,
                                  "dependent_kind": kind, "member": section_label + "." + path,
                                  "relation": "multi-instance", "status": "local declaration"})
                elif not is_builtin_type(data_type):
                    # It may be a type that exists only in the remote TIA
                    # project. Do not infer or create it; make the unknown
                    # dependency visible for manual review instead.
                    add_unresolved(
                        obj.name,
                        section_label + "." + path + ": " + data_type
                        + " is neither a local UDT/FB nor a registered Siemens type.",
                    )

    for kind, items in (("UDT", project.udts), ("DB", project.dbs),
                        ("FB", project.fbs), ("FC", project.fcs)):
        for obj in items:
            add_edges(kind, obj)
            if kind in {"FB", "FC"}:
                if obj.created_locally:
                    add_unresolved(obj.name,
                                   "Locally created declarations only; no PLC program or verified TIA block.")
                elif obj.source_mode != "tia_read_only" or not obj.interface_verified:
                    add_unresolved(obj.name, "Block interface is not a verified TIA snapshot.")
    for obj in project.instance_dbs:
        if isinstance(obj, InstanceDbSnapshot):
            if obj.relationship_status == "reported_by_openness" and obj.function_block:
                edges.append({"dependency": obj.function_block, "dependent": obj.name,
                              "dependent_kind": "Instance DB", "member": "",
                              "relation": "instance of",
                              "status": "reported by Openness; V21 smoke not confirmed"})
                owner = fbs.get(obj.function_block.casefold())
                if not owner:
                    add_unresolved(obj.name,
                                   "Owning Function Block reported by Openness is not present in the local FB inventory: "
                                   + obj.function_block + ".")
                elif not owner.interface_verified:
                    add_unresolved(obj.name,
                                   "Owning Function Block interface is unverified: " + owner.name + ".")
                elif owner.number is not None and obj.instance_of_number != owner.number:
                    add_unresolved(obj.name,
                                   "Openness owner number does not match the local FB snapshot: " + owner.name + ".")
            else:
                add_unresolved(obj.name, "Owning Function Block not reported by TIA Openness.")
        else:
            edges.append({"dependency": obj.function_block, "dependent": obj.name,
                          "dependent_kind": "Instance DB", "member": "",
                          "relation": "instance of", "status": "local declaration only"})

    def ordered_objects(kind, items):
        by_name = {obj.name.casefold(): obj for obj in items}
        visited, visiting, ordered = set(), set(), []
        def visit(item):
            key = item.name.casefold()
            if key in visited:
                return
            if key in visiting:
                raise ValueError("Circular " + kind + " dependency: " + item.name)
            visiting.add(key)
            for edge in edges:
                if edge["dependent_kind"] == kind and edge["dependent"].casefold() == key:
                    referenced = by_name.get(edge["dependency"].casefold())
                    if referenced:
                        visit(referenced)
            visiting.remove(key)
            visited.add(key)
            ordered.append({"kind": kind, "name": item.name})
        for item in items:
            visit(item)
        return ordered

    order = (ordered_objects("UDT", project.udts)
             + ordered_objects("DB", project.dbs)
             + ordered_objects("FB", project.fbs)
             + ordered_objects("FC", project.fcs)
             + ordered_objects("Instance DB", project.instance_dbs))
    return {"nodes": nodes, "edges": edges, "unresolved": unresolved,
            "order": order, "tia_compilation_verified": False, "tia_write_allowed": False}
