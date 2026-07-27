import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sourceDocx = join(repoRoot, "docs/hackathon/codedecay-submission.docx");
const publicDocx = join(repoRoot, "docs/public/hackathon/codedecay-submission.docx");

function readDocxMember(member: string): string {
  return execFileSync("unzip", ["-p", sourceDocx, member], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

describe("hackathon submission artifacts", () => {
  it("registers the submission in the public documentation catalog", () => {
    const output = execFileSync(
      "node",
      [
        "--input-type=module",
        "--eval",
        [
          "import { orderedPages, sectionTitles } from './scripts/lib/docs-pages.mjs';",
          "const path = 'hackathon/README.md';",
          "console.log(JSON.stringify({ included: orderedPages.includes(path), section: sectionTitles.get(path) }));"
        ].join("")
      ],
      { cwd: repoRoot, encoding: "utf8" }
    );

    expect(JSON.parse(output)).toEqual({ included: true, section: "Hackathon" });
  });

  it("ships a valid Google Docs-ready DOCX with stable layout and list restarts", () => {
    const archiveCheck = execFileSync("unzip", ["-t", sourceDocx], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const documentXml = readDocxMember("word/document.xml");
    const numberingXml = readDocxMember("word/numbering.xml");
    const stylesXml = readDocxMember("word/styles.xml");
    const titleStyle = stylesXml.match(
      /<w:style w:type="paragraph" w:styleId="Title">[\s\S]*?<\/w:style>/
    )?.[0];

    expect(archiveCheck).toContain("No errors detected");
    expect(documentXml).toContain("CodeDecay");
    expect(documentXml).toContain("Explicitly incomplete evidence");
    expect(documentXml).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(documentXml).toContain(
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"'
    );
    expect(documentXml).toContain('<w:tblW w:type="dxa" w:w="9360"/>');
    expect(documentXml).toContain('<w:gridCol w:w="2160"/>');
    expect(documentXml).toContain('<w:gridCol w:w="7200"/>');
    expect(documentXml).toContain('<w:tblHeader w:val="true"/>');
    expect(documentXml).not.toContain("<w:trHeight");
    expect(numberingXml.match(/<w:startOverride w:val="1"\/>/g)?.length).toBeGreaterThan(1);
    expect(numberingXml).toContain('<w:numFmt w:val="decimal"/>');
    expect(numberingXml).toContain('<w:lvlText w:val="%1."/>');
    expect(titleStyle).toBeDefined();
    expect(titleStyle).not.toContain("<w:pBdr>");
    expect(titleStyle).not.toMatch(/<w:u(?:\s|\/)/);
  });

  it("publishes the exact reviewed DOCX through the docs static asset path", () => {
    expect(readFileSync(publicDocx)).toEqual(readFileSync(sourceDocx));
  });
});
