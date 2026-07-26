const EXPLICIT_LINK_PATTERN = /^(?:https?:\/\/|mailto:|tel:|\/\/|\/|\.\/|\.\.\/|#)/i

/**
 * A rich-text link must carry an explicit protocol or an intentional
 * relative/hash prefix. Bare domain-like text is deliberately excluded so
 * decimal numbers such as 1.7 can never be inferred as links.
 */
export const isExplicitPresentationLink = (href: string) => {
  return EXPLICIT_LINK_PATTERN.test(href.trim())
}

const RICH_TEXT_ANCHOR_PATTERN = /<a\b([^>]*?)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a\s*>/gi

/**
 * Remove link wrappers that older editor versions created implicitly while
 * preserving their visible, formatted child content.
 */
export const stripImplicitRichTextLinks = (html: string) => {
  return html.replace(
    RICH_TEXT_ANCHOR_PATTERN,
    (anchor, _before, doubleQuotedHref, singleQuotedHref, unquotedHref, _after, children) => {
      const href = doubleQuotedHref ?? singleQuotedHref ?? unquotedHref ?? ''
      return isExplicitPresentationLink(href) ? anchor : children
    },
  )
}
