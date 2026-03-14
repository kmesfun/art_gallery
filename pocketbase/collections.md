# PocketBase Collection Blueprint

## users (auth collection)
- email/password: default auth fields
- isAdmin: bool (default false)

## artworks
- title: text (required)
- imageUrl: url (optional)
- imageFile: file (optional)
- description: text
- basePrice: number (required, min 1)

Rules:
- List: ``
- View: ``
- Create: `@request.auth.isAdmin = true`
- Update: `@request.auth.isAdmin = true`
- Delete: `@request.auth.isAdmin = true`

## orders
- buyerName: text (required)
- buyerEmail: email (required)
- shippingAddress: text (required)
- items: json (required)
- total: number (required)

Rules:
- Create: ``
- List/View/Update/Delete: configure for admin-only as needed

## Notes
- The frontend signs in against `VITE_AUTH_COLLECTION` (default `users`).
- Collection names are configurable via `VITE_ARTWORK_COLLECTION` and `VITE_ORDERS_COLLECTION`.
- Do not use PocketBase superuser credentials in frontend code.
