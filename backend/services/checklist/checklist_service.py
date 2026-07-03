"""
services/checklist/checklist_service.py

Checklist runner that automatically runs all due diligence questions against
a session's vector index using the existing LegalRetriever. Each transaction
type has a specific set of legal questions relevant to Pakistani law.

This service is critical for automated due diligence because it:
- Standardizes the review process across all transactions
- Ensures no critical legal question is missed
- Provides traceable source citations for every answer
- Enables red flag detection based on retrieval quality
"""

from typing import List

from models.schemas import TransactionType, RetrievedChunk
from services.query_engine.retriever import LegalRetriever
from utils.logger import get_logger

logger = get_logger(__name__)


# Transaction-specific checklists with Pakistani legal context
PROPERTY_CHECKLIST = [
    "Is the title of the property clearly established in the sale deed?",
    "Is there a registered mutation (Intiqal) in the name of the seller?",
    "Has the property been registered with the relevant Sub-Registrar?",
    "Is there a valid Fard (ownership record) issued by the Patwari?",
    "Are there any existing mortgages, liens, or encumbrances on the property?",
    "Has an NOC been obtained from the relevant housing authority or development body?",
    "Are property taxes and utility bills current with no outstanding dues?",
    "Does the physical possession match the description in the title documents?",
    "Are there any pending court cases or disputes involving this property?",
    "Is the seller's CNIC verified and does it match the title documents?",
    "Is the sale consideration amount clearly stated and does it match across all documents?",
    "Are all witness signatures present and attested on the sale deed?",
    "Is there a valid registry (Registered Sale Deed) from the Sub-Registrar's office?",
    "Are there any third-party claims or rights of way over the property?",
    "Has a site visit report been included confirming physical boundaries?",
]

LOAN_CHECKLIST = [
    "Are the borrower and lender details clearly identified with CNICs/registration numbers?",
    "Is the principal loan amount clearly stated in words and figures?",
    "What is the interest/profit rate and is it compliant with applicable law?",
    "What is the repayment schedule and are the installment amounts clearly defined?",
    "What security or collateral has been pledged against this loan?",
    "Has the security been properly registered/perfected (mortgage deed registered)?",
    "Are there penalty clauses for late payment clearly defined?",
    "What are the events of default and the lender's remedies?",
    "Is there a prepayment clause and what are its conditions?",
    "Has the borrower provided all required financial disclosures?",
    "Are there any cross-default provisions or covenants?",
    "Has the document been stamped and attested as required by law?",
]

ACQUISITION_CHECKLIST = [
    "Is the target company validly incorporated and in good standing with SECP?",
    "Are the shareholding structure and ownership percentages clearly documented?",
    "Is there a valid Share Purchase Agreement or Asset Purchase Agreement?",
    "Have all required SECP filings and statutory returns been completed?",
    "Are there any pending litigations, claims, or regulatory actions against the company?",
    "What are the key representations and warranties given by the seller?",
    "Are there any change of control provisions in existing contracts?",
    "Have all director and shareholder approvals been obtained for the transaction?",
    "Are there any undisclosed liabilities or contingent obligations?",
    "What intellectual property does the company own and is it properly registered?",
    "Are employment contracts and any HR liabilities documented?",
    "What are the conditions precedent to closing this transaction?",
    "Is there an escrow or indemnity mechanism for post-closing claims?",
]

CHECKLIST_MAP = {
    TransactionType.PROPERTY: PROPERTY_CHECKLIST,
    TransactionType.LOAN: LOAN_CHECKLIST,
    TransactionType.ACQUISITION: ACQUISITION_CHECKLIST,
}


class ChecklistAnswer:
    """Single question-answer pair with source citation."""

    def __init__(
        self,
        question: str,
        answer: str,
        source_filename: str,
        page_number: int,
        similarity_score: float,
    ):
        self.question = question
        self.answer = answer
        self.source_filename = source_filename
        self.page_number = page_number
        self.similarity_score = similarity_score

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "answer": self.answer,
            "source_filename": self.source_filename,
            "page_number": self.page_number,
            "similarity_score": self.similarity_score,
        }


class ChecklistService:
    """
    Runs all checklist questions against a session's vector index.
    Uses the existing LegalRetriever to fetch top chunks for each question.
    """

    def __init__(self, retriever: LegalRetriever | None = None):
        self.retriever = retriever or LegalRetriever()

    def run_checklist(
        self,
        session_id: str,
        transaction_type: TransactionType,
    ) -> List[ChecklistAnswer]:
        """
        Runs all checklist questions for the given transaction type against
        the session's vector index. Returns a list of answers with source citations.
        """
        questions = CHECKLIST_MAP.get(transaction_type, [])
        if not questions:
            logger.warning(f"No checklist defined for transaction type: {transaction_type}")
            return []

        logger.info(
            f"Running checklist for session '{session_id}' "
            f"with {len(questions)} questions (type: {transaction_type})"
        )

        answers: List[ChecklistAnswer] = []

        for question in questions:
            try:
                results = self.retriever.query(session_id, question, top_k=1)

                if results:
                    top_result = results[0]
                    answer = ChecklistAnswer(
                        question=question,
                        answer=top_result.text,
                        source_filename=top_result.filename,
                        page_number=top_result.page_number,
                        similarity_score=top_result.similarity_score,
                    )
                else:
                    # No relevant chunk found - this is itself a potential red flag
                    answer = ChecklistAnswer(
                        question=question,
                        answer="No relevant information found in the document bundle.",
                        source_filename="N/A",
                        page_number=-1,
                        similarity_score=0.0,
                    )

                answers.append(answer)

            except Exception as exc:
                logger.error(f"Error processing question '{question}': {exc}")
                # Add a placeholder answer to maintain checklist completeness
                answers.append(
                    ChecklistAnswer(
                        question=question,
                        answer=f"Error retrieving answer: {exc}",
                        source_filename="Error",
                        page_number=-1,
                        similarity_score=0.0,
                    )
                )

        logger.info(f"Checklist complete for session '{session_id}': {len(answers)} answers generated")
        return answers

    def get_checklist_questions(self, transaction_type: TransactionType) -> List[str]:
        """Returns the list of questions for a given transaction type."""
        return CHECKLIST_MAP.get(transaction_type, []).copy()
