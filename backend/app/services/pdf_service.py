from pathlib import Path
from pypdf import PdfReader


class PDFService:
    """Service responsible for extracting text from PDF contracts."""

    def extract_text(self, file_path: str) -> dict:
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {file_path}")

        reader = PdfReader(str(path))

        pages = []
        total_characters = 0

        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            text = self._clean_text(text)

            pages.append({
                "page": page_number,
                "text": text,
                "characters": len(text),
            })

            total_characters += len(text)

        full_text = "\n\n".join(
            page["text"] for page in pages if page["text"]
        )

        return {
            "page_count": len(reader.pages),
            "character_count": total_characters,
            "text": full_text,
            "pages": pages,
        }

    @staticmethod
    def _clean_text(text: str) -> str:
        lines = []

        for line in text.splitlines():
            line = " ".join(line.split())

            if line:
                lines.append(line)

        return "\n".join(lines)