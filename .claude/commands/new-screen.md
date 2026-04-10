# New Screen — PulseBox Dark Theme Template

Use this template for every new page, dialog, or component. All tokens include light + dark variants. No exceptions.

## Page shell

```tsx
<div className="p-6 space-y-6 max-w-5xl">
  {/* Header */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          Title
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Subtitle</p>
      </div>
    </div>
    {/* Action button (if any) */}
  </div>

  {/* Table */}
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <Table>
      <TableHeader className="bg-gray-100 dark:bg-gray-800">
        <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
          <TableHead className="text-gray-500 dark:text-gray-400">Column</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={N} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
              No items yet.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, i) => (
            <TableRow key={row.id} className={`border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}>
              <TableCell className="text-gray-900 dark:text-gray-100">{row.name}</TableCell>
              <TableCell className="text-gray-500 dark:text-gray-400 text-sm">{row.secondary}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>

  {/* Footnote */}
  <p className="text-xs text-gray-500 dark:text-gray-400">...</p>
</div>
```

## Token cheatsheet

| Element | Light | Dark |
|---------|-------|------|
| H1 | `text-gray-900` | `dark:text-gray-100` |
| Subtitle / secondary | `text-gray-500` | `dark:text-gray-400` |
| Muted text | `text-gray-400` | `dark:text-gray-500` |
| Icon | `text-blue-600` | `dark:text-blue-400` |
| Table border | `border-gray-200` | `dark:border-gray-700` |
| Table header bg | `bg-gray-100` | `dark:bg-gray-800` |
| Row even | `bg-white` | `dark:bg-gray-900` |
| Row odd | `bg-gray-50` | `dark:bg-gray-800/50` |
| Row hover | `hover:bg-gray-50` | `dark:hover:bg-gray-800/50` |
| Card bg | `bg-white` | `dark:bg-gray-900` |
| Card border | `border-gray-200` | `dark:border-gray-700` |
| Empty state bg | `bg-gray-50` | `dark:bg-gray-800/50` |
| Code/slug bg | `bg-gray-100` | `dark:bg-gray-800` |
| Code/slug text | `text-blue-600` | `dark:text-blue-400` |
| Info banner bg | `bg-blue-50` | `dark:bg-blue-950/40` |
| Info banner border | `border-blue-200` | `dark:border-blue-900` |
| Info banner text | `text-blue-700` | `dark:text-blue-400` |
| Button (outline) | `bg-white border-gray-200 text-gray-600` | `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300` |

## Checklist before submitting any new screen

- [ ] Every `h1` has `dark:text-gray-100`
- [ ] Every subtitle/secondary text has `dark:text-gray-400`
- [ ] Every `bg-white` has `dark:bg-gray-900`
- [ ] Every `bg-gray-50` has `dark:bg-gray-800/50`
- [ ] Every `border-gray-200` has `dark:border-gray-700`
- [ ] Every table header has `dark:bg-gray-800`
- [ ] Every empty state div has dark bg + border
- [ ] Every info/callout banner has dark bg + border + text
- [ ] Every outline button has dark bg + border + text

## Patterns to never use without dark: counterpart

```
bg-white          → always add dark:bg-gray-900
bg-gray-50        → always add dark:bg-gray-800/50
bg-gray-100       → always add dark:bg-gray-800
text-gray-900     → always add dark:text-gray-100
text-gray-700     → always add dark:text-gray-300
text-gray-600     → always add dark:text-gray-400
text-gray-500     → always add dark:text-gray-400
border-gray-200   → always add dark:border-gray-700
border-gray-100   → always add dark:border-gray-800
```
