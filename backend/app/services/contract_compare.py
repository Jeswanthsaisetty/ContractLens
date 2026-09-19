import difflib


class ContractCompareService:

    def compare(
        self,
        old_text: str,
        new_text: str
    ) -> dict:

        old_lines = old_text.splitlines()
        new_lines = new_text.splitlines()

        matcher = difflib.SequenceMatcher(
            None,
            old_lines,
            new_lines
        )

        changes = []

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():

            if tag == "equal":
                continue

            old_content = "\n".join(
                old_lines[i1:i2]
            )

            new_content = "\n".join(
                new_lines[j1:j2]
            )

            if tag == "replace":
                change_type = "modified"

            elif tag == "delete":
                change_type = "removed"

            elif tag == "insert":
                change_type = "added"

            else:
                change_type = tag

            changes.append({
                "change_type": change_type,
                "old_text": old_content,
                "new_text": new_content,
                "old_line_start": i1 + 1,
                "old_line_end": i2,
                "new_line_start": j1 + 1,
                "new_line_end": j2
            })

        return {
            "total_changes": len(changes),
            "changes": changes
        }