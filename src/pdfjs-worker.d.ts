/// <reference types="vite/client" />

// Allow ?url imports for worker files
declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}
