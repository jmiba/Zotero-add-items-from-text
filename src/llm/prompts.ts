export const EXTRACTION_PROMPT = `You are a bibliographic reference extraction expert. Analyze the following text and extract ALL literature references found within it.

For each reference, provide a structured JSON object with the following fields (use null for missing data):
- itemType: One of "journalArticle", "book", "bookSection", "conferencePaper", "thesis", "webpage", "report", "patent", "preprint"
- title: The title of the work
- authors: Array of objects with firstName and lastName
- date: Full publication date if available (YYYY-MM-DD format preferred)
- year: Publication year
- publicationTitle: Journal name for articles, or publisher for books
- journalAbbreviation: Abbreviated journal name if known
- volume: Volume number
- issue: Issue number
- pages: Page range (e.g., "123-145")
- DOI: Digital Object Identifier (without https://doi.org/ prefix)
- ISBN: International Standard Book Number
- ISSN: International Standard Serial Number
- url: Web URL if available
- publisher: Publisher name
- place: Place of publication
- edition: Edition number/description
- abstractNote: Abstract if provided
- language: Language of the work
- bookTitle: For book chapters, the title of the book
- conferenceName: For conference papers
- proceedingsTitle: Title of conference proceedings
- university: For theses
- thesisType: "PhD thesis", "Master's thesis", etc.

Respond with a JSON object containing:
1. "references": An array of reference objects
2. "bibtex": The same references formatted as valid BibTeX entries

Be thorough - extract every reference you can identify, even if some fields are missing. Use your knowledge to fill in standard abbreviations and correct obvious typos.

Text to analyze:
`;

export const VALIDATION_PROMPT = `You are a bibliographic data validator. Review the following extracted reference data and check for:

1. COMPLETENESS: Required fields for the item type
2. ACCURACY: Common errors in author names, dates, DOIs, ISBNs
3. CONSISTENCY: Format consistency across fields
4. SUGGESTIONS: Ways to improve the data quality

For each reference, provide:
- isValid: boolean
- errors: Array of critical issues that must be fixed
- warnings: Array of potential issues that should be reviewed
- suggestions: Array of improvements that could be made

Reference data to validate:
`;
