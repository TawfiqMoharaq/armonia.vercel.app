import re
from pathlib import Path

path = Path('backend/main.py')
text = path.read_text(encoding='utf-8')

system_prompt_replacement = (
    "SYSTEM_PROMPT = (\n"
    "    \"\\u0623\\u0646\\u062a \\u0645\\u062f\\u0631\\u0628 \\u0644\\u064a\\u0627\\u0642\\u0629 \\u0627\\u0641\\u062a\\u0631\\u0627\\u0636\\u064a \\u064a\\u062a\\u0643\\u0644\\u0645 \\u0628\\u0644\\u0647\\u062c\\u0629 \\u0633\\u0639\\u0648\\u062f\\u064a\\u0629 \\u0628\\u0633\\u064a\\u0637\\u0629. \"\n"
    "    \"\\u062d\\u0627\\u0641\\u0638 \\u0639\\u0644\\u0649 \\u0627\\u0644\\u0625\\u0631\\u0634\\u0627\\u062f\\u0627\\u062a \\u0639\\u0645\\u0644\\u064a\\u0629 \\u0648\\u0648\\u0627\\u0636\\u062d\\u0629 \\u062f\\u0648\\u0646 \\u062a\\u0634\\u062e\\u064a\\u0635 \\u0637\\u0628\\u064a. \"\n"
    "    \"\\u0630\\u0643\\u0651\\u0631 \\u0627\\u0644\\u0645\\u0633\\u062a\\u062e\\u062f\\u0645 \\u062f\\u0627\\u0626\\u0645\\u0627\\u064b \\u0628\\u0627\\u0644\\u0633\\u0644\\u0627\\u0645\\u0629 \\u0648\\u0627\\u0644\\u0625\\u062d\\u0645\\u0627\\u0621 \\u0648\\u0627\\u0644\\u062a\\u0648\\u0642\\u0641 \\u0625\\u0630\\u0627 \\u0632\\u0627\\u062f \\u0627\\u0644\\u0623\\u0644\\u0645. \"\n"
    "    \"\\u0644\\u0627 \\u062a\\u0643\\u0631\\u0631 \\u0646\\u0641\\u0633 \\u0627\\u0644\\u062c\\u0645\\u0644 \\u0648\\u0627\\u0642\\u062f\\u0651\\u0645 \\u062e\\u0637\\u0648\\u0627\\u062a \\u0645\\u062e\\u062a\\u0635\\u0631\\u0629 \\u0648\\u062f\\u0642\\u064a\\u0642\\u0629.\"\n"
    ")\n"
)
text = re.sub(r"SYSTEM_PROMPT = \([\s\S]*?\)\n", system_prompt_replacement, text, count=1)

text = re.sub(
    r"\s+lines = \[[\s\S]*?\]",
    "    lines = [\"\\u0633\\u064a\\u0627\\u0642 \\u0639\\u0636\\u0644\\u064a \\u0645\\u062e\\u062a\\u0635\\u0631:\"]",
    text,
    count=1,
)

text = re.sub(
    r"lines.append\([\s\S]*?percent\)%\"\n\s*\)",
    "        lines.append(\n            f\"- {muscle.muscle_ar} ({muscle.muscle_en}) | \\u0627\\u0644\\u0645\\u0646\\u0637\\u0642\\u0629: {muscle.region} | \\u0627\\u0644\\u0627\\u062d\\u062a\\u0645\\u0627\\u0644 \\u0627\\u0644\\u062a\\u0642\\u0631\\u064a\\u0628\\u064a: {percent}%\"\n        )",
    text,
    count=1,
)

fallback_replacement = (
    "def _fallback_message(user_message: str, youtube: str) -> str:\n"
    "    text = user_message.lower()\n"
    "    if \"\\u0633\\u0644\\u0627\\u0645\" in text:\n"
    "        prefix = \"\\u0648\\u0639\\u0644\\u064a\\u0643\\u0645 \\u0627\\u0644\\u0633\\u0644\\u0627\\u0645! \\u0627\\u0644\\u0633\\u064a\\u0631\\u0641\\u0631 \\u0645\\u0648 \\u0645\\u062a\\u0635\\u0644 \\u062d\\u0627\\u0644\\u064a\\u0627\\u064b.\"\n"
    "    elif \"?\" in user_message:\n"
    "        prefix = \"\\u0623\\u062f\\u0631\\u064a \\u0625\\u0646 \\u0639\\u0646\\u062f\\u0643 \\u0633\\u0624\\u0627\\u0644 \\u0645\\u0647\\u0645 \\u0628\\u0633 \\u0627\\u0644\\u062e\\u062f\\u0645\\u0629 \\u0645\\u062a\\u0648\\u0642\\u0641\\u0629 \\u0645\\u0624\\u0642\\u062a\\u0627\\u064b.\"\n"
    "    else:\n"
    "        prefix = \"\\u0627\\u0644\\u0639\\u0630\\u0631 \\u0648\\u0627\\u0644\\u0633\\u0645\\u0648\\u062d\\u0629\\u060c \\u0627\\u0644\\u062e\\u062f\\u0645\\u0629 \\u0645\\u062a\\u0648\\u0642\\u0641\\u0629 \\u0645\\u0624\\u0642\\u062a\\u0627\\u064b.\"\n"
    "    return f\"{prefix} \\u062a\\u0642\\u062f\\u0631 \\u062a\\u0634\\u0648\\u0641 \\u0627\\u0644\\u062a\\u0645\\u0631\\u064a\\u0646 \\u0627\\u0644\\u0645\\u0642\\u062a\\u0631\\u062d \\u0647\\u0646\\u0627: {youtube}\"\n"
)
text = re.sub(r"def _fallback_message[\s\S]*?return f\"\{prefix\}[\s\S]*?\n", fallback_replacement, text, count=1)

path.write_text(text, encoding='utf-8')
