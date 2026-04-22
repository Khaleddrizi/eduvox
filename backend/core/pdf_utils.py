"""
PDF text extraction and chunking utilities.
"""
from pathlib import Path
from typing import List

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    HAS_LANGCHAIN = True
except ImportError:
    RecursiveCharacterTextSplitter = None  # type: ignore[assignment, misc]
    HAS_LANGCHAIN = False


def extract_text_from_pdf(path: str | Path) -> str:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    import fitz  # PyMuPDF
    text_parts = []
    with fitz.open(path) as doc:
        for page in doc:
            text_parts.append(page.get_text("text"))
    return "\n".join(text_parts)


def extract_text_from_pdf_bytes(raw: bytes) -> str:
    if not raw:
        raise ValueError("Empty PDF content")
    import fitz  # PyMuPDF

    text_parts = []
    with fitz.open(stream=raw, filetype="pdf") as doc:
        for page in doc:
            text_parts.append(page.get_text("text"))
    return "\n".join(text_parts)


def chunk_text(text: str, chunk_size: int = 400, chunk_overlap: int = 50) -> List[str]:
    if HAS_LANGCHAIN and RecursiveCharacterTextSplitter is not None:
        splitter = RecursiveCharacterTextSplitter(  # type: ignore[call-arg]
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        return splitter.split_text(text)
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end].strip())
        start += chunk_size - chunk_overlap
    return [c for c in chunks if c]
