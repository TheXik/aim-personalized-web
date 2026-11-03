# Company tags prompt

The second prompt in this project. It does not run in the app. It ran twice per brief on 3 Nov 2026, through `gpt-5-mini-hiring` at reasoning effort low with structured output (`{ items: [{ index, companies }] }`), to make the `data/briefs/<reader>.tags.json` files. A tag was kept only when both runs returned it and it appears word for word in its item (headline, paragraphs or "what it means" line). Why and how well it worked: decision 6 in [docs/decisions.md](../docs/decisions.md).

The system prompt, verbatim:

```text
Tag each numbered item with the companies it names.
A company is a business, startup, investor or VC firm. Not a person, product, model, place or government agency.
Copy each name exactly as it is written in the item, character for character. Do not add companies the item does not name. An item can have no companies.
Return one entry per item, with its index.
```

The user message was one line per item: `[index]` followed by the item's headline, paragraphs and "what it means" line, with index the position in `recap.doc.items`.
