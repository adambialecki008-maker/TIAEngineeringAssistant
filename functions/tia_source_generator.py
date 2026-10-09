from engine.project import (
    ProjectSpecification,
)

from engine.tia_member import (
    TiaMember,
)


def generate_project_source(
    project: ProjectSpecification,
) -> str:
    udt_names = {udt.name.lower(): udt.name for udt in project.udts}

    sections: list[str] = []

    for udt in project.udts:
        sections.append(
            generate_udt_source(
                udt.name,
                udt.fields,
                udt_names,
            )
        )

    for db in project.dbs:
        sections.append(
            generate_db_source(
                db.name,
                db.members,
                udt_names,
            )
        )

    return "\n\n".join(sections)


def generate_udt_source(
    name: str,
    fields: list[TiaMember],
    udt_names: dict[str, str],
) -> str:
    lines = [
        f'TYPE "{name}"',
        "VERSION : 0.1",
        "   STRUCT",
    ]

    for field in fields:
        lines.extend(
            generate_member_lines(
                field,
                indent="      ",
                udt_names=udt_names,
            )
        )

    lines.extend(
        [
            "   END_STRUCT;",
            "END_TYPE",
        ]
    )

    return "\n".join(lines)


def generate_db_source(
    name: str,
    members: list[TiaMember],
    udt_names: dict[str, str],
) -> str:
    lines = [
        f'DATA_BLOCK "{name}"',
        "{ S7_Optimized_Access := 'TRUE' }",
        "VERSION : 0.1",
        "NON_RETAIN",
        "VAR",
    ]

    for member in members:
        lines.extend(
            generate_member_lines(
                member,
                indent="   ",
                udt_names=udt_names,
            )
        )

    lines.extend(
        [
            "END_VAR",
            "BEGIN",
            "END_DATA_BLOCK",
        ]
    )

    return "\n".join(lines)


def generate_member_lines(
    member: TiaMember,
    indent: str,
    udt_names: dict[str, str],
) -> list[str]:
    lines: list[str] = []

    if member.comment:
        lines.append(f"{indent}// " f"{sanitize_comment(member.comment)}")

    if member.data_type.lower() == "struct":
        lines.append(f"{indent}{member.name} : Struct")

        for child in member.struct_members or []:
            lines.extend(
                generate_member_lines(
                    child,
                    indent=indent + "   ",
                    udt_names=udt_names,
                )
            )

        lines.append(f"{indent}END_STRUCT;")

        return lines

    if member.data_type.lower() == "array":
        element_type = format_data_type(
            member.array_element_type,
            udt_names,
        )

        declaration = (
            f"Array["
            f"{member.array_lower_bound}.."
            f"{member.array_upper_bound}"
            f"] of {element_type}"
        )

    else:
        declaration = format_data_type(
            member.data_type,
            udt_names,
        )

    lines.append(f"{indent}" f"{member.name} : " f"{declaration};")

    return lines


def format_data_type(
    data_type: str | None,
    udt_names: dict[str, str],
) -> str:
    if data_type is None:
        raise ValueError("Data type is required.")

    udt_name = udt_names.get(data_type.lower())

    if udt_name:
        return f'"{udt_name}"'

    return data_type


def sanitize_comment(
    comment: str,
) -> str:
    return comment.replace("\r", " ").replace("\n", " ").strip()
