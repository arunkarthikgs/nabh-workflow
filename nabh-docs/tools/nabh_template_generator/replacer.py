import re

from config import PLACEHOLDER_MAP
from patterns import (
    DATE_PATTERN,
    DOC_ID_PATTERN,
    HOSPITAL_NAME_PATTERN,
    ORG_PATTERN,
    PERSON_PATTERN,
)


def detect_placeholders(text: str, metadata: dict) -> dict:
    detected = {
        "hospital_names": re.findall(HOSPITAL_NAME_PATTERN, text),
        "document_ids": re.findall(DOC_ID_PATTERN, text),
        "dates": re.findall(DATE_PATTERN, text),
        "person_roles": [],
        "partner_orgs": re.findall(ORG_PATTERN, text),
        "has_logo": metadata.get("has_logo", False),
    }

    for match in re.finditer(PERSON_PATTERN, text):
        detected["person_roles"].append({
            "role": match.group(1),
            "name": match.group(2).strip(),
        })

    return detected


def replace_placeholders(text: str, detected: dict) -> str:
    text = re.sub(HOSPITAL_NAME_PATTERN, PLACEHOLDER_MAP["hospital_name"], text)
    text = re.sub(DOC_ID_PATTERN, PLACEHOLDER_MAP["document_id"], text)
    text = re.sub(DATE_PATTERN, PLACEHOLDER_MAP["date"], text)

    def person_replacer(match):
        role = match.group(1)
        key = role.lower().replace(" ", "_")
        placeholder = PLACEHOLDER_MAP.get(key, "[Person Name]")
        return f"{role}: {placeholder}"

    text = re.sub(PERSON_PATTERN, person_replacer, text)
    text = re.sub(ORG_PATTERN, PLACEHOLDER_MAP["partner_org"], text)

    if detected.get("has_logo"):
        text = PLACEHOLDER_MAP["logo"] + "\n\n" + text

    return text
