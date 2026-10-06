import re

from app.models import (
    IssueSeverity,
    PlcTag,
    TagReviewIssue,
    TagReviewResponse,
    TagReviewSummary,
)

TAG_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def review_tags(
    tags: list[PlcTag],
) -> TagReviewResponse:
    issues: list[TagReviewIssue] = []

    _check_duplicate_names(tags, issues)
    _check_duplicate_addresses(tags, issues)
    _check_comments(tags, issues)
    _check_tag_names(tags, issues)

    errors = sum(1 for issue in issues if issue.severity == IssueSeverity.ERROR)

    warnings = sum(1 for issue in issues if issue.severity == IssueSeverity.WARNING)

    return TagReviewResponse(
        summary=TagReviewSummary(
            total_tags=len(tags),
            errors=errors,
            warnings=warnings,
        ),
        issues=issues,
    )


def _check_duplicate_names(
    tags: list[PlcTag],
    issues: list[TagReviewIssue],
) -> None:
    seen: dict[str, str] = {}

    for tag in tags:
        normalized_name = tag.name.casefold()

        if normalized_name in seen:
            issues.append(
                TagReviewIssue(
                    severity=IssueSeverity.ERROR,
                    code="DUPLICATE_TAG_NAME",
                    message=(
                        f"Tag name '{tag.name}' duplicates "
                        f"'{seen[normalized_name]}'."
                    ),
                    tag_name=tag.name,
                )
            )
            continue

        seen[normalized_name] = tag.name


def _check_duplicate_addresses(
    tags: list[PlcTag],
    issues: list[TagReviewIssue],
) -> None:
    seen: dict[str, str] = {}

    for tag in tags:
        if not tag.address:
            continue

        normalized_address = tag.address.strip().casefold()

        if normalized_address in seen:
            issues.append(
                TagReviewIssue(
                    severity=IssueSeverity.ERROR,
                    code="DUPLICATE_ADDRESS",
                    message=(
                        f"Address '{tag.address}' is already used by "
                        f"tag '{seen[normalized_address]}'."
                    ),
                    tag_name=tag.name,
                )
            )
            continue

        seen[normalized_address] = tag.name


def _check_comments(
    tags: list[PlcTag],
    issues: list[TagReviewIssue],
) -> None:
    for tag in tags:
        if tag.comment and tag.comment.strip():
            continue

        issues.append(
            TagReviewIssue(
                severity=IssueSeverity.WARNING,
                code="MISSING_COMMENT",
                message="Tag has no engineering comment.",
                tag_name=tag.name,
            )
        )


def _check_tag_names(
    tags: list[PlcTag],
    issues: list[TagReviewIssue],
) -> None:
    for tag in tags:
        if TAG_NAME_PATTERN.fullmatch(tag.name):
            continue

        issues.append(
            TagReviewIssue(
                severity=IssueSeverity.WARNING,
                code="TAG_NAME_FORMAT",
                message=(
                    "Tag name should start with a letter and contain "
                    "only letters, numbers, and underscores."
                ),
                tag_name=tag.name,
            )
        )
