"""
services/redflag/redflag_detector.py

Red flag detector that analyzes checklist answers and identifies potential
legal risks. Each red flag is triggered by specific patterns in the retrieved
answers, such as low similarity scores, negative keywords, or missing information.

This service is critical for Pakistani legal due diligence because it:
- Automatically highlights high-risk areas that require immediate lawyer attention
- Standardizes risk assessment across all transactions
- Provides traceable source citations for each flagged issue
- Enables prioritized review workflow (HIGH severity first)
"""

from enum import Enum
from typing import List

from services.checklist.checklist_service import ChecklistAnswer
from utils.logger import get_logger

logger = get_logger(__name__)


class Severity(str, Enum):
    """Severity levels for red flags."""
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"


class RedFlag:
    """A detected red flag with full context."""

    def __init__(
        self,
        flag_id: str,
        name: str,
        severity: Severity,
        description: str,
        triggered_by_question: str,
        source_filename: str,
        page_number: int,
    ):
        self.flag_id = flag_id
        self.name = name
        self.severity = severity
        self.description = description
        self.triggered_by_question = triggered_by_question
        self.source_filename = source_filename
        self.page_number = page_number

    def to_dict(self) -> dict:
        return {
            "flag_id": self.flag_id,
            "name": self.name,
            "severity": self.severity.value,
            "description": self.description,
            "triggered_by_question": self.triggered_by_question,
            "source_filename": self.source_filename,
            "page_number": self.page_number,
        }


class RedFlagDetector:
    """
    Analyzes checklist answers and detects red flags based on predefined patterns.
    Each transaction type has specific red flags relevant to Pakistani law.
    """

    # Property transaction red flags
    PROPERTY_PATTERNS = {
        "MISSING_MUTATION": {
            "name": "Missing Mutation (Intiqal)",
            "severity": Severity.HIGH,
            "description": "No registered mutation found in seller's name. Under Transfer of Property Act 1882, mutation is critical for establishing title transfer.",
            "trigger_keywords": ["mutation", "intiqal"],
            "negative_keywords": ["not found", "no mutation", "missing", "not registered"],
            "min_similarity_threshold": 0.3,
        },
        "MISSING_NOC": {
            "name": "Missing NOC from Authority",
            "severity": Severity.HIGH,
            "description": "No valid NOC obtained from housing authority/development body. Required for property transfers in developed societies.",
            "trigger_keywords": ["noc", "no objection certificate"],
            "negative_keywords": ["not found", "no noc", "missing", "not obtained", "pending"],
            "min_similarity_threshold": 0.3,
        },
        "UNREGISTERED_DEED": {
            "name": "Unregistered Sale Deed",
            "severity": Severity.HIGH,
            "description": "Sale deed not registered with Sub-Registrar. Under Registration Act 1908, unregistered deeds have limited legal validity.",
            "trigger_keywords": ["registry", "sub-registrar", "registered"],
            "negative_keywords": ["not registered", "unregistered", "not filed", "missing"],
            "min_similarity_threshold": 0.3,
        },
        "OUTSTANDING_DUES": {
            "name": "Outstanding Tax/Utility Dues",
            "severity": Severity.MEDIUM,
            "description": "Property has outstanding taxes or utility bills. Buyer may inherit these liabilities.",
            "trigger_keywords": ["tax", "utility", "bill", "dues"],
            "negative_keywords": ["outstanding", "unpaid", "pending", "due", "arrears"],
            "min_similarity_threshold": 0.2,
        },
        "ENCUMBRANCE_DETECTED": {
            "name": "Mortgage or Encumbrance Detected",
            "severity": Severity.HIGH,
            "description": "Property has existing mortgage, lien, or encumbrance. Must be cleared before transfer.",
            "trigger_keywords": ["mortgage", "lien", "charge", "encumbrance"],
            "negative_keywords": [],  # Presence of these keywords is enough to flag
            "min_similarity_threshold": 0.2,
        },
        "MISSING_FARD": {
            "name": "Missing Fard (Ownership Record)",
            "severity": Severity.HIGH,
            "description": "No valid Fard issued by Patwari. Fard is primary evidence of ownership in land records.",
            "trigger_keywords": ["fard", "patwari", "ownership record"],
            "negative_keywords": ["not found", "no fard", "missing", "not issued"],
            "min_similarity_threshold": 0.3,
        },
        "DISPUTED_TITLE": {
            "name": "Disputed Title / Litigation",
            "severity": Severity.HIGH,
            "description": "Property involved in court case or dispute. High risk - title may not be transferable.",
            "trigger_keywords": ["court", "case", "dispute", "litigation", "pending"],
            "negative_keywords": [],  # Presence of these keywords is enough to flag
            "min_similarity_threshold": 0.2,
        },
    }

    # Loan agreement red flags
    LOAN_PATTERNS = {
        "UNREGISTERED_SECURITY": {
            "name": "Unregistered Security/Collateral",
            "severity": Severity.HIGH,
            "description": "Security/collateral not properly registered. Under Registration Act 1908, unregistered mortgages are void against third parties.",
            "trigger_keywords": ["security", "collateral", "mortgage", "registered"],
            "negative_keywords": ["not registered", "unregistered", "not perfected", "missing"],
            "min_similarity_threshold": 0.3,
        },
        "MISSING_STAMP_DUTY": {
            "name": "Missing Stamp Duty",
            "severity": Severity.HIGH,
            "description": "Document not properly stamped. Under Stamp Act 1899, unstamped documents are inadmissible as evidence.",
            "trigger_keywords": ["stamp", "stamped", "attested"],
            "negative_keywords": ["not stamped", "unstamped", "missing stamp", "not attested"],
            "min_similarity_threshold": 0.3,
        },
        "UNDEFINED_DEFAULT_EVENTS": {
            "name": "Undefined Events of Default",
            "severity": Severity.MEDIUM,
            "description": "Events of default not clearly defined. Lacks clarity on lender's remedies in case of borrower default.",
            "trigger_keywords": ["default", "event", "remedy"],
            "negative_keywords": ["not defined", "unclear", "missing", "not specified"],
            "min_similarity_threshold": 0.3,
        },
    }

    # Company acquisition red flags
    ACQUISITION_PATTERNS = {
        "SECP_NON_COMPLIANCE": {
            "name": "SECP Non-Compliance",
            "severity": Severity.HIGH,
            "description": "Company not in good standing with SECP or filings incomplete. Under Companies Act 2017, this may affect transaction validity.",
            "trigger_keywords": ["secp", "filing", "statutory", "return"],
            "negative_keywords": ["not filed", "incomplete", "pending", "non-compliant", "not in good standing"],
            "min_similarity_threshold": 0.3,
        },
        "PENDING_LITIGATION": {
            "name": "Pending Litigation Against Company",
            "severity": Severity.HIGH,
            "description": "Company has pending litigations or regulatory actions. Material risk not disclosed may constitute breach of warranty.",
            "trigger_keywords": ["litigation", "case", "dispute", "regulatory", "claim"],
            "negative_keywords": [],  # Presence of these keywords is enough to flag
            "min_similarity_threshold": 0.2,
        },
        "MISSING_APPROVALS": {
            "name": "Missing Board/Shareholder Approvals",
            "severity": Severity.HIGH,
            "description": "Required director or shareholder approvals not obtained. Under Companies Act 2017, certain transactions require specific approvals.",
            "trigger_keywords": ["approval", "board", "shareholder", "resolution"],
            "negative_keywords": ["not obtained", "missing", "pending", "not approved"],
            "min_similarity_threshold": 0.3,
        },
    }

    PATTERN_MAP = {
        "property": PROPERTY_PATTERNS,
        "loan": LOAN_PATTERNS,
        "acquisition": ACQUISITION_PATTERNS,
    }

    def __init__(self):
        self.patterns = {}

    def detect_red_flags(
        self,
        answers: List[ChecklistAnswer],
        transaction_type: str,
    ) -> List[RedFlag]:
        """
        Analyzes checklist answers and detects red flags based on patterns.
        Returns a list of detected red flags with full context.
        """
        patterns = self.PATTERN_MAP.get(transaction_type.lower(), {})
        if not patterns:
            logger.warning(f"No red flag patterns defined for transaction type: {transaction_type}")
            return []

        logger.info(
            f"Detecting red flags for transaction type '{transaction_type}' "
            f"with {len(answers)} answers and {len(patterns)} patterns"
        )

        red_flags: List[RedFlag] = []

        for answer in answers:
            for flag_id, pattern in patterns.items():
                if self._should_trigger_flag(answer, pattern):
                    red_flag = RedFlag(
                        flag_id=flag_id,
                        name=pattern["name"],
                        severity=pattern["severity"],
                        description=pattern["description"],
                        triggered_by_question=answer.question,
                        source_filename=answer.source_filename,
                        page_number=answer.page_number,
                    )
                    red_flags.append(red_flag)
                    logger.info(
                        f"Red flag triggered: {flag_id} - {pattern['name']} "
                        f"(question: {answer.question[:50]}...)"
                    )

        logger.info(f"Red flag detection complete: {len(red_flags)} flag(s) detected")
        return red_flags

    def _should_trigger_flag(self, answer: ChecklistAnswer, pattern: dict) -> bool:
        """
        Determines if a red flag should be triggered based on the answer and pattern.
        Checks similarity threshold, trigger keywords, and negative keywords.
        """
        # Check similarity threshold
        if answer.similarity_score < pattern["min_similarity_threshold"]:
            return True

        answer_lower = answer.answer.lower()

        # Check for trigger keywords
        trigger_keywords = pattern["trigger_keywords"]
        if any(keyword in answer_lower for keyword in trigger_keywords):
            # If negative keywords are defined, check if they're present
            negative_keywords = pattern["negative_keywords"]
            if negative_keywords:
                if any(neg_keyword in answer_lower for neg_keyword in negative_keywords):
                    return True
            else:
                # No negative keywords defined - presence of trigger keyword is enough
                return True

        return False
