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
                retain=db.retain,
            )
        )

    for fb in project.fbs:
        sections.append(generate_fb_source(fb.name, fb, udt_names))

    return "\n\n".join(sections)


def generate_fb_source(name, fb, udt_names: dict[str, str]) -> str:
    """Generate declaration-only SCL for the locally modelled safe FB subset.

    IEC system instances are intentionally rejected here until their exact TIA
    declaration context is verified on a real V21 project.
    """
    lines = [f'FUNCTION_BLOCK "{name}"', "VERSION : 0.1"]
    sections = (("VAR_INPUT", fb.input.members), ("VAR_OUTPUT", fb.output.members),
                ("VAR_IN_OUT", fb.inout.members), ("VAR", fb.static.members),
                ("VAR_TEMP", fb.temp.members), ("VAR CONSTANT", fb.constant.members))
    for header, members in sections:
        if not members: continue
        if any(getattr(member, "system_instance", False) for member in members):
            raise ValueError("TIA compilation not verified for IEC instance declarations in Function Blocks.")
        lines.append(header)
        for member in members: lines.extend(generate_member_lines(member, "   ", udt_names))
        lines.append("END_VAR")
    lines.extend(["BEGIN", "END_FUNCTION_BLOCK"])
    return "\n".join(lines)


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
    retain: bool = False,
) -> str:
    lines = [
        f'DATA_BLOCK "{name}"',
        "{ S7_Optimized_Access := 'TRUE' }",
        "VERSION : 0.1",
    ]
    # V21 optimized global DB: consecutive variables with the same retain
    # mode are emitted in separate VAR / VAR RETAIN declaration sections.
    # The previous whole-DB syntax is preserved for legacy configurations.
    effective = [(member, member.retain if member.retain is not None else retain)
                 for member in members]
    modes = {mode for _, mode in effective}
    if len(modes) <= 1:
        mode = next(iter(modes), retain)
        if mode:
            lines.append("VAR RETAIN")
        else:
            lines.extend(("NON_RETAIN", "VAR"))
        for member, _ in effective:
            lines.extend(generate_member_lines(
                member, indent="   ", udt_names=udt_names))
        lines.append("END_VAR")
    else:
        current = None
        for member, mode in effective:
            if current is None or current != mode:
                if current is not None:
                    lines.append("END_VAR")
                lines.append("VAR RETAIN" if mode else "VAR")
                current = mode
            lines.extend(generate_member_lines(
                member, indent="   ", udt_names=udt_names))
        lines.append("END_VAR")

    lines.extend(["BEGIN", "END_DATA_BLOCK"])

    return "\n".join(lines)


def generate_member_lines(
    member: TiaMember,
    indent: str,
    udt_names: dict[str, str],
) -> list[str]:
    lines: list[str] = []

    if member.comment:
        lines.append(f"{indent}// " f"{sanitize_comment(member.comment)}")

    attributes = format_member_attributes(member)
    declaration_prefix = f"{member.name}{attributes} : "

    if member.data_type.lower() == "struct":
        lines.append(f"{indent}{declaration_prefix}Struct")

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

    initial = format_start_value(member)
    lines.append(f"{indent}{declaration_prefix}{declaration}{initial};")

    return lines


def format_member_attributes(member: TiaMember) -> str:
    names = (
        ("EXTERNALVISIBLE", member.hmi_visible),
        ("EXTERNALACCESSIBLE", member.hmi_accessible),
        ("EXTERNALWRITABLE", member.hmi_writable),
    )
    attributes = [
        f"{name} := '{str(value).upper()}'"
        for name, value in names if value is not None
    ]
    return " { " + "; ".join(attributes) + " }" if attributes else ""


def format_start_value(member: TiaMember) -> str:
    if member.start_value is None or member.start_value == "":
        return ""
    kind = member.data_type.casefold()
    if kind == "bool":
        literal = ("TRUE" if member.start_value.casefold() in ("true", "1")
                   else "FALSE")
    else:
        literal = member.start_value
    return " := " + literal


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
