export async function textResult(value: string | Promise<string>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return {
    content: [
      {
        type: "text",
        text: await value
      }
    ]
  };
}
