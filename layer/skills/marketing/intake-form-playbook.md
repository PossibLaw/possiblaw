---
name: intake-form-playbook
description: Authoritative checklist for designing a new-client intake form covering contact, matter details, conflicts, and privacy.
---
# Intake Form Playbook

Follow these steps in order to produce a complete, professional client intake form specification.

1. **Opening question** — Start with a single welcoming header question such as "How can we help you today?" or "What brings you to our firm?" This reduces friction and helps triage the matter type before detailed fields appear.

2. **Contact information section** — Collect: Full legal name (text, required), preferred name or alias (text, optional), email address (email, required), primary phone (phone, required), mailing address (textarea, optional). Include a field for preferred contact method (dropdown: email / phone / either).

3. **Matter type and description** — Include a matter-type dropdown (pre-populated with the firm's practice areas, e.g., Business Formation, Commercial Contracts, Employment, Litigation, Real Estate, Other). Below the dropdown, add a "Brief description of your matter" textarea (required, 500-character limit suggested).

4. **Urgency and timeline** — Ask: "Is there a deadline, court date, or urgent action required?" (radio: Yes / No). If Yes, show a date picker for the deadline and a text field for details. Urgency flags help the firm triage intake queue priority.

5. **Prior representation and case status** — Ask: "Have you previously worked with any attorney on this matter?" (radio: Yes / No / Not sure). If Yes, ask for prior attorney's name and firm (text, optional). Also ask: "Is there active litigation, a pending deadline, or a filed claim?" (radio: Yes / No / Not sure).

6. **Conflict-of-interest seed questions** — Include: "Are there other parties involved in this matter?" (radio: Yes / No). If Yes, collect names/entities (textarea). This enables an initial conflicts check before the first consultation. Note: the firm must run a full conflicts search internally.

7. **Referral source** — Ask: "How did you hear about us?" (dropdown: Client referral / Attorney referral / Online search / Social media / Legal directory / Other). Track referral sources for marketing attribution.

8. **Preferred consultation format** — Ask: "How would you like your initial consultation?" (dropdown: In-person / Phone / Video call / No preference). Include a field for preferred days/times (textarea, optional).

9. **Privacy notice and consent checkbox** — Display a privacy notice summarising how the firm collects, stores, and uses personal data (reference applicable law: GDPR for EU/UK clients, CCPA for California clients, general US state law otherwise). Include: "I have read and agree to the Privacy Policy" (checkbox, required). Add a link placeholder `[PRIVACY POLICY URL]`.

10. **Submit button and confirmation** — Label the submit button "Submit Intake Request." After submission, display a confirmation message: "Thank you — we have received your request and will be in touch within [X] business days." Replace [X] with the firm's actual response SLA.
