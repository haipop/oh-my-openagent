export interface DocPageSection {
  readonly id: string
  readonly title: string
  readonly html: string
}

export interface DocPage {
  readonly lead: string
  readonly sections: readonly DocPageSection[]
}

const H2 = /^<h2>([\s\S]*?)<\/h2>/

function headingText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

/** GitHub's heading anchor, so `[Fix your PATH](#fix-your-path)` works on GitHub and on the site. */
export function headingId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-")
}

/** Splits a compiled standalone doc page into the text before its first `##` and one section per `##`. */
export function splitDocSections(html: string): DocPage {
  const [lead = "", ...parts] = html.split(/(?=<h2>)/)
  const sections = parts.map((part) => {
    const heading = H2.exec(part)
    if (!heading?.[1])
      throw new Error(`doc page section does not start with an h2: ${part.slice(0, 40)}`)
    const title = headingText(heading[1])
    return { id: headingId(title), title, html: part }
  })
  return { lead, sections }
}
