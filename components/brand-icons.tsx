// Brand mark artwork sourced from simple-icons (https://simpleicons.org), which distributes
// its SVG icon data under the CC0 1.0 Universal license (see simple-icons/LICENSE.md).
// These marks are used strictly as "works with" indicators on the marketing page — they do
// not imply endorsement by, or affiliation with, Intuit (QuickBooks) or Google (Gmail).
// QuickBooks and Gmail remain trademarks of their respective owners.
import type { SVGProps } from 'react'

function BrandMark({ path, ...props }: SVGProps<SVGSVGElement> & { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d={path} />
    </svg>
  )
}

export function QuickBooksMark(props: SVGProps<SVGSVGElement>) {
  return (
    <BrandMark
      {...props}
      path="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm.642 4.1335c.9554 0 1.7296.776 1.7296 1.7332v9.0667h1.6c1.614 0 2.9275-1.3156 2.9275-2.933 0-1.6173-1.3136-2.9333-2.9276-2.9333h-.6654V7.3334h.6654c2.5722 0 4.6577 2.0897 4.6577 4.667 0 2.5774-2.0855 4.6666-4.6577 4.6666H12.642zM7.9837 7.333h3.3291v12.533c-.9555 0-1.73-.7759-1.73-1.7332V9.0662H7.9837c-1.6146 0-2.9277 1.316-2.9277 2.9334 0 1.6175 1.3131 2.9333 2.9277 2.9333h.6654v1.7332h-.6654c-2.5725 0-4.6577-2.0892-4.6577-4.6665 0-2.5771 2.0852-4.6666 4.6577-4.6666Z"
    />
  )
}

export function GmailMark(props: SVGProps<SVGSVGElement>) {
  return (
    <BrandMark
      {...props}
      path="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
    />
  )
}
