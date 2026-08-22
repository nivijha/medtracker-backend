"""Tiny gold evaluation set for the offline RAG harness.

Each document is indexed per-user. Queries list the relevant `documentId`s (used for
Recall@K / MRR / Precision@K) and an `expected` answer substring (used as a soft
check that the top retrieved context contains the answer).
"""
from __future__ import annotations

from typing import Any

GOLD_DOCUMENTS: list[dict[str, Any]] = [
    {
        "documentId": "doc-metformin",
        "userId": "eval-user",
        "type": "lab",
        "sourceFilename": "meds.txt",
        "text": (
            "Metformin is a biguanide used for type 2 diabetes. "
            "The usual starting dose is 500 mg twice daily with meals. "
            "Maximum recommended dose is 2000 mg per day. "
            "Common side effects include gastrointestinal upset and diarrhea."
        ),
    },
    {
        "documentId": "doc-lisinopril",
        "userId": "eval-user",
        "type": "lab",
        "sourceFilename": "meds.txt",
        "text": (
            "Lisinopril is an ACE inhibitor used for hypertension. "
            "Typical dose is 10 mg once daily. "
            "It can cause a dry cough and elevated potassium."
        ),
    },
    {
        "documentId": "doc-lipid",
        "userId": "eval-user",
        "type": "lab",
        "sourceFilename": "labs.txt",
        "text": (
            "Lipid panel shows LDL cholesterol 142 mg/dL and HDL 50 mg/dL. "
            "Patient is advised on dietary changes and statin therapy."
        ),
    },
    {
        "documentId": "doc-aspirin",
        "userId": "eval-user",
        "type": "lab",
        "sourceFilename": "meds.txt",
        "text": (
            "Aspirin 81 mg daily is used for antiplatelet therapy. "
            "It should be taken with food to reduce stomach irritation."
        ),
    },
]

GOLD_QUERIES: list[dict[str, Any]] = [
    {
        "query": "what is the dose of metformin",
        "relevantDocs": ["doc-metformin"],
        "expected": "500 mg",
    },
    {
        "query": "lisinopril side effects",
        "relevantDocs": ["doc-lisinopril"],
        "expected": "dry cough",
    },
    {
        "query": "LDL cholesterol level",
        "relevantDocs": ["doc-lipid"],
        "expected": "142",
    },
    {
        "query": "aspirin dosage and food",
        "relevantDocs": ["doc-aspirin"],
        "expected": "81 mg",
    },
]
