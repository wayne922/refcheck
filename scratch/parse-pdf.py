import os
from pypdf import PdfReader

pdf_path = "/Users/waynesullivan/Desktop/RefCheck_Candidex_Sprint_Plan_v2.pdf"
reader = PdfReader(pdf_path)

print(f"Total pages: {len(reader.pages)}")

full_text = ""
for i, page in enumerate(reader.pages):
    text = page.extract_text()
    full_text += f"\n--- PAGE {i+1} ---\n" + text

# Write full text to handoff-parsed.txt
output_path = "/Users/waynesullivan/.gemini/antigravity/scratch/refcheck/scratch/handoff-parsed.txt"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(full_text)

print("Parsed text written to scratch/handoff-parsed.txt")

# Find occurrences of Sprint 5
search_str = "Sprint 5"
idx = 0
while True:
    idx = full_text.find(search_str, idx)
    if idx == -1:
        break
    print(f"\n================ Match at Index {idx} ================")
    print(full_text[max(0, idx - 100): idx + 2000])
    idx += len(search_str)
