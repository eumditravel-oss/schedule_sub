# Schedule Engine Deterministic Rules — Checkpoint 3A

1. All effort and capacity are integer minutes.
2. UTC timestamps identify Actual facts; assigned employees' IANA timezones determine local capacity dates.
3. Canonical input JSON recursively sorts object keys and all domain collections use explicit stable order.
4. Identical canonical input plus engine version produces the same input fingerprint and byte-equivalent output.
5. Only `CONFIRMED FINISH_TO_START` dependencies affect calculation. PROPOSED, REJECTED, and DISABLED edges do not.
6. Self-reference, duplicate, cross-project edge, missing Task, negative lag, and cycle are never silently ignored.
7. Remaining effort priority is Primary/Temporary Primary EOD remaining → confirmed effort minus approved Actual → proposed effort minus approved Actual → baseline-duration fallback.
8. Support Actual remains an Actual contribution but is never subtracted again from authoritative Primary remaining.
9. Completed Actual is fixed. Future work never moves into a past interval.
10. Early completion releases a successor on the successor employee's first capacity after the Actual completion timestamp; no same-past-day placement is synthesized.
11. Capacity order is base policy → holiday → work override → leave/partial leave → company duty/capacity event → Actual consumption → approved overtime → Shadow allocation.
12. Missing Worklog is a data gap, not zero Actual, nonattendance, or automatic delay.
13. Collision order is Actual-started → Fixed/Milestone → manager project priority → official start → due date → WBS → Task ID.
14. FIXED_START is never moved to hide a conflict. FIXED_END overrun stays visible. MILESTONE consumes zero capacity.
15. Cross-project impact and pending overtime always require approval classification.
16. Project variance uses the calendar/timezone of the Task that determines Shadow project end.
17. No Actual trigger means official dates are preserved and the result is `NO_CHANGE`.
18. Engine code has no mutation path to Baseline, official Forecast, official dates, or progress.
19. Official source rows are hashed before calculation and after Shadow persistence. A mismatch is `OFFICIAL_FORECAST_MUTATION_DETECTED`.
20. Checkpoint 3A returns classifications only; it never applies a candidate.
