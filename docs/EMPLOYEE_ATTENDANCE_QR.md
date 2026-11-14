# Attendance QR

The current requirement is implemented by migration **0014**: a **common QR →
Employee sign-in → security attendance** flow with an HR-approved passkey and
fresh in-store photo/location evidence.

Personal bearer QR access from 0012/0013 is retired. Its tokens are preserved only
for historical references/receipts. Old personal links lead to the common sign-in
flow and cannot select an employee or record attendance without credentials.
Store QR remains disabled.

Use **SNR NEST sidebar → Attendance QR** to open the dedicated QR page without
employee tables. **Open display window** opens a separate QR window, or visit
`/attendance/qr` on the production hostname. All employees scan the same
link; their signed-in account determines their attendance. No credentials are
embedded in the QR. Creating an employee no longer issues an attendance credential.

See [Security attendance](SECURITY_ATTENDANCE.md) for the current access controls,
three/four random two-minute photo checks, supported devices, limitations, manual
migration/deployment steps, enrollment/HR approval and acceptance tests.

Migration **0015** adds supervised shared-device attendance. On the QR page, choose
**Open shared attendance device**. An HR-authorized guard opens this separate page.
The employee signs in privately, then the guard checks their staff ID/live photo
and confirms each action with a passkey. Both identities, site, location and
one-person turn are enforced on the server. The employee's temporary session and
photo clear after the turn; the guard's session stays separate. The common QR and
personal attendance passkey flow are unchanged.
