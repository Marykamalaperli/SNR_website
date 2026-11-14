# Attendance QR

The current requirement is implemented by migration **0014**: a **common QR →
Employee sign-in → security attendance** flow with an HR-approved passkey and
fresh in-store photo/location evidence.

Personal bearer QR access from 0012/0013 is retired. Its tokens are preserved only
for historical references/receipts. Old personal links lead to the common sign-in
flow and cannot select an employee or record attendance without credentials.
Store QR remains disabled.

Use **Employees → Open attendance QR** to open the separate display window, or
visit `/attendance/qr` on the production hostname. All employees scan the same
link; their signed-in account determines their attendance. No credentials are
embedded in the QR. Creating an employee no longer issues an attendance credential.

See [Security attendance](SECURITY_ATTENDANCE.md) for the current access controls,
three/four random two-minute photo checks, supported devices, limitations, manual
migration/deployment steps, enrollment/HR approval and acceptance tests.
