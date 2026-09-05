HOSPITAL_NAME_PATTERN = r"\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\s(?:Hospital|Medical Center|Clinic|Health Care))\b"

DOC_ID_PATTERN = r"\b([A-Z]{2,5}/NABH/[A-Za-z0-9\-]+/Rev\s*\d+)\b"

DATE_PATTERN = r"\b(\d{1,2}\s*[A-Za-z]{3,9}\s*\d{4}|[A-Za-z]{3,9}\s*\d{4})\b"

PERSON_PATTERN = r"(Prepared By|Approved By|Reviewed By|Audited By)\s*[:\-]?\s*([A-Za-z .]+)"

ORG_PATTERN = r"\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\s(?:Labs|Laboratory|Hospital|Diagnostics|Centre|Agency))\b"
