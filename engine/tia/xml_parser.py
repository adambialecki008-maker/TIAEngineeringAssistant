from pathlib import Path
import xml.etree.ElementTree as ET

from engine.tia.models import (
    PlcStructureMemberInfo,
)
from engine.tia.type_registry import type_entry


def xml_local_name(
    tag: str,
) -> str:
    return (
        tag
        .rsplit("}", 1)[-1]
        .rsplit(":", 1)[-1]
    )


def xml_attribute(
    element: ET.Element,
    *names: str,
) -> str:
    attributes = {
        key.casefold(): value
        for key, value
        in element.attrib.items()
    }


    for name in names:
        value = attributes.get(
            name.casefold()
        )


        if value is not None:
            return value


    return ""


def xml_comment(member: ET.Element) -> str:
    for comment in member:
        if xml_local_name(comment.tag).casefold() != "comment":
            continue
        for element in comment.iter():
            text = (element.text or "").strip()
            if text and xml_local_name(element.tag).casefold() in {
                "multilanguagetext", "text", "comment",
            }:
                return text
    return ""


def member_metadata(member: ET.Element) -> dict[str, str]:
    result = {}
    for name, key in (("Remanence", "remanence"), ("At", "at")):
        value = xml_attribute(member, name)
        if value:
            result[key] = value
    attribute_names = {
        "externalvisible": "hmi_visible", "hmivisible": "hmi_visible",
        "externalaccessible": "hmi_accessible", "hmiaccessible": "hmi_accessible",
        "externalwritable": "hmi_writable", "at": "at",
    }
    for child in member:
        tag = xml_local_name(child.tag).casefold()
        if tag == "startvalue":
            result["start_value"] = (child.text or "").strip() if not list(child) else "<complex XML>"
        elif tag == "attributelist":
            for attribute in child:
                key = attribute_names.get(xml_attribute(attribute, "Name").casefold())
                if key:
                    result[key] = (attribute.text or "").strip()
    return result


def direct_member_children(
    element: ET.Element,
) -> list[ET.Element]:
    members = []


    def walk(
        node: ET.Element,
    ):
        for child in list(node):
            if xml_local_name(child.tag).casefold() in {
                "subelement", "startvalue", "attributelist", "comment",
            }:
                continue
            if (
                xml_local_name(
                    child.tag
                )
                ==
                "Member"
            ):
                members.append(
                    child
                )

                continue


            walk(
                child
            )


    walk(
        element
    )


    return members


def parse_structure_xml(
    file_path: Path,
) -> list[PlcStructureMemberInfo]:
    root = ET.parse(
        file_path
    ).getroot()


    result = []
    seen_members = set()


    def append_member(
        member: ET.Element,
        section: str,
        parent_path: str,
        level: int,
    ):
        member_id = id(
            member
        )


        if member_id in seen_members:
            return


        seen_members.add(
            member_id
        )


        name = xml_attribute(
            member,
            "Name",
        )


        if not name:
            return


        path = (
            f"{parent_path}.{name}"
            if parent_path
            else name
        )


        data_type = xml_attribute(
            member, "Datatype", "DataType", "Type",
        )
        result.append(
            PlcStructureMemberInfo(
                section=section,
                path=path,
                name=name,
                data_type=data_type,
                level=level,
                offset=xml_attribute(
                    member,
                    "Offset",
                    "ByteOffset",
                ),
                comment=xml_comment(member),
                metadata=member_metadata(member),
                system_instance=bool(type_entry(data_type)
                    and type_entry(data_type).get("kind", "").endswith("instance")),
            )
        )


        for child in direct_member_children(
            member
        ):
            append_member(
                child,
                section,
                path,
                level + 1,
            )


    def walk_sections(node):
        # A Section inside a Member is expanded by append_member and must not
        # be added again as a root declaration (e.g. ARRAY of UDT XML).
        if xml_local_name(node.tag) == "Member":
            return
        if xml_local_name(node.tag) == "Section":
            section_name = xml_attribute(node, "Name")
            for member in direct_member_children(node):
                append_member(member, section_name, "", 0)
            return
        for child in node:
            walk_sections(child)

    walk_sections(root)
    return result
