# Verification of the world-map Eco integration

- 27 Python rule/HTTP tests passed.
- Frontend JavaScript syntax checks and Python compilation passed.
- Two complete automated world games reached final Steam Era scoring: 194 moves each; the second completed in 23.26 seconds after planner optimization.
- Automated games produced pollution and green points for multiple players and converted green points once at game end.
- Browser QA exercised new Eco game, world-map factory construction, Riga–Rotterdam shipping, selling a St Petersburg cotton mill, visible pollution 0→1, and the Clean Up confirmation with cost/action/discard.
- Existing world map JSON, board/tile configuration and background MP3 are byte-identical to the starting repository.
- Classic route remains the original proxy; the original external server was unavailable in the QA environment, so Classic end-to-end operation was not verified.
- Independent Eco base-rule parity with the original server has NOT been established. See the implementation choices in ECO_README_CN.md.
- Dedicated mobile and long-running multi-session load testing were not performed.
