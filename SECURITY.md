# Security policy

## Supported versions

Only the latest code on `main`, which is what runs at [hire-flow-opal-five.vercel.app](https://hire-flow-opal-five.vercel.app), receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub instead: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, the steps to reproduce it, and the impact you expect.

You can expect a first reply within 3 working days. Once a fix is released, you will be credited in the release notes unless you would rather stay anonymous.

## Scope

In scope:

- The web app, the API and the background worker in this repository
- Sign-in, roles, company data separation, file uploads and signed links

Out of scope:

- Denial of service and load testing against the live site
- Problems in Neon, Render or Vercel themselves, which should go to those providers
- Missing security headers on pages that hold no user data
