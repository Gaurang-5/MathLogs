# MathLogs

MathLogs manages coaching-institute students and their participation in teaching batches while preserving each learner's history across changes in participation.

## Language

**Student**:
A learner's permanent identity within an institute, independent of the batches they attend. A student may participate in multiple batches at the same time.
_Avoid_: Batch student, registration

**Enrollment**:
A student's membership in one batch for a continuous period of participation. Each of a student's simultaneous batch memberships is a separate enrollment.
_Avoid_: Student profile, registration

**Ended Enrollment**:
An enrollment whose participation has stopped while the student and the student's history remain preserved. Ending an enrollment is distinct from deleting a mistaken student profile.
_Avoid_: Deleted student, removed student

**Re-enrollment**:
A teacher-authorized return of a known student to a batch. It takes effect without student review and preserves the student's permanent identity and earlier history.
_Avoid_: Registration, new student

**Fee Start Point**:
The teacher-selected month or applicable installment from which an enrollment begins accruing fees. It may precede the student's enrollment date, but it never recreates an existing paid or unpaid charge.
_Avoid_: Joining month, registration month
