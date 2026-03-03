# Design tokens (FinBank / unified theme)

Use these **semantic** classes across the app so colours and typography stay consistent.

## Text
| Use | Class |
|-----|--------|
| Main body/headings | `text-foreground` |
| Labels, captions, secondary | `text-muted-foreground` |
| On primary buttons | `text-primary-foreground` |
| Errors | `text-destructive` |

## Backgrounds
| Use | Class |
|-----|--------|
| Page | `bg-background` |
| Cards, modals | `bg-card` |
| Subtle areas (e.g. empty states) | `bg-muted` |
| Primary buttons | `bg-primary` |

## Borders
| Use | Class |
|-----|--------|
| Default borders | `border-border` |

## Status (invoices, badges)
| Use | Class |
|-----|--------|
| Paid / success | `text-status-paid`, `bg-status-paid/10` |
| Overdue / danger | `text-status-overdue`, `bg-status-overdue/10` |
| Pending | `text-status-pending`, `bg-status-pending/10` |

## Auth pages
- Use `auth-page-bg` for the full-page background on Login, Signup, ForgotPassword, ResetPassword (warm cream/orange gradient matching logo).
- Buttons and links: `bg-primary`, `text-primary`, `text-primary-foreground` (logo coral/orange).

## Avoid
- Raw palette classes like `text-slate-600`, `bg-gray-100`, `text-blue-600`, `bg-indigo-600` — use the semantic tokens above so the app can be rethemed in one place.

## CSS variables (for inline / Recharts etc.)
- `var(--text-main)` — main text colour  
- `var(--text-muted)` — muted text  
- `var(--bg-main)` — page background  
- `var(--bg-card)` — card background  
- `var(--brand-primary)`, `var(--brand-secondary)` — teal brand
