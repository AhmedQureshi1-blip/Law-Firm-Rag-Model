"""
services/llm/groq_service.py

Groq API integration for generating structured due diligence memos.
Uses llama-3.3-70b-versatile model for development. Production will use Claude Sonnet.

This service is critical because it:
- Synthesizes checklist answers and red flags into a professional legal memo
- Applies Pakistani legal context (Transfer of Property Act 1882, Registration Act 1908, Companies Act 2017)
- Generates lawyer-ready output that requires minimal editing
- Maintains consistent formatting across all transactions
"""

from datetime import datetime
from typing import List

from groq import Groq
from config import settings
from services.checklist.checklist_service import ChecklistAnswer
from services.redflag.redflag_detector import RedFlag
from utils.logger import get_logger

logger = get_logger(__name__)


class GroqService:
    """
    Groq API client for generating due diligence memos.
    Takes checklist answers, red flags, and transaction type to produce
    a structured legal memorandum in the exact format required.
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        if not self.api_key:
            raise ValueError("GROQ_API_KEY not configured. Set it in .env file.")
        
        self.client = Groq(api_key=self.api_key)
        self.model = settings.GROQ_MODEL

    def generate_memo(
        self,
        checklist_answers: List[ChecklistAnswer],
        red_flags: List[RedFlag],
        transaction_type: str,
    ) -> str:
        """
        Generates a structured due diligence memo using Groq Llama 3.3 70B.
        Returns the memo text in the exact format specified.
        """
        logger.info(
            f"Generating memo for transaction type '{transaction_type}' "
            f"with {len(checklist_answers)} checklist answers and {len(red_flags)} red flags"
        )

        # Build the prompt with all context
        prompt = self._build_prompt(checklist_answers, red_flags, transaction_type)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert Pakistani legal assistant specializing in due diligence for corporate and real estate transactions. You have deep knowledge of Pakistani law including the Transfer of Property Act 1882, Registration Act 1908, Companies Act 2017, Stamp Act 1899, and relevant SECP regulations."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,  # Lower temperature for more consistent, factual output
                max_tokens=4096,
            )

            memo_text = response.choices[0].message.content
            logger.info("Memo generation completed successfully")
            return memo_text

        except Exception as exc:
            logger.error(f"Error generating memo with Groq: {exc}")
            raise

    def _build_prompt(
        self,
        checklist_answers: List[ChecklistAnswer],
        red_flags: List[RedFlag],
        transaction_type: str,
    ) -> str:
        """
        Builds the prompt for Groq with all checklist answers, red flags,
        and instructions for the exact memo format.
        """
        today = datetime.now().strftime("%B %d, %Y")

        # Format checklist answers
        checklist_section = "CHECKLIST ANSWERS:\n\n"
        for i, answer in enumerate(checklist_answers, 1):
            checklist_section += f"{i}. Question: {answer.question}\n"
            checklist_section += f"   Answer: {answer.answer}\n"
            checklist_section += f"   Source: {answer.source_filename}, Page {answer.page_number}\n"
            checklist_section += f"   Similarity Score: {answer.similarity_score:.3f}\n\n"

        # Format red flags
        red_flag_section = "RED FLAGS IDENTIFIED:\n\n"
        if red_flags:
            for i, flag in enumerate(red_flags, 1):
                red_flag_section += f"{i}. {flag.name} ({flag.severity.value})\n"
                red_flag_section += f"   Description: {flag.description}\n"
                red_flag_section += f"   Triggered by: {flag.triggered_by_question}\n"
                red_flag_section += f"   Source: {flag.source_filename}, Page {flag.page_number}\n\n"
        else:
            red_flag_section += "No red flags detected.\n\n"

        prompt = f"""
Generate a professional legal due diligence memorandum based on the following information.

TRANSACTION TYPE: {transaction_type.upper()}
DATE: {today}

{checklist_section}

{red_flag_section}

INSTRUCTIONS:
Generate a legal memorandum in the EXACT format below. Do not deviate from this structure.

LEGAL DUE DILIGENCE REVIEW MEMORANDUM

Prepared by: AI-Powered Legal Review System
Date: {today}
Transaction Type: {transaction_type.title()}
Status: DRAFT — FOR LAWYER REVIEW

EXECUTIVE SUMMARY
[Write 2-3 paragraphs summarizing the transaction review, key findings, and overall risk assessment. Reference Pakistani law where relevant (Transfer of Property Act 1882, Registration Act 1908, Companies Act 2017, etc.).]

RISK ASSESSMENT: [LOW / MEDIUM / HIGH]

SECTION 1: DOCUMENT REVIEW FINDINGS
[For each significant checklist question, provide a heading, the finding, and source citation. Focus on the most critical findings rather than listing every question. Group related findings together.]

SECTION 2: RED FLAGS IDENTIFIED
[Numbered list of all red flags with severity, description, and recommended action. Prioritize HIGH severity flags first.]

SECTION 3: MISSING DOCUMENTS
[List any documents that appear to be missing from the bundle based on the checklist answers (e.g., if mutation is not found, note that Mutation Record is missing).]

SECTION 4: RECOMMENDATIONS
[Provide 3-5 specific, actionable recommendations for the lawyer based on the findings and red flags. These should be practical steps to address identified risks.]

DISCLAIMER
This memorandum has been generated by an AI system and must be reviewed, verified, and approved by a qualified legal practitioner before reliance. This document does not constitute legal advice.

IMPORTANT GUIDELINES:
- Reference Pakistani law and regulations where applicable
- Be specific and factual based on the provided checklist answers
- Maintain professional legal tone throughout
- Ensure the memo is actionable for a Pakistani lawyer
- If information is missing or unclear, state this explicitly
"""
        return prompt
