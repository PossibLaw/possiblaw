---
name: calendar-coordination-playbook
description: Authoritative checklist for scheduling meetings — timezone collection, conflict avoidance, slot selection, and fallback proposals.
---
# Calendar Coordination Playbook

Follow these steps in order to propose suitable meeting time slots.

1. **Clarify meeting goal and required attendees** — Identify: the purpose of the meeting (client call, internal review, deposition prep, etc.), who must attend vs. who is optional, and the decision-maker or meeting host. A clearly stated goal determines how much scheduling flexibility is appropriate.

2. **Collect timezone information** — Determine each required attendee's timezone. Use stated locations as proxies if timezones are not explicit (e.g., "New York" → ET, "London" → GMT/BST, "Los Angeles" → PT). Default to US Eastern Time if completely unspecified.

3. **Determine duration** — Use the stated duration. Default to 30 minutes for a standard call, 60 minutes for a substantive review or client meeting, 90 minutes for a complex matter discussion or deposition prep.

4. **Identify scheduling constraints** — Collect any stated constraints: blackout dates, recurring conflicts (e.g., "Tuesdays are blocked"), preferred days/times, court dates, travel schedules. If no constraints are stated, assume standard business hours (Mon–Fri, 9 AM–5 PM local time).

5. **Check for conflicts with known events** — If the operator mentions existing commitments, exclude those windows. Note that this system cannot access live calendar data; flag this limitation in the Assumptions section of the output.

6. **Select up to 3 candidate slots** — Propose slots that: (a) fall within business hours for all required attendees, (b) respect stated constraints, (c) are spread across at least 2 different days where possible, and (d) give at least 24 hours notice from the current date. Prefer morning slots (9–11 AM) for important meetings; afternoon slots (2–4 PM) are generally acceptable for routine calls.

7. **Present times in all relevant timezones** — For each proposed slot, show the time in every required attendee's timezone to prevent confusion. Use 12-hour clock with AM/PM and timezone abbreviation (ET, PT, GMT, etc.).

8. **Provide a fallback instruction** — End the output with a brief note on how the host should communicate the selected slot to attendees (e.g., "Reply with your preferred option and we will send a calendar invitation to all attendees").
