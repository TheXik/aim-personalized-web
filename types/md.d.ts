// prompts/*.md are bundled as text by the Turbopack rule in next.config.ts.
declare module "*.md" {
  const text: string
  export default text
}
