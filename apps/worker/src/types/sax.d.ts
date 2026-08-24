declare module "sax" {
  interface ParserOptions {
    trim?: boolean;
    normalize?: boolean;
    lowercase?: boolean;
    xmlns?: boolean;
  }

  interface TagNode {
    name: string;
    attributes: Record<string, unknown>;
  }

  interface SaxParser {
    onopentag: ((node: TagNode) => void) | null;
    ontext: ((text: string) => void) | null;
    oncdata: ((text: string) => void) | null;
    onclosetag: ((tagName: string) => void) | null;
    onerror: ((error: Error) => void) | null;
    error: Error | null;
    resume(): void;
    write(xml: string): SaxParser;
    close(): SaxParser;
  }

  const sax: {
    parser(strict: boolean, options?: ParserOptions): SaxParser;
  };

  export = sax;
}
