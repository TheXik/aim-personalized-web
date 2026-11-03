// import.meta.glob, supported by Turbopack and Vitest. Only the eager form is used.
interface ImportMeta {
  glob<T = unknown>(pattern: string | string[], options: { eager: true; import?: string; query?: string }): Record<string, T>
}
