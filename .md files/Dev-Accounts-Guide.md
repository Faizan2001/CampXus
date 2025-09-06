# Dev Accounts: Simple Toggle Flow

This document explains how to create and manage developer (dev) accounts with a single toggle in Firestore, without changing user profile fields.

## What Counts as a Dev Account?

- Dev account emails MUST match this pattern:
  - `<anything>.dev@iub.edu.bd`
  - Examples: `john.dev@iub.edu.bd`, `a.b.dev@iub.edu.bd`
- Real users use normal `@iub.edu.bd` emails without `.dev` before the `@`.

## One Toggle to Control Dev Account Creation

- Document path: `admin/config`
- Field: `devAccountCreationEnabled` (Boolean)
- Behavior:
  - `true`: You can create new dev accounts (unverified) using `*.dev@iub.edu.bd`.
  - `false`: New dev account creation is blocked by Firestore Rules.
  - Existing dev accounts continue to work even when the toggle is `false`.

## Deploy Firestore Rules (once after pulling changes)

- Install CLI: `npm i -g firebase-tools`
- Login: `firebase login`
- Select project: `firebase use <your-project-id>`
- Deploy only rules: `firebase deploy --only firestore:rules`

You can also run `npm run firebase:deploy` to deploy hosting + rules if you prefer.

## Create/Update the Toggle Document

Using Firebase Console (recommended):

1. Open Firebase Console → Firestore Database → Data.
2. If the `admin` collection does not exist, click "Start collection" and set:
   - Collection ID: `admin`
   - Document ID: `config`
3. Add/Update the field:
   - Field: `devAccountCreationEnabled`
   - Type: Boolean
   - Value: `true` (turn ON when creating dev accounts)
4. After you finish creating dev accounts, set the same field to `false` to turn creation OFF.

## Create a Dev Account (when toggle is ON)

1. In the app, open the Sign Up form.
2. Use an email like `name.dev@iub.edu.bd`.
3. Choose a password and submit.
4. Sign in with the same email and password. Email verification is NOT required for dev accounts.
5. Flip the toggle OFF when you’re done creating dev accounts.

## Expected Behavior

- Real users (e.g., `student@iub.edu.bd`) must verify email to sign in.
- Dev users (`*.dev@iub.edu.bd`):
  - Can be created only while `devAccountCreationEnabled = true`.
  - After creation, they can still use the app when the toggle is OFF.
- If a new dev user attempts to sign in while the toggle is OFF:
  - Profile creation is blocked by rules and the app shows: "Dev account creation is disabled. Try again later."
  - No realtime listeners start; the user remains logged out.

## Troubleshooting

- "Missing or insufficient permissions" when creating a dev account:
  - Ensure the toggle doc `admin/config` exists and `devAccountCreationEnabled` is set to `true`.
  - Ensure the email matches `*.dev@iub.edu.bd` exactly (case-insensitive).
  - Confirm Firestore Rules are deployed (`firebase deploy --only firestore:rules`).
- Real user blocked despite being verified:
  - Check that the account’s email address is verified in Firebase Auth.
- Dev account cannot create profile while toggle ON:
  - Double-check the exact email format (must have `.dev` immediately before `@iub.edu.bd`).

## Security Notes

- Only project admins should update `admin/config`. Keep that document writable only via Console/Admin tooling.
- Client-side checks exist, but Firestore Rules enforce the toggle and email pattern server-side.

