# Isolated attendance review demo

The owner requested a live demo before the next production push. The dedicated
frontend/attendance-demo entry builds separately from the production application.
It has synthetic staff/site records, guided location/photo steps, a sample
store setup with a fixed 50-metre radius, and an optional real-device capture mode
using the same location-first camera component. QR scanning is disabled. It does
not import the live authentication or RPC services, read production Vite
configuration, or connect to SNR/Supabase.

Photos, coordinates and records stay in React memory in that tab, reset on reload,
and are never sent to a server or persisted to localStorage. The sample mode uses
an explicit illustration and simulated location. Device mode requests camera
and location only after consent; set the demo store centre to your location first.
The camera opens only after a location within 50 metres is verified. Demo
validation is in the browser and does not demonstrate live server authorization
or activation.

## Build and review

From frontend: npm run demo:build, then npm run demo:preview. The static output is
frontend/attendance-demo-dist (ignored). Tests: npm run demo:test. The demo build
has no server Functions, service-worker, authentication settings or secrets.
It includes noindex/robots restrictions and headers denying page network requests
while permitting same-origin camera/location. Assets and fonts are self-hosted.

## Publish as a preview

Use an existing Cloudflare Pages project's non-production branch preview. Do not
deploy this output to its production branch or merge demo routes into the main
production build. No Supabase migration or production setting is needed.

Deployment requires a Cloudflare account ID, a securely bound API token with
Pages Edit access, and network access to api.cloudflare.com plus the resulting
preview hostname for verification. A successful deployment and a verified HTTPS
URL are required before describing the demo as live. The platform preview relay
is another option only when available in this session.

The demo source is available on main.
Pushing the code makes it available on GitHub; a separate preview
deployment is still required to provide a live demo URL.
