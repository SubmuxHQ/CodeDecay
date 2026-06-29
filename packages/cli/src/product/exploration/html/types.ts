export interface ParsedHtmlElement {
  rawAttributes: string;
  innerHtml: string;
}

export interface ParsedHtmlStartTag {
  tagName: string;
  rawAttributes: string;
  tagEnd: number;
  closing: boolean;
  selfClosing: boolean;
}
