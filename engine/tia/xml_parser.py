from pathlib import Path
import xml.etree.ElementTree as ET

from engine.tia.models import (
    PlcStructureMemberInfo,
)


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


def xml_comment(
    member: ET.Element,
) -> str:
    preferred_names = {
        "multilanguagetext",
        "text",
        "comment",
    }


    for element in member.iter():
        if (
            element is member
            or xml_local_name(
                element.tag
            ).casefold()
            not in preferred_names
        ):
            continue


        text = (
            element.text
            or ""
        ).strip()


        if text:
            return text


    return ""


def direct_member_children(
    element: ET.Element,
) -> list[ET.Element]:
    members = []


    def walk(
        node: ET.Element,
    ):
        for child in list(node):
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


        result.append(
            PlcStructureMemberInfo(
                section=section,
                path=path,
                name=name,
                data_type=xml_attribute(
                    member,
                    "Datatype",
                    "DataType",
                    "Type",
                ),
                level=level,
                offset=xml_attribute(
                    member,
                    "Offset",
                    "ByteOffset",
                ),
                comment=xml_comment(
                    member
                ),
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


    for section in root.iter():
        if (
            xml_local_name(
                section.tag
            )
            !=
            "Section"
        ):
            continue


        section_name = xml_attribute(
            section,
            "Name",
        )


        for member in direct_member_children(
            section
        ):
            append_member(
                member,
                section_name,
                "",
                0,
            )


    return result
