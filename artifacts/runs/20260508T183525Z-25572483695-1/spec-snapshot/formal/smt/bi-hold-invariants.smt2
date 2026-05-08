; Booking / Inventory Hold invariant seed
; BI-INV-001 inspired check:
; confirmed + active_hold must not exceed total quantity.

(set-logic QF_LIA)

(declare-const total_quantity Int)
(declare-const confirmed_quantity Int)
(declare-const active_hold_quantity Int)

(assert (>= total_quantity 0))
(assert (>= confirmed_quantity 0))
(assert (>= active_hold_quantity 0))

; System invariant (must always hold).
(assert (<= (+ confirmed_quantity active_hold_quantity) total_quantity))

; Negated invariant. If solver returns unsat, the invariant is consistent.
(assert (> (+ confirmed_quantity active_hold_quantity) total_quantity))

(check-sat)
(exit)
