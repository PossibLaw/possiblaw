# NDA — Required Fact Template

Use this table when the matter type is an NDA (mutual or one-way). A field marked `NO DEFAULT` must come from the operator; gating on it is required if absent.

| Field | Why it matters | Acceptable inputs | Default if any |
| --- | --- | --- | --- |
| NDA type | Drives obligations symmetry, signature blocks, and recital language. | `mutual` or `one-way` (if `one-way`, also specify which party is the Disclosing Party) | `mutual` |
| Party A legal name | The agreement must name the contracting entity exactly; misnaming is a known enforceability defect. | Full registered legal name as it appears on formation documents | NO DEFAULT |
| Party A entity type | Determines signature authority block and references in recitals. | e.g. `Delaware C-corporation`, `California LLC`, `UK private limited company`, `individual` | NO DEFAULT |
| Party A jurisdiction of formation | Affects authority, capacity, and conflict-of-laws analysis. | State (US) or country | NO DEFAULT |
| Party B legal name | Same as Party A. | Full registered legal name | NO DEFAULT |
| Party B entity type | Same as Party A. | e.g. `Delaware C-corporation`, `individual` | NO DEFAULT |
| Party B jurisdiction of formation | Same as Party A. | State or country | NO DEFAULT |
| Permitted purpose | Defines and limits how the receiving party may use confidential information; an overbroad or vague purpose weakens the agreement. | Specific sentence describing the contemplated transaction, evaluation, or relationship | `evaluation of a potential business relationship between the parties` — apply only if the operator has confirmed the contemplated relationship is generic; otherwise NO DEFAULT |
| Effective date | Starts the term clock and frames pre-existing-information carve-outs. | ISO date `YYYY-MM-DD` | Date of full execution |
| Term length | Sets how long confidentiality obligations run for non-trade-secret information. | Number of years | `2 years` |
| Trade secret carve-out | Trade secret protection must run as long as the information qualifies as a trade secret under applicable law; a fixed term can extinguish trade secret protection. | `included` or `excluded` | `included` |
| Governing law | Controls interpretation and remedies; affects choice of forum and conflict rules. | US state or country | `Delaware` |
| Venue / exclusive forum | Determines where disputes are litigated. | Court system and seat (e.g. `state and federal courts located in Wilmington, Delaware`) | Matches governing law |
| Affiliate inclusion scope | Determines whether affiliates may receive confidential information and whether the disclosing party's affiliates are protected. | `parties only`, `parties and wholly-owned subsidiaries`, `parties and all affiliates` | `parties and wholly-owned subsidiaries` |
| Representatives clause | Controls who beyond the parties may see confidential information and on what terms. | List of permitted recipient categories (employees, contractors, advisors, counsel) | `employees, contractors, agents, advisors, and legal counsel with a need to know and bound by confidentiality obligations at least as protective as this Agreement` |
| Return / destruction obligation | Specifies what happens to confidential information on expiration or request; affects post-term risk. | `return`, `destroy`, `return or destroy at disclosing party's election`, `destroy with one archival copy for legal compliance` | `return or destroy at disclosing party's election, with one archival copy permitted for legal-compliance retention` |
| Residuals clause | Permits the receiving party to use unaided memory information; significantly weakens protection if included. | `included` or `excluded` | `excluded` |
| Equitable relief language | Confirms availability of injunctive relief; important because money damages are often inadequate for confidentiality breaches. | `included` or `excluded` | `included` |
| Signature authority | The signer must have actual or apparent authority for the named entity. | Name and title of authorized signatory for each party | NO DEFAULT |
| Notices addresses | Required for enforceable notice provisions and breach notifications. | Physical and/or email address for each party | NO DEFAULT for physical; email permitted as primary if operator confirms |
| Counterparty sensitivity | Determines whether additional protective terms (no-poach, standstill, etc.) should be raised. | `none flagged`, `competitor`, `regulated entity`, `government`, `other` (specify) | `none flagged` |
