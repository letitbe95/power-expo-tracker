# Prompt: Translation & Vocabulary Mapping

This file defines the translation behavior and terminology mappings when generating digests in different languages (`zh`, `en`, or `bilingual`).

## 1. Professional Power Sector Glossary
Always translate technical industry terms accurately between English and Chinese. Do not use generic translations:

| English Term | Preferred Chinese Translation | Notes |
|---|---|---|
| Smart Grid | 智能电网 | Refers to automated distribution and transmission systems |
| UHV (Ultra High Voltage) | 特高压 | 1000kV AC or ±800kV DC systems |
| Transmission & Distribution | 输配电 | Often abbreviated as T&D |
| Distributed Energy | 分布式能源 | E.g. rooftop solar, localized power plants |
| Energy Storage System (ESS) | 储能系统 / 电化学储能 | Standard grid battery systems |
| Power Utilities | 电力公用事业 / 电网公司 | E.g. State Grid, Southern Power Grid |
| Substation | 变电站 / 开闭所 | Grid nodes |
| Switchgear | 开关柜 / 环网柜 | Power control equipment |
| SF6-Free (Sulfur Hexafluoride Free) | 无六氟化硫 / 绿色环保气体开关 | Crucial ESG grid technology trend |

## 2. Output Language Preferences
Inspect `config.language` from the input payload and apply the correct structure:

*   **"zh" (Default)**: The entire digest must be written in professional Chinese. Translate any English raw source metadata (e.g. EventsEye descriptions) using the glossary above.
*   **"en"**: The entire digest must be written in professional English. Translate any Chinese raw news headlines or descriptions into clean, technical English.
*   **"bilingual"**: Interleave English and Chinese **section-by-section** or **exhibition-by-exhibition**. 
    *   For each exhibition entry, present the English name, dates, location, and description block, followed by the Chinese translation block directly below it, sharing the exact same URL link.
    *   This is crucial: do not group all English at the top and Chinese at the bottom. Interleave them entry-by-entry for comparison.
